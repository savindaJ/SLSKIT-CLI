import { CliError } from "../../core/errors.js";
import { logger } from "../../core/logger.js";
import {
  APP_ENVIRONMENT_KEY,
  functionNameFor,
  readManifest,
  requireEnvironment,
  resolveEnvironmentName,
} from "../../core/environments.js";
import type { ProjectManifest } from "../../core/environments.js";
import { getCallerIdentity, isAwsCliAvailable } from "../configure/aws-cli.js";
import { parameterOverrides, toCliArguments } from "../env/parameters.js";
import { syncTemplates } from "../env/templates.js";
import { ensureSamCliInstalled, samBuild } from "../run/sam-cli.js";
import { samDeploy, samSyncCode, stackExists, stackOutputs } from "./sam-deploy.js";
import { applicationsOf, resolveDeployScope, resourceIdsFor } from "./scope.js";
import type { DeployScope } from "./scope.js";
import type { DeployOptions } from "./types.js";

// The physical Lambda names the deploy will touch, so the plan names real AWS
// resources rather than template logical ids.
function plannedFunctionNames(
  manifest: ProjectManifest,
  environment: string,
  scope: DeployScope
): string[] {
  return applicationsOf(manifest)
    .filter((app) => scope.kind === "all" || app.name === scope.service)
    .flatMap((app) => app.functions ?? [])
    .filter((fn) => scope.kind !== "function" || fn.name === scope.functionName)
    .map((fn) => functionNameFor(manifest.name, environment, fn.name));
}

async function confirmDeploy(
  manifest: ProjectManifest,
  environment: string,
  stackName: string,
  region: string,
  functionNames: string[],
  scope: DeployScope
): Promise<boolean> {
  logger.info(`\nAbout to deploy ${scope.label} of "${manifest.name}" to AWS.`);
  logger.info(`  ${APP_ENVIRONMENT_KEY}: ${environment}`);
  logger.info(`  stack:       ${stackName}`);
  logger.info(`  region:      ${region}`);
  logger.info(`  functions:   ${functionNames.length}`);
  for (const name of functionNames) {
    logger.info(`    ${name}`);
  }

  logger.info(
    scope.kind === "all"
      ? "\nThis creates real AWS resources in your account and they cost money."
      : "\nThis updates the code of those functions in the stack that is already deployed."
  );

  const { confirm } = await import("@inquirer/prompts");
  return confirm({ message: `Deploy to "${environment}"?`, default: false });
}

export async function deployAction(options: DeployOptions): Promise<void> {
  const cwd = process.cwd();
  const manifest = readManifest(cwd, "slskit deploy");
  const environment = resolveEnvironmentName(manifest, options.env);
  const config = requireEnvironment(manifest, environment);

  if (!config.region) {
    throw new CliError(
      `Environment "${environment}" has no AWS region yet.\nRun: slskit configure --env ${environment}`
    );
  }

  const target = {
    stackName: config.stackName,
    region: config.region,
    profile: config.profile,
  };

  // A variable can appear just by being typed into a .env file, so the templates are
  // brought back in step before anything is uploaded.
  const rewritten = syncTemplates(cwd, manifest);
  if (rewritten.length > 0) {
    logger.info(`Updated ${rewritten.length} template(s) for the current variables.`);
  }

  // Resolved before anything runs so a missing secret fails here, not mid-deploy.
  const overrides = toCliArguments(parameterOverrides(cwd, manifest, environment));

  // Checked before anything slower: without --yes a non-interactive deploy can
  // never proceed, so that is the most useful thing to say first.
  if (!options.yes && !process.stdin.isTTY) {
    throw new CliError(
      `Deploying creates real AWS resources. Re-run with --yes to deploy "${environment}" non-interactively.`
    );
  }

  const scope = await resolveDeployScope(manifest, options);
  const functionNames = plannedFunctionNames(manifest, environment, scope);

  if (!options.skipVerify) {
    if (!isAwsCliAvailable()) {
      throw new CliError(
        'The AWS CLI is required to verify credentials before deploying.\nInstall it, or pass --skip-verify to deploy without checking.'
      );
    }

    const { identity, error } = getCallerIdentity(target.profile, target.region);

    if (!identity) {
      throw new CliError(
        `Could not verify AWS credentials for ${
          target.profile ? `profile "${target.profile}"` : "the environment"
        } in ${target.region}.\n  ${error ?? "sts get-caller-identity failed."}\n\nFix them with: slskit configure --env ${environment} --set-credentials`
      );
    }

    logger.info(`\nDeploying as ${identity.arn}`);
    logger.info(`  account: ${identity.account}`);
  }

  // A code sync updates functions inside an existing stack; it cannot create one,
  // and the error sam gives for a missing stack does not say so.
  if (scope.kind !== "all" && !options.skipVerify && !stackExists(target)) {
    throw new CliError(
      `Stack "${target.stackName}" does not exist yet, so there is nothing to update.\nDeploy the whole project first: slskit deploy ${environment} --all`
    );
  }

  if (!options.yes) {
    const proceed = await confirmDeploy(
      manifest,
      environment,
      target.stackName,
      target.region,
      functionNames,
      scope
    );

    if (!proceed) {
      logger.info("\nNothing was deployed.");
      return;
    }
  }

  await ensureSamCliInstalled();

  // sam sync builds what it needs itself, so a separate build would only be repeated work.
  if (scope.kind === "all") {
    if (options.build !== false) {
      samBuild(cwd);
    }

    samDeploy(cwd, target, overrides, Boolean(options.guided));
  } else {
    samSyncCode(cwd, target, resourceIdsFor(manifest, scope), overrides);
  }

  logger.info(`\nDeployed ${scope.label} of "${manifest.name}" to "${environment}".`);
  logger.info(`  stack:   ${target.stackName}`);
  logger.info(`  region:  ${target.region}`);

  const outputs = stackOutputs(target);

  if (outputs.length > 0) {
    logger.info("\nEndpoints:");
    for (const output of outputs) {
      logger.info(`  ${output.key}: ${output.value}`);
    }
  }
}
