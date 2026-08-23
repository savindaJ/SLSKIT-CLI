import { CliError } from "../../core/errors.js";
import { logger } from "../../core/logger.js";
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
  const port = parsePort(options.port);

  await ensureSamCliInstalled();

  if (options.build !== false) {
    samBuild(cwd);
  }

  logger.info(`\nRunning "${manifest.name}" locally on a single API Gateway port.`);
  samLocalStartApi(cwd, port);
}
