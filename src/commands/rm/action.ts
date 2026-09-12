import fs from "node:fs";
import path from "node:path";
import { CliError } from "../../core/errors.js";
import { isInteractive } from "../../core/is-ci.js";
import { readManifest, writeManifest } from "../../core/environments.js";
import type { ProjectManifest as CoreManifest } from "../../core/environments.js";
import { logger } from "../../core/logger.js";
import { regenerateTemplates } from "../env/templates.js";
import { readProjectManifest, toInitAnswers, toServiceDefs } from "../function/manifest.js";
import { buildProjectManifest } from "../init/manifest.js";
import { planRemoval, pruneGeneratedFiles } from "./plan.js";
import type { RemovalPlan } from "./plan.js";
import { resolveRemovalTarget } from "./prompts.js";
import type { RmOptions } from "./types.js";

const COMMAND = "slskit rm";

function subject(plan: RemovalPlan): string {
  if (plan.kind === "service") {
    const count = plan.functionsRemoved.length;
    return `application "${plan.appName}" and its ${count} function${count === 1 ? "" : "s"}`;
  }

  return `function "${plan.functionName}" from application "${plan.appName}"`;
}

function describe(plan: RemovalPlan): void {
  logger.info(`\nAbout to remove ${subject(plan)}.`);

  for (const target of plan.paths) {
    logger.info(`  delete     ${target}`);
  }
  for (const route of plan.routes) {
    logger.info(`  drop route ${route}`);
  }

  logger.info("  update     slskit.json and every template that referenced it");

  if (plan.cascadesToService) {
    logger.info(
      `\nNote: "${plan.functionName}" is the last function in "${plan.appName}", so the application goes with it — a service template with no functions is not valid CloudFormation.`
    );
  }
}

export async function rmAction(options: RmOptions): Promise<void> {
  const root = process.cwd();
  const manifest = readProjectManifest(root, COMMAND);
  const answers = toInitAnswers(manifest);
  const apps = toServiceDefs(manifest);

  const target = await resolveRemovalTarget(manifest, options);
  const plan = planRemoval(answers, apps, target);

  describe(plan);

  if (!options.yes) {
    if (!isInteractive()) {
      throw new CliError(
        `Removing code cannot be undone. Re-run with --yes to remove ${subject(plan)}.`
      );
    }

    const { confirm } = await import("@inquirer/prompts");
    const proceed = await confirm({
      message: `Remove ${subject(plan)}?`,
      default: false,
    });

    if (!proceed) {
      logger.info("\nNothing was removed.");
      return;
    }
  }

  const deleted: string[] = [];
  for (const relative of plan.paths) {
    const full = path.join(root, relative);
    if (fs.existsSync(full)) {
      fs.rmSync(full, { recursive: true, force: true });
      deleted.push(relative);
    }
  }

  // The manifest is rebuilt from the pruned application list rather than edited in
  // place, so every derived section -- routes, services, directories, layer
  // attachments, the per-service template lists -- is regenerated consistently.
  const generatedFiles = pruneGeneratedFiles(manifest.structure?.files ?? [], plan.paths);

  writeManifest(
    root,
    buildProjectManifest(answers, plan.apps, generatedFiles, {
      version: manifest.version,
      environments: manifest.environments,
    }) as unknown as CoreManifest
  );

  const written = regenerateTemplates(root, readManifest(root, COMMAND));

  logger.info(`\nRemoved ${subject(plan)}.`);
  for (const relative of deleted) {
    logger.info(`  deleted    ${relative}`);
  }
  logger.info("  updated    slskit.json");
  if (written.length > 0) {
    logger.info(`  updated    ${written.length} template${written.length === 1 ? "" : "s"}`);
  }

  const remainingFunctions = plan.apps.reduce((count, app) => count + app.functions.length, 0);
  logger.info(
    `\n${plan.apps.length} application${plan.apps.length === 1 ? "" : "s"} and ${remainingFunctions} function${remainingFunctions === 1 ? "" : "s"} left.`
  );
  logger.info(
    'Deployed resources are not touched — run "slskit deploy <environment> --all" to remove them from AWS.'
  );
}
