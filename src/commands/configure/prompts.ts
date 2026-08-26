import { CliError } from "../../core/errors.js";
import {
  configuredRegion,
  envProfile,
  envRegion,
  hasEnvCredentials,
  isAwsCliAvailable,
  listAwsProfiles,
} from "./aws-cli.js";
import {
  parseEnvironmentName,
  resolveEnvironmentName,
  stackNameFor,
} from "../../core/environments.js";
import type {
  ConfigurableManifest,
  ConfigureAnswers,
  ConfigureOptions,
} from "./types.js";

// CloudFormation stack names: letters, digits and hyphens, starting with a letter.
const STACK_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9-]*$/;
const STACK_NAME_MAX = 128;
// us-east-1, eu-west-2, ap-southeast-3, us-gov-west-1, cn-north-1 ...
const REGION_PATTERN = /^[a-z]{2}(-[a-z]+)?-[a-z]+-\d+$/;

// Sentinel for "don't pin a profile, read credentials from the environment".
export const ENVIRONMENT_PROFILE = "";

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

export function defaultStackName(projectName: string, environment: string): string {
  return stackNameFor(projectName, environment).slice(0, STACK_NAME_MAX).replace(/-+$/, "");
}

export async function collectConfigureAnswers(
  manifest: ConfigurableManifest,
  options: ConfigureOptions
): Promise<ConfigureAnswers> {
  const environment = resolveEnvironmentName(manifest, options.env);
  const existing = manifest.environments?.list?.[environment];

  let profile = options.profile?.trim() || undefined;
  let region = parseRegion(options.region);
  let stackName = parseStackName(options.stackName);

  const envCredentials = hasEnvCredentials();
  const profiles = listAwsProfiles();
  const awsCli = isAwsCliAvailable();

  // Resolution order for each field: explicit flag, then what this project already
  // recorded for the environment, then the shell, then the AWS config file.
  const profileDefault =
    profile ?? existing?.profile ?? envProfile() ?? (profiles.includes("default") ? "default" : undefined);

  const regionDefault =
    region ??
    existing?.region ??
    envRegion() ??
    (awsCli ? configuredRegion(profileDefault) : undefined);

  const stackNameDefault =
    stackName ?? existing?.stackName ?? defaultStackName(manifest.name, environment);

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
      environment,
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
    environment,
    region: region as string,
    profile: selectedProfile,
    stackName: stackName as string,
  };
}

export { parseEnvironmentName };
