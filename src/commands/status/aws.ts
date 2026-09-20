import { spawnSync } from "node:child_process";
import type { DeployTarget } from "../deploy/sam-deploy.js";
import type { DeployedFunction, StackHealth, StackSummary } from "./types.js";

const USE_SHELL = process.platform === "win32";

// A stack that settled cleanly. Anything else is either still working or wants
// looking at, so the report can say which without listing every CloudFormation
// status by name.
const SETTLED = /_COMPLETE$/;
const IN_PROGRESS = /_IN_PROGRESS$/;
const ROLLED_BACK = /ROLLBACK|_FAILED$/;

export function stackHealth(status: string): StackHealth {
  // Checked before _COMPLETE: UPDATE_ROLLBACK_COMPLETE ends in both, and a rollback
  // is the more important half of that sentence.
  if (ROLLED_BACK.test(status)) {
    return "failed";
  }
  if (IN_PROGRESS.test(status)) {
    return "busy";
  }
  if (SETTLED.test(status)) {
    return "ok";
  }
  return "failed";
}

function targetArgs(target: DeployTarget): string[] {
  const args = ["--region", target.region];
  if (target.profile) {
    args.push("--profile", target.profile);
  }
  return args;
}

function awsJson(args: string[]): unknown | undefined {
  const result = spawnSync("aws", args, { encoding: "utf8", shell: USE_SHELL });

  if (result.error || result.status !== 0) {
    return undefined;
  }

  try {
    return JSON.parse(result.stdout) as unknown;
  } catch {
    return undefined;
  }
}

export interface StackLookup {
  summary?: StackSummary;
  /** Set when the stack could not be read at all — no stack, or no permission. */
  error?: string;
}

// Deliberately separate from deploy's stackExists, which only needs a yes or no:
// "what is deployed?" is mostly a question about the status string itself.
export function describeStack(target: DeployTarget): StackLookup {
  const result = spawnSync(
    "aws",
    [
      "cloudformation",
      "describe-stacks",
      "--stack-name",
      target.stackName,
      ...targetArgs(target),
      "--query",
      "Stacks[0].{status:StackStatus,reason:StackStatusReason,created:CreationTime,updated:LastUpdatedTime}",
      "--output",
      "json",
    ],
    { encoding: "utf8", shell: USE_SHELL }
  );

  if (result.error) {
    return { error: result.error.message };
  }

  if (result.status !== 0) {
    return { error: result.stderr?.trim() || `aws exited with code ${result.status ?? 1}` };
  }

  try {
    const parsed = JSON.parse(result.stdout) as {
      status?: string;
      reason?: string;
      created?: string;
      updated?: string;
    } | null;

    if (!parsed?.status) {
      return { error: "describe-stacks returned no stack status." };
    }

    return {
      summary: {
        status: parsed.status,
        reason: parsed.reason ?? undefined,
        createdAt: parsed.created ?? undefined,
        updatedAt: parsed.updated ?? undefined,
      },
    };
  } catch {
    return { error: "Could not parse the response from describe-stacks." };
  }
}

interface RawFunction {
  FunctionName?: string;
  Runtime?: string;
  MemorySize?: number;
  LastModified?: string;
  State?: string;
  Variables?: Record<string, string> | null;
}

// Asked of Lambda rather than CloudFormation on purpose: "slskit deploy --function"
// is a "sam sync --code" that updates the function without touching the stack, so
// CloudFormation's timestamps would report a code change that happened as no change
// at all.
//
// One call covers every function: filtering by the project's own prefix also finds
// Lambdas that AWS still has but the project no longer declares, which is the drift
// worth warning about.
export function listDeployedFunctions(
  target: DeployTarget,
  prefix: string
): DeployedFunction[] {
  // A JMESPath raw string literal, so the prefix never has to survive shell quoting.
  const filter = `Functions[?starts_with(FunctionName, '${prefix}')]`;
  const projection =
    "{FunctionName:FunctionName,Runtime:Runtime,MemorySize:MemorySize,LastModified:LastModified,State:State,Variables:Environment.Variables}";

  const parsed = awsJson([
    "lambda",
    "list-functions",
    ...targetArgs(target),
    "--query",
    `${filter}.${projection}`,
    "--output",
    "json",
  ]);

  if (!Array.isArray(parsed)) {
    return [];
  }

  return (parsed as RawFunction[])
    .filter((entry): entry is RawFunction & { FunctionName: string } =>
      Boolean(entry.FunctionName)
    )
    .map((entry) => ({
      name: entry.FunctionName,
      runtime: entry.Runtime,
      memorySize: entry.MemorySize,
      lastModified: entry.LastModified,
      state: entry.State,
      // Only the names are kept. The values are environment variables, which can be
      // secrets, and nothing in this command may be able to print one.
      variableNames: Object.keys(entry.Variables ?? {}).sort(),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
