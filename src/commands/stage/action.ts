import { CliError } from "../../core/errors.js";
import { logger } from "../../core/logger.js";
import {
  readManifest,
  requireStage,
  stageNames,
  writeManifest,
} from "../../core/manifest.js";
import { configureAction } from "../configure/action.js";
import { parseStage } from "../configure/prompts.js";
import { dotenvFileName } from "../env/dotenv.js";
import { regenerateTemplates } from "../env/templates.js";
import type { StageAddOptions, StageRemoveOptions } from "./types.js";

export async function stageListAction(): Promise<void> {
  const cwd = process.cwd();
  const manifest = readManifest(cwd, "slskit stage list");
  const names = stageNames(manifest);

  if (names.length === 0) {
    logger.info('\nThis project has no stages yet. Run "slskit configure" to set one up.');
    return;
  }

  const defaultStage = manifest.deployment?.defaultStage;
  logger.info(`\nStages for "${manifest.name}":\n`);

  for (const name of names) {
    const config = requireStage(manifest, name);
    const marker = name === defaultStage ? "*" : " ";
    const vars = Object.keys(config.env ?? {}).length;

    logger.info(`${marker} ${name}`);
    logger.info(`    region:    ${config.region}`);
    logger.info(`    profile:   ${config.profile ?? "(environment)"}`);
    logger.info(`    stack:     ${config.stackName}`);
    logger.info(`    variables: ${vars}`);
  }

  logger.info("\n* default stage");
}

// A stage is just a configured deploy target, so adding one runs the same flow as
// "slskit configure --stage <name>" rather than duplicating credential handling.
export async function stageAddAction(
  name: string,
  options: StageAddOptions
): Promise<void> {
  const cwd = process.cwd();
  const manifest = readManifest(cwd, "slskit stage add");
  const stage = parseStage(name);

  if (!stage) {
    throw new CliError("A stage name is required.");
  }

  if (manifest.deployment?.stages?.[stage]) {
    throw new CliError(
      `Stage "${stage}" already exists. Use "slskit configure --stage ${stage}" to change it.`
    );
  }

  await configureAction({ ...options, stage });
}

export async function stageUseAction(name: string): Promise<void> {
  const cwd = process.cwd();
  const manifest = readManifest(cwd, "slskit stage use");
  const stage = parseStage(name);

  if (!stage) {
    throw new CliError("A stage name is required.");
  }

  requireStage(manifest, stage);

  writeManifest(cwd, {
    ...manifest,
    deployment: {
      defaultStage: stage,
      stages: manifest.deployment?.stages ?? {},
    },
  });

  logger.info(`\nDefault stage is now "${stage}".`);
}

export async function stageRemoveAction(
  name: string,
  options: StageRemoveOptions
): Promise<void> {
  const cwd = process.cwd();
  const manifest = readManifest(cwd, "slskit stage remove");
  const stage = parseStage(name);

  if (!stage) {
    throw new CliError("A stage name is required.");
  }

  const config = requireStage(manifest, stage);
  const remaining = stageNames(manifest).filter((existing) => existing !== stage);

  if (!options.yes) {
    if (!process.stdin.isTTY) {
      throw new CliError(
        `Removing a stage cannot be undone. Re-run with --yes to remove "${stage}".`
      );
    }

    const { confirm } = await import("@inquirer/prompts");
    const vars = Object.keys(config.env ?? {}).length;
    const proceed = await confirm({
      message: `Remove stage "${stage}" and its ${vars} variable(s) from sless.json?`,
      default: false,
    });

    if (!proceed) {
      logger.info("\nNothing was removed.");
      return;
    }
  }

  const stages = { ...manifest.deployment?.stages };
  delete stages[stage];

  const wasDefault = manifest.deployment?.defaultStage === stage;

  writeManifest(cwd, {
    ...manifest,
    deployment: {
      defaultStage: wasDefault ? remaining[0] ?? stage : manifest.deployment!.defaultStage,
      stages,
    },
  });

  const updated = readManifest(cwd, "slskit stage remove");
  const written = regenerateTemplates(cwd, updated);

  logger.info(`\nRemoved stage "${stage}".`);
  if (wasDefault && remaining.length > 0) {
    logger.info(`  default stage is now "${remaining[0]}"`);
  }
  logger.info(
    `  ${dotenvFileName(stage)} was left in place — delete it yourself if you no longer need those secrets.`
  );
  if (written.length > 0) {
    logger.info(`  regenerated ${written.length} template(s)`);
  }
}
