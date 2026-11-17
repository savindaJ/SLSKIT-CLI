import { spawnSync } from "node:child_process";
import { CliError } from "../../core/errors.js";
import { logger } from "../../core/logger.js";

const USE_SHELL = process.platform === "win32";

export function samLocalInvoke(
  cwd: string,
  resourceId: string,
  options: {
    template?: string;
    buildDir?: string;
    parameterOverrides: string[];
    eventPath?: string;
  }
): void {
  const args = ["local", "invoke", resourceId];

  if (options.template) {
    args.push("-t", options.template);
  }
  if (options.buildDir) {
    args.push("--build-dir", options.buildDir);
  }
  if (options.eventPath) {
    args.push("-e", options.eventPath);
  }
  if (options.parameterOverrides.length > 0) {
    args.push("--parameter-overrides", ...options.parameterOverrides);
  }

  const overrideNote =
    options.parameterOverrides.length > 0
      ? ` --parameter-overrides (${options.parameterOverrides.length} value${
          options.parameterOverrides.length === 1 ? "" : "s"
        })`
      : "";

  logger.info(`\n> sam local invoke ${resourceId}${overrideNote}`);

  const result = spawnSync("sam", args, {
    cwd,
    stdio: "inherit",
    shell: USE_SHELL,
  });

  if (result.error) {
    throw new CliError(`Failed to run sam local invoke: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new CliError(`sam local invoke exited with code ${result.status ?? 1}`);
  }
}