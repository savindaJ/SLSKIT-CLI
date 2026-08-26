import { spawnSync } from "node:child_process";
import { CliError } from "../../core/errors.js";
import { logger } from "../../core/logger.js";
import type { StackOutput } from "./types.js";

const USE_SHELL = process.platform === "win32";

export interface DeployTarget {
  stackName: string;
  region: string;
  profile?: string;
}

// Nested stacks are AWS::Serverless::Application, which CloudFormation will only
// expand when this capability is granted; without it the deploy fails outright.
const CAPABILITIES = ["CAPABILITY_IAM", "CAPABILITY_AUTO_EXPAND"];

function targetArgs(target: DeployTarget): string[] {
  const args = ["--stack-name", target.stackName, "--region", target.region];
  if (target.profile) {
    args.push("--profile", target.profile);
  }
  return args;
}

export function samDeploy(
  cwd: string,
  target: DeployTarget,
  parameterOverrides: string[],
  guided: boolean
): void {
  const args = ["deploy", ...targetArgs(target), "--capabilities", ...CAPABILITIES];

  if (guided) {
    args.push("--guided");
  } else {
    // Creates and reuses a managed bucket so a first deploy needs no manual setup,
    // and an unchanged stack is a success rather than an error.
    args.push("--resolve-s3", "--no-confirm-changeset", "--no-fail-on-empty-changeset");
  }

  if (parameterOverrides.length > 0) {
    args.push("--parameter-overrides", parameterOverrides.join(" "));
  }

  // Values are deliberately not logged: overrides carry secrets.
  const overrideNote =
    parameterOverrides.length > 0
      ? ` --parameter-overrides (${parameterOverrides.length} value${parameterOverrides.length === 1 ? "" : "s"})`
      : "";

  logger.info(
    `\n> sam deploy --stack-name ${target.stackName} --region ${target.region}${
      target.profile ? ` --profile ${target.profile}` : ""
    }${overrideNote}\n`
  );

  const result = spawnSync("sam", args, { cwd, stdio: "inherit", shell: USE_SHELL });

  if (result.error) {
    throw new CliError(`Failed to run sam deploy: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new CliError(`sam deploy exited with code ${result.status ?? 1}`);
  }
}

// Read back through the AWS CLI rather than parsing sam's output, which changes
// shape between versions.
export function stackOutputs(target: DeployTarget): StackOutput[] {
  const args = [
    "cloudformation",
    "describe-stacks",
    "--stack-name",
    target.stackName,
    "--region",
    target.region,
    "--query",
    "Stacks[0].Outputs",
    "--output",
    "json",
  ];

  if (target.profile) {
    args.push("--profile", target.profile);
  }

  const result = spawnSync("aws", args, { encoding: "utf8", shell: USE_SHELL });

  if (result.error || result.status !== 0) {
    return [];
  }

  try {
    const parsed = JSON.parse(result.stdout) as
      | { OutputKey?: string; OutputValue?: string; Description?: string }[]
      | null;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((entry) => entry.OutputKey && entry.OutputValue)
      .map((entry) => ({
        key: entry.OutputKey as string,
        value: entry.OutputValue as string,
        description: entry.Description,
      }));
  } catch {
    return [];
  }
}
