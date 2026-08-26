import { CliError } from "../../core/errors.js";
import { logger } from "../../core/logger.js";
import {
  APP_ENVIRONMENT_KEY,
  readManifest as readProjectManifest,
  resolveEnvironmentName,
} from "../../core/environments.js";
import { parameterOverrides, toCliArguments } from "../env/parameters.js";
import { readManifest } from "./manifest.js";
import { ensureSamCliInstalled, samBuild, samLocalStartApi } from "./sam-cli.js";
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

export async function runAction(options: RunOptions): Promise<void> {
  const cwd = process.cwd();
  const manifest = readManifest(cwd);
  const project = readProjectManifest(cwd, "slskit run");
  const environment = resolveEnvironmentName(project, options.env);
  const port = parsePort(options.port);

  // Resolved before sam runs so a missing secret fails fast rather than after a build.
  const overrides = toCliArguments(parameterOverrides(cwd, project, environment));

  await ensureSamCliInstalled();

  if (options.build !== false) {
    samBuild(cwd);
  }

  logger.info(`\nRunning "${manifest.name}" locally on a single API Gateway port.`);
  logger.info(`  ${APP_ENVIRONMENT_KEY}=${environment}`);
  samLocalStartApi(cwd, port, overrides);
}
