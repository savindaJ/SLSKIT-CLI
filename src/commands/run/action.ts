import type { ChildProcess } from "node:child_process";
import { CliError } from "../../core/errors.js";
import { logger } from "../../core/logger.js";
import {
  APP_ENVIRONMENT_KEY,
  readManifest as readProjectManifest,
  resolveEnvironmentName,
} from "../../core/environments.js";
import type { ProjectManifest } from "../../core/environments.js";
import { parameterOverrides, toCliArguments } from "../env/parameters.js";
import { syncTemplates } from "../env/templates.js";
import { readManifest } from "./manifest.js";
import {
  ensureSamCliInstalled,
  samBuild,
  samBuildResource,
  samRebuild,
  startLocalApi,
} from "./sam-cli.js";
import { describeChange, watchProject } from "./watch.js";
import type { ApplicationView } from "./resources.js";
import type { RunOptions } from "./types.js";

const DEFAULT_PORT = 3000;

function parsePort(value: RunOptions["port"]): number {
  if (value === undefined) {
    return DEFAULT_PORT;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new CliError(`Invalid port "${value}".`);
  }

  return parsed;
}

function applicationsOf(manifest: ProjectManifest): ApplicationView[] {
  return (manifest.applications as ApplicationView[] | undefined) ?? [];
}

// One shared API Gateway means a single flat template, so a function is addressed
// without its application's stack prefix.
function sharesOneApi(manifest: ProjectManifest): boolean {
  const api = manifest.apiGateway as { perService?: boolean } | undefined;
  return api?.perService === false;
}

function syncAndResolve(cwd: string, environment: string): string[] {
  const project = readProjectManifest(cwd, "slskit run");

  // A variable can appear just by being typed into a .env file, so the templates are
  // brought back in step before sam reads them.
  const rewritten = syncTemplates(cwd, project);
  if (rewritten.length > 0) {
    logger.info(`Updated ${rewritten.length} template(s) for the current variables.`);
  }

  return toCliArguments(parameterOverrides(cwd, project, environment));
}

function exited(child: ChildProcess): Promise<{ code: number | null; signal: string | null }> {
  return new Promise((resolve) => {
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
}

export async function runAction(options: RunOptions): Promise<void> {
  const cwd = process.cwd();
  const manifest = readManifest(cwd);
  const project = readProjectManifest(cwd, "slskit run");
  const environment = resolveEnvironmentName(project, options.env);
  const port = parsePort(options.port);

  // Resolved before sam runs so a missing secret fails fast rather than after a build.
  let overrides = syncAndResolve(cwd, environment);

  await ensureSamCliInstalled();

  if (options.build !== false) {
    samBuild(cwd);
  }

  logger.info(`\nRunning "${manifest.name}" locally on a single API Gateway port.`);
  logger.info(`  ${APP_ENVIRONMENT_KEY}=${environment}`);
  logger.info(
    `Every application's routes are served from one local API at http://127.0.0.1:${port}`
  );

  const watching = options.watch !== false;
  if (watching) {
    logger.info("Watching src/ — save a file and only that function is rebuilt.");
  }
  logger.info("Press Ctrl+C to stop.\n");

  let child = startLocalApi(cwd, port, overrides);
  let stopping = false;
  let restarting = false;

  // Anything a save triggers has to survive a broken file: a rebuild that fails
  // leaves the previous build serving and waits for the next save.
  const rebuildFunctions = (resourceIds: string[], labels: string[]): void => {
    logger.info(`\n> ${describeChange(labels)} changed — rebuilding`);

    for (const resourceId of resourceIds) {
      if (!samBuildResource(cwd, resourceId)) {
        logger.error(`Build failed for ${resourceId}. Fix it and save again.`);
        return;
      }
    }

    logger.info("Rebuilt. The next request uses the new code.\n");
  };

  const rebuildAll = (labels: string[]): void => {
    logger.info(`\n> ${describeChange(labels)} changed — rebuilding everything`);

    if (!samRebuild(cwd)) {
      logger.error("Build failed. Fix it and save again.");
      return;
    }

    logger.info("Rebuilt. The next request uses the new code.\n");
  };

  // Routes and parameter values are only read when sam starts, so these changes
  // cannot be picked up by swapping an artifact.
  const restart = (labels: string[]): void => {
    logger.info(`\n> ${describeChange(labels)} changed — restarting the local API`);

    let next: string[];
    try {
      next = syncAndResolve(cwd, environment);
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      return;
    }

    if (!samRebuild(cwd)) {
      logger.error("Build failed. Fix it and save again.");
      return;
    }

    overrides = next;
    restarting = true;
    child.kill("SIGINT");
  };

  const watcher = watching
    ? watchProject(
        cwd,
        applicationsOf(project),
        {
          onFunctions: rebuildFunctions,
          onFull: rebuildAll,
          onRestart: restart,
        },
        sharesOneApi(project)
      )
    : undefined;

  const stop = (): void => {
    if (stopping) {
      return;
    }
    stopping = true;
    watcher?.close();
    child.kill("SIGINT");
  };

  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  try {
    for (;;) {
      const { code, signal } = await exited(child);

      if (stopping) {
        return;
      }

      if (restarting) {
        restarting = false;
        child = startLocalApi(cwd, port, overrides);
        continue;
      }

      if (signal) {
        return;
      }

      if (code !== 0) {
        throw new CliError(`sam local start-api exited with code ${code ?? 1}`);
      }

      return;
    }
  } finally {
    watcher?.close();
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}
