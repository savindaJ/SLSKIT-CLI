import { getContext } from "../../core/context.js";
import { resolveAwsProfile } from "../../core/credentials.js";
import { CliError } from "../../core/errors.js";
import { logger } from "../../core/logger.js";
import {
  functionNameFor,
  readManifest,
  requireEnvironment,
  resolveEnvironmentName,
  stackNameFor,
} from "../../core/environments.js";
import type { ProjectManifest } from "../../core/environments.js";
import { applicationsOf } from "../../core/scope.js";
import { isAwsCliAvailable } from "../configure/aws-cli.js";
import { stackOutputs } from "../deploy/sam-deploy.js";
import type { DeployTarget } from "../deploy/sam-deploy.js";
import { environmentEnvKeys } from "../env/keys.js";
import { parameterOverrides } from "../env/parameters.js";
import { describeStack, listDeployedFunctions, stackHealth } from "./aws.js";
import { buildHints } from "./hints.js";
import { formatReport } from "./format.js";
import type { DeployedFunction, FunctionStatus, StatusOptions, StatusReport } from "./types.js";

// Every function the project declares, paired with the Lambda AWS returned for it.
// Built from the manifest rather than from the listing, so a function that was never
// deployed still appears — as the thing that is missing.
function pairFunctions(
  manifest: ProjectManifest,
  environment: string,
  deployed: DeployedFunction[]
): FunctionStatus[] {
  const byName = new Map(deployed.map((fn) => [fn.name, fn]));

  return applicationsOf(manifest).flatMap((app) =>
    (app.functions ?? []).map((fn) => {
      const physical = functionNameFor(manifest.name, environment, fn.name);
      return {
        name: fn.name,
        service: app.name,
        physical,
        deployed: byName.get(physical),
      };
    })
  );
}

// Run for its error only. The same resolution a deploy does, so a secret with no
// value shows up here as a hint rather than as a failed deploy later.
function secretError(
  cwd: string,
  manifest: ProjectManifest,
  environment: string
): string | undefined {
  try {
    parameterOverrides(cwd, manifest, environment);
    return undefined;
  } catch (error) {
    const message = error instanceof CliError ? error.message : String(error);
    return message.split("\n")[0];
  }
}

function readStack(target: DeployTarget, environment: string): StatusReport["stack"] {
  const { summary, error } = describeStack(target);

  if (summary) {
    return summary;
  }

  // CloudFormation reports a missing stack as a ValidationError, which is a
  // different conversation from a credential or permission problem.
  if (/does not exist/i.test(error ?? "")) {
    throw new CliError(
      `Nothing is deployed for environment "${environment}" yet.\n  stack:   ${target.stackName}\n  region:  ${target.region}\n\nDeploy it: slskit deploy ${environment} --all`
    );
  }

  throw new CliError(
    `Could not read stack "${target.stackName}" in ${target.region}.\n  ${error ?? "describe-stacks failed."}\n\nCheck the credentials for this environment: slskit doctor --env ${environment}`
  );
}

export async function statusAction(options: StatusOptions): Promise<void> {
  const cwd = process.cwd();
  const manifest = readManifest(cwd, "slskit status");
  const environment = resolveEnvironmentName(manifest, options.env);
  const config = requireEnvironment(manifest, environment);

  if (!config.region) {
    throw new CliError(
      `Environment "${environment}" has no AWS region, so there is nothing to look up.\nRun: slskit configure --env ${environment}`
    );
  }

  if (!isAwsCliAvailable()) {
    throw new CliError(
      "The AWS CLI is required to read what is deployed.\nInstall it, then re-run. Check the rest of the toolchain with: slskit doctor"
    );
  }

  const { profile } = resolveAwsProfile({ flag: options.profile, stored: config.profile });
  const target: DeployTarget = {
    stackName: config.stackName,
    region: config.region,
    profile,
  };

  const stack = readStack(target, environment);
  const health = stackHealth(stack.status);

  // Every Lambda carrying this environment's prefix, which is a superset of what the
  // project declares — the difference is what the hints are made of.
  const deployed = listDeployedFunctions(target, `${stackNameFor(manifest.name, environment)}-`);
  const functions = pairFunctions(manifest, environment, deployed);

  const report: StatusReport = {
    project: manifest.name,
    environment,
    stackName: target.stackName,
    region: target.region,
    profile,
    health,
    stack,
    endpoints: stackOutputs(target),
    functions,
    hints: buildHints({
      environment,
      functions,
      deployed,
      declaredVariables: environmentEnvKeys(cwd, manifest, environment),
      secretError: secretError(cwd, manifest, environment),
      health,
      stackStatus: stack.status,
    }),
  };

  if (getContext().json) {
    // logger.info is silenced under --json, so the report is written directly and is
    // the only thing on stdout.
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    logger.info(`\n${formatReport(report)}\n`);
  }

  // A rollback or a failed update is reported rather than thrown — the report above
  // is the useful part — but it must not look like success to a script.
  if (health === "failed") {
    process.exitCode = 1;
  }
}
