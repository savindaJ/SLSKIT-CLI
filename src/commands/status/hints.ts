import type { DeployedFunction, FunctionStatus, StackHealth } from "./types.js";

export interface HintInput {
  environment: string;
  /** Every function the project declares, with whatever AWS returned for it. */
  functions: FunctionStatus[];
  /** Every Lambda carrying this environment's prefix, declared or not. */
  deployed: DeployedFunction[];
  /** Variable names this environment supplies, APP_ENVIRONMENT excluded. */
  declaredVariables: string[];
  /** First line of the error a missing secret produced, if one did. */
  secretError?: string;
  health: StackHealth;
  stackStatus: string;
}

function list(names: string[]): string {
  return names.map((name) => `"${name}"`).join(", ");
}

// Differences between what the project declares and what AWS actually has. These
// are hints, not CloudFormation drift detection: everything here is derived from a
// stack description and a function listing, so it costs two reads and no waiting.
export function buildHints(input: HintInput): string[] {
  const hints: string[] = [];
  const { environment } = input;

  if (input.health === "busy") {
    hints.push(
      `The stack is ${input.stackStatus}. What is reported below is mid-change and will move.`
    );
  }

  if (input.health === "failed") {
    hints.push(
      `The stack is ${input.stackStatus}, so the last deploy did not finish cleanly. The functions below may be the previous version.`
    );
  }

  if (input.secretError) {
    hints.push(`${input.secretError} The next deploy of "${environment}" will stop until it has a value.`);
  }

  const missing = input.functions.filter((fn) => !fn.deployed).map((fn) => fn.name);
  if (missing.length > 0) {
    hints.push(
      `${list(missing)} ${missing.length === 1 ? "is" : "are"} in slskit.json but not in the stack. Deploy: slskit deploy ${environment} --all`
    );
  }

  // The other direction: "slskit rm" only changes the project, so a function it
  // removed stays in AWS until a full deploy takes it out of the stack.
  const declared = new Set(input.functions.map((fn) => fn.physical));
  const orphans = input.deployed
    .filter((fn) => !declared.has(fn.name))
    .map((fn) => fn.name);

  if (orphans.length > 0) {
    hints.push(
      `${list(orphans)} ${orphans.length === 1 ? "is" : "are"} deployed but no longer in slskit.json. A full deploy removes ${orphans.length === 1 ? "it" : "them"}: slskit deploy ${environment} --all`
    );
  }

  const live = input.functions
    .map((fn) => fn.deployed)
    .filter((fn): fn is DeployedFunction => Boolean(fn));

  if (live.length > 0) {
    const absent = input.declaredVariables.filter((key) =>
      live.some((fn) => !fn.variableNames.includes(key))
    );

    if (absent.length > 0) {
      hints.push(
        `${list(absent)} ${absent.length === 1 ? "is" : "are"} set for "${environment}" but ${absent.length === 1 ? "has" : "have"} not reached the deployed functions. A variable is a template change: slskit deploy ${environment} --all`
      );
    }

    const declaredKeys = new Set(input.declaredVariables);
    const stale = [
      ...new Set(
        live.flatMap((fn) =>
          fn.variableNames.filter((key) => key !== "APP_ENVIRONMENT" && !declaredKeys.has(key))
        )
      ),
    ].sort();

    if (stale.length > 0) {
      hints.push(
        `${list(stale)} ${stale.length === 1 ? "is" : "are"} still set on the deployed functions but no longer declared for "${environment}". A full deploy clears ${stale.length === 1 ? "it" : "them"}.`
      );
    }
  }

  return hints;
}
