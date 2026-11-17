import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { CliError } from "../../core/errors.js";
import { logger } from "../../core/logger.js";
import type { DeployTarget } from "../deploy/sam-deploy.js";

const USE_SHELL = process.platform === "win32";

function targetArgs(target: DeployTarget): string[] {
  const args = ["--region", target.region];
  if (target.profile) {
    args.push("--profile", target.profile);
  }
  return args;
}

export function awsLambdaInvoke(
  functionName: string,
  target: DeployTarget,
  options: { eventPath?: string; outFile?: string }
): void {
  const outFile = options.outFile ?? path.join(process.cwd(), ".slskit-invoke-response.json");
  const args = [
    "lambda",
    "invoke",
    "--function-name",
    functionName,
    ...targetArgs(target),
    "--cli-binary-format",
    "raw-in-base64-out",
    "--log-type",
    "Tail",
  ];

  if (options.eventPath) {
    args.push("--payload", `fileb://${options.eventPath}`);
  } else {
    args.push("--payload", "{}");
  }

  args.push(outFile);

  logger.info(`\n> aws ${args.join(" ")}`);

  const result = spawnSync("aws", args, { encoding: "utf8", shell: USE_SHELL });

  if (result.error) {
    throw new CliError(`Failed to run aws lambda invoke: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const detail = result.stderr?.trim() || `aws lambda invoke exited with code ${result.status}`;
    throw new CliError(detail);
  }

  let metadata: { StatusCode?: number; FunctionError?: string; LogResult?: string } = {};
  try {
    metadata = JSON.parse(result.stdout) as typeof metadata;
  } catch {
    // stdout may be empty when the CLI writes metadata elsewhere; response body is in outFile.
  }

  if (metadata.FunctionError) {
    logger.info(`\nInvocation returned FunctionError: ${metadata.FunctionError}`);
  }

  if (metadata.LogResult) {
    const logs = Buffer.from(metadata.LogResult, "base64").toString("utf8");
    if (logs.trim()) {
      logger.info("\n--- Lambda logs ---\n" + logs);
    }
  }

  if (fs.existsSync(outFile)) {
    const body = fs.readFileSync(outFile, "utf8");
    if (body.trim()) {
      logger.info("\n--- Response ---\n" + body);
    }
  }
}