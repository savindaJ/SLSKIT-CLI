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
import { ensureSamCliInstalled, samBuild } from "../run/sam-cli.js";
import { samDeploy, stackOutputs } from "./sam-deploy.js";
import type { DeployOptions } from "./types.js";

interface ApplicationView {
  name: string;
  functions?: { name: string }[];
}

function applicationsOf(manifest: ProjectManifest): ApplicationView[] {
  return (manifest.applications as ApplicationView[] | undefined) ?? [];
}

function plannedFunctionNames(
  manifest: ProjectManifest,
  environment: string
): string[] {
  return applicationsOf(manifest).flatMap((app) =>
    (app.functions ?? []).map((fn) =>
      functionNameFor(manifest.name, environment, fn.name)
    )
  );
}

async function confirmDeploy(
  manifest: ProjectManifest,
  environment: string,
  stackName: string,
  region: string,
  functionNames: string[]
): Promise<boolean> {
  logger.info(`\nAbout to deploy "${manifest.name}" to AWS.`);
  logger.info(`  ${APP_ENVIRONMENT_KEY}: ${environment}`);
  logger.info(`  stack:       ${stackName}`);
  logger.info(`  region:      ${region}`);
  logger.info(`  functions:   ${functionNames.length}`);
  for (const name of functionNames) {
    logger.info(`    ${name}`);
  }
  logger.info(
    "\nThis creates real AWS resources in your account and they cost money."
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

  // Resolved before anything runs so a missing secret fails here, not mid-deploy.
  const overrides = toCliArguments(parameterOverrides(cwd, manifest, environment));
  const functionNames = plannedFunctionNames(manifest, environment);

  // Checked before anything slower: without --yes a non-interactive deploy can
  // never proceed, so that is the most useful thing to say first.
  if (!options.yes && !process.stdin.isTTY) {
    throw new CliError(
      `Deploying creates real AWS resources. Re-run with --yes to deploy "${environment}" non-interactively.`
    );
  }

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

  if (!options.yes) {
    const proceed = await confirmDeploy(
      manifest,
      environment,
      target.stackName,
      target.region,
      functionNames
    );

    if (!proceed) {
      logger.info("\nNothing was deployed.");
      return;
    }
  }

  await ensureSamCliInstalled();

  if (options.build !== false) {
    samBuild(cwd);
  }

  samDeploy(cwd, target, overrides, Boolean(options.guided));

  logger.info(`\nDeployed "${manifest.name}" to "${environment}".`);
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
