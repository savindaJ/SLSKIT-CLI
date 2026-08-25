import { CliError } from "../../core/errors.js";
import {
  configuredRegion,
  envProfile,
  envRegion,
  hasEnvCredentials,
  isAwsCliAvailable,
  listAwsProfiles,
} from "./aws-cli.js";
import { DEFAULT_STAGE } from "./types.js";
import type {
  ConfigurableManifest,
  ConfigureAnswers,
  ConfigureOptions,
} from "./types.js";

const STAGE_PATTERN = /^[a-z][a-z0-9-]*$/;
// CloudFormation stack names: letters, digits and hyphens, starting with a letter.
const STACK_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9-]*$/;
const STACK_NAME_MAX = 128;
// us-east-1, eu-west-2, ap-southeast-3, us-gov-west-1, cn-north-1 ...
const REGION_PATTERN = /^[a-z]{2}(-[a-z]+)?-[a-z]+-\d+$/;

// Sentinel for "don't pin a profile, read credentials from the environment".
export const ENVIRONMENT_PROFILE = "";

export function parseStage(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }

  const stage = value.trim().toLowerCase();
  if (!STAGE_PATTERN.test(stage)) {
    throw new CliError(
      `Invalid stage "${value}". Use lowercase letters, digits and hyphens, starting with a letter.`
    );
  }

  return stage;
}

export function parseRegion(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }

  const region = value.trim().toLowerCase();
  if (!REGION_PATTERN.test(region)) {
    throw new CliError(
      `Invalid AWS region "${value}". Expected something like us-east-1 or eu-west-2.`
    );
  }

  return region;
}

export function parseStackName(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }

  const name = value.trim();
  if (!STACK_NAME_PATTERN.test(name) || name.length > STACK_NAME_MAX) {
    throw new CliError(
      `Invalid stack name "${value}". Use letters, digits and hyphens, starting with a letter (max ${STACK_NAME_MAX} characters).`
    );
  }

  return name;
}

export function defaultStackName(projectName: string, stage: string): string {
  const base = `${projectName}-${stage}`
    .replace(/[^A-Za-z0-9-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+/, "");

  const prefixed = /^[A-Za-z]/.test(base) ? base : `app-${base}`;
  return prefixed.slice(0, STACK_NAME_MAX).replace(/-+$/, "");
}

export async function collectConfigureAnswers(
  manifest: ConfigurableManifest,
  options: ConfigureOptions
): Promise<ConfigureAnswers> {
  const stage = parseStage(options.stage) ?? DEFAULT_STAGE;
  const existing = manifest.deployment?.stages?.[stage];

  let profile = options.profile?.trim() || undefined;
  let region = parseRegion(options.region);
  let stackName = parseStackName(options.stackName);

  const envCredentials = hasEnvCredentials();
  const profiles = listAwsProfiles();
  const awsCli = isAwsCliAvailable();

  // Resolution order for each field: explicit flag, then what this project already
  // recorded for the stage, then the environment, then the AWS config file.
  const profileDefault =
    profile ?? existing?.profile ?? envProfile() ?? (profiles.includes("default") ? "default" : undefined);

  const regionDefault =
    region ??
    existing?.region ??
    envRegion() ??
    (awsCli ? configuredRegion(profileDefault) : undefined);

  const stackNameDefault =
    stackName ?? existing?.stackName ?? defaultStackName(manifest.name, stage);

  if (!process.stdin.isTTY) {
    if (!profileDefault && !envCredentials) {
      throw new CliError(
        'Non-interactive configure needs "--profile <name>", or AWS credentials in the environment.'
      );
    }
    if (!regionDefault) {
      throw new CliError(
        'Non-interactive configure needs "--region <region>", AWS_REGION, or a region in your AWS config.'
      );
    }

    return {
      stage,
      region: regionDefault,
      profile: profileDefault,
      stackName: stackNameDefault,
    };
  }

  const { input, select } = await import("@inquirer/prompts");

  if (profile === undefined) {
    const choices = [
      ...profiles.map((name) => ({
        name: name === profileDefault ? `${name} (current)` : name,
        value: name,
      })),
      {
        name: envCredentials
          ? "Environment variables (detected)"
          : "Environment variables / instance role",
        value: ENVIRONMENT_PROFILE,
      },
    ];

    if (profiles.length === 0) {
      profile = ENVIRONMENT_PROFILE;
    } else {
      profile = await select<string>({
        message: "AWS credentials:",
        choices,
        default: profileDefault ?? ENVIRONMENT_PROFILE,
      });
    }
  }

  const selectedProfile = profile === ENVIRONMENT_PROFILE ? undefined : profile;

  region ??= parseRegion(
    await input({
      message: "AWS region:",
      default:
        regionDefault ??
        (awsCli ? configuredRegion(selectedProfile) : undefined) ??
        "us-east-1",
      required: true,
    })
  );

  stackName ??= parseStackName(
    await input({
      message: "CloudFormation stack name:",
      default: stackNameDefault,
      required: true,
    })
  );

  return {
    stage,
    region: region as string,
    profile: selectedProfile,
    stackName: stackName as string,
  };
}
