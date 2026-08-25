import { CliError } from "../../core/errors.js";
import { logger } from "../../core/logger.js";
import { AWS_INSTALL_URL, getCallerIdentity, isAwsCliAvailable } from "./aws-cli.js";
import { readConfigurableManifest, writeStageConfig } from "./manifest.js";
import { collectConfigureAnswers } from "./prompts.js";
import { MANIFEST_FILE } from "./types.js";
import type { ConfigureOptions, StageConfig } from "./types.js";

function credentialSource(profile: string | undefined): string {
  return profile ? `profile "${profile}"` : "the environment";
}

export async function configureAction(options: ConfigureOptions): Promise<void> {
  const cwd = process.cwd();
  const manifest = readConfigurableManifest(cwd);
  const answers = await collectConfigureAnswers(manifest, options);

  const config: StageConfig = {
    region: answers.region,
    stackName: answers.stackName,
  };
  if (answers.profile) {
    config.profile = answers.profile;
  }

  if (options.skipVerify) {
    logger.info("\nSkipped the credential check (--skip-verify).");
  } else if (!isAwsCliAvailable()) {
    logger.info(
      `\nAWS CLI was not found on your PATH, so the credentials were not verified.\n  Install it: ${AWS_INSTALL_URL}\n  Then re-run "slskit configure" to check them.`
    );
  } else {
    const { identity, error } = getCallerIdentity(answers.profile, answers.region);

    if (!identity) {
      const fix = answers.profile
        ? `aws configure --profile ${answers.profile}  (or "aws sso login --profile ${answers.profile}" for an SSO profile)`
        : "Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY, or pick a named profile instead.";

      throw new CliError(
        `Could not verify AWS credentials for ${credentialSource(answers.profile)} in ${answers.region}.\n  ${error ?? "sts get-caller-identity failed."}\n\nFix them with:\n  ${fix}\n\nThen re-run "slskit configure", or pass --skip-verify to save without checking.`
      );
    }

    logger.info("\nVerified AWS credentials.");
    logger.info(`  account:   ${identity.account}`);
    logger.info(`  identity:  ${identity.arn}`);
  }

  writeStageConfig(cwd, manifest, answers.stage, config);

  logger.info(`\nConfigured stage "${answers.stage}" for "${manifest.name}".`);
  logger.info(`  credentials: ${credentialSource(answers.profile)}`);
  logger.info(`  region:      ${answers.region}`);
  logger.info(`  stack:       ${answers.stackName}`);
  logger.info(`  written to:  ${MANIFEST_FILE}`);
  logger.info(
    "\nNo credentials were written to disk — only the profile name is stored, and it is resolved at deploy time."
  );
}
