import { CliError } from "../../core/errors.js";
import { logger } from "../../core/logger.js";
import {
  APP_ENVIRONMENT_KEY,
  MANIFEST_FILE,
  readManifest,
  writeEnvironment,
} from "../../core/environments.js";
import type { EnvironmentConfig } from "../../core/environments.js";
import { seedDotenv } from "../env/action.js";
import {
  AWS_INSTALL_URL,
  credentialsFilePath,
  getCallerIdentity,
  isAwsCliAvailable,
  setProfileCredentials,
} from "./aws-cli.js";
import { collectConfigureAnswers } from "./prompts.js";
import type { AwsIdentity, ConfigureAnswers, ConfigureOptions } from "./types.js";

const ACCESS_KEY_PATTERN = /^[A-Z0-9]{16,128}$/;

function credentialSource(profile: string | undefined): string {
  return profile ? `profile "${profile}"` : "the environment";
}

function fixHint(profile: string | undefined): string {
  return profile
    ? `aws configure --profile ${profile}  (or "aws sso login --profile ${profile}" for an SSO profile)`
    : "Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY, or pick a named profile instead.";
}

// Prompts for an access key and hands it to the AWS CLI, which stores it in
// ~/.aws/credentials. The secret is never echoed, never logged, and never written
// anywhere inside the project.
async function promptForCredentials(
  answers: ConfigureAnswers
): Promise<string | undefined> {
  const { input, password, confirm } = await import("@inquirer/prompts");

  const proceed = await confirm({
    message: "Enter an AWS access key now and store it in ~/.aws/credentials?",
    default: true,
  });

  if (!proceed) {
    return undefined;
  }

  const profile =
    answers.profile ??
    (await input({
      message: "Profile name to store it under:",
      default: "default",
      required: true,
    }));

  const accessKeyId = (
    await input({
      message: "AWS Access Key ID:",
      required: true,
    })
  ).trim();

  if (!ACCESS_KEY_PATTERN.test(accessKeyId)) {
    throw new CliError(
      `"${accessKeyId}" does not look like an AWS Access Key ID (expected something like AKIA... ).`
    );
  }

  const secretAccessKey = (
    await password({ message: "AWS Secret Access Key:", mask: true })
  ).trim();

  if (!secretAccessKey) {
    throw new CliError("A secret access key is required.");
  }

  const { ok, error } = setProfileCredentials(
    profile,
    accessKeyId,
    secretAccessKey,
    answers.region
  );

  if (!ok) {
    throw new CliError(
      `Could not store the credentials: ${error ?? "aws configure set failed."}\nStore them yourself with: aws configure --profile ${profile}`
    );
  }

  logger.info(`\nStored the key for profile "${profile}" in ${credentialsFilePath()}.`);
  logger.info("  the secret was not echoed and is not stored in this project");

  return profile;
}

// Returns the profile actually used, which may change if credentials were entered
// against a new profile name.
async function verifyCredentials(
  answers: ConfigureAnswers,
  options: ConfigureOptions
): Promise<{ profile?: string; identity?: AwsIdentity }> {
  if (options.skipVerify) {
    logger.info("\nSkipped the credential check (--skip-verify).");
    return { profile: answers.profile };
  }

  if (!isAwsCliAvailable()) {
    logger.info(
      `\nAWS CLI was not found on your PATH, so the credentials were not verified.\n  Install it: ${AWS_INSTALL_URL}\n  Then re-run "slskit configure" to check them.`
    );
    return { profile: answers.profile };
  }

  let profile = answers.profile;
  let { identity, error } = getCallerIdentity(profile, answers.region);

  const wantsNewKey = options.setCredentials && process.stdin.isTTY;

  if (!identity || wantsNewKey) {
    if (!process.stdin.isTTY) {
      throw new CliError(
        `Could not verify AWS credentials for ${credentialSource(profile)} in ${answers.region}.\n  ${error ?? "sts get-caller-identity failed."}\n\nFix them with:\n  ${fixHint(profile)}\n\nThen re-run "slskit configure", or pass --skip-verify to save without checking.`
      );
    }

    if (!identity) {
      logger.info(
        `\nCould not verify AWS credentials for ${credentialSource(profile)} in ${answers.region}.`
      );
      logger.info(`  ${error ?? "sts get-caller-identity failed."}`);
    }

    const stored = await promptForCredentials(answers);

    if (!stored) {
      throw new CliError(
        `AWS credentials are required to deploy.\n\nFix them with:\n  ${fixHint(profile)}\n\nThen re-run "slskit configure", or pass --skip-verify to save without checking.`
      );
    }

    profile = stored;
    ({ identity, error } = getCallerIdentity(profile, answers.region));

    if (!identity) {
      throw new CliError(
        `The key was stored for profile "${profile}", but AWS still rejected it in ${answers.region}.\n  ${error ?? "sts get-caller-identity failed."}\n\nCheck that the key is active and has permission to call sts:GetCallerIdentity.`
      );
    }
  }

  logger.info("\nVerified AWS credentials.");
  logger.info(`  account:   ${identity.account}`);
  logger.info(`  identity:  ${identity.arn}`);

  return { profile, identity };
}

export async function configureAction(options: ConfigureOptions): Promise<void> {
  const cwd = process.cwd();
  const manifest = readManifest(cwd, "slskit configure");
  const answers = await collectConfigureAnswers(manifest, options);

  const { profile } = await verifyCredentials(answers, options);

  const existing = manifest.environments?.list?.[answers.environment];

  const config: EnvironmentConfig = {
    region: answers.region,
    stackName: answers.stackName,
  };
  if (profile) {
    config.profile = profile;
  }
  // Variables already recorded for this environment survive a re-configure.
  if (existing?.variables) {
    config.variables = existing.variables;
  }

  writeEnvironment(cwd, manifest, answers.environment, config);
  const dotenv = seedDotenv(cwd, answers.environment);

  logger.info(`\nConfigured environment "${answers.environment}" for "${manifest.name}".`);
  logger.info(`  ${APP_ENVIRONMENT_KEY}: ${answers.environment}`);
  logger.info(`  credentials: ${credentialSource(profile)}`);
  logger.info(`  region:      ${answers.region}`);
  logger.info(`  stack:       ${answers.stackName}`);
  logger.info(`  written to:  ${MANIFEST_FILE}, ${dotenv}`);
  logger.info(
    "\nNo credential material is stored in this project — only the profile name, resolved at deploy time."
  );
  logger.info(`\nDeploy it with: slskit deploy ${answers.environment}`);
}
