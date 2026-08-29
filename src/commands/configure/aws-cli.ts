import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { IdentityResult } from "./types.js";

const USE_SHELL = process.platform === "win32";

export const AWS_INSTALL_URL =
  "https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html";

export function isAwsCliAvailable(): boolean {
  const result = spawnSync("aws", ["--version"], {
    stdio: "ignore",
    shell: USE_SHELL,
  });
  return !result.error && result.status === 0;
}

function readIfExists(file: string): string {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

export function awsConfigDir(): string {
  const configFile = process.env.AWS_CONFIG_FILE;
  return configFile ? path.dirname(configFile) : path.join(os.homedir(), ".aws");
}

// Section headers are "[default]" and "[profile foo]" in ~/.aws/config, but plain
// "[foo]" in ~/.aws/credentials, so the "profile " prefix is optional here.
function parseProfileNames(contents: string): string[] {
  const names: string[] = [];

  for (const line of contents.split("\n")) {
    const match = /^\s*\[\s*(?:profile\s+)?([^\]\s]+)\s*\]/.exec(line);
    if (match) {
      names.push(match[1]);
    }
  }

  return names;
}

export function listAwsProfiles(): string[] {
  const dir = awsConfigDir();
  const names = [
    ...parseProfileNames(readIfExists(path.join(dir, "config"))),
    ...parseProfileNames(readIfExists(path.join(dir, "credentials"))),
  ];

  return [...new Set(names)].sort();
}

export function hasEnvCredentials(): boolean {
  return Boolean(process.env.AWS_ACCESS_KEY_ID || process.env.AWS_SESSION_TOKEN);
}

export function envProfile(): string | undefined {
  return process.env.AWS_PROFILE?.trim() || undefined;
}

export function envRegion(): string | undefined {
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
  return region?.trim() || undefined;
}

// Asking the AWS CLI lets it apply its own resolution rules (config file, SSO
// session, env) instead of this command re-deriving them and getting them wrong.
export function configuredRegion(profile?: string): string | undefined {
  const args = ["configure", "get", "region"];
  if (profile) {
    args.push("--profile", profile);
  }

  const result = spawnSync("aws", args, { encoding: "utf8", shell: USE_SHELL });
  if (result.error || result.status !== 0) {
    return undefined;
  }

  return result.stdout?.trim() || undefined;
}

export function getCallerIdentity(
  profile: string | undefined,
  region: string
): IdentityResult {
  const args = ["sts", "get-caller-identity", "--output", "json", "--region", region];
  if (profile) {
    args.push("--profile", profile);
  }

  const result = spawnSync("aws", args, { encoding: "utf8", shell: USE_SHELL });

  if (result.error) {
    return { error: result.error.message };
  }

  if (result.status !== 0) {
    return { error: result.stderr?.trim() || `aws exited with code ${result.status ?? 1}` };
  }

  try {
    const parsed = JSON.parse(result.stdout) as { Account?: string; Arn?: string };
    if (!parsed.Account || !parsed.Arn) {
      return { error: "sts get-caller-identity returned no account or ARN." };
    }
    return { identity: { account: parsed.Account, arn: parsed.Arn } };
  } catch {
    return { error: "Could not parse the response from sts get-caller-identity." };
  }
}

export interface CredentialWriteResult {
  ok: boolean;
  error?: string;
}

// Credentials are handed to the AWS CLI so they land in ~/.aws/credentials in the
// format AWS expects — never in the project directory, and never in slskit.json.
// Deliberately runs without a shell so the secret is not exposed to shell parsing.
export function setProfileCredentials(
  profile: string,
  accessKeyId: string,
  secretAccessKey: string,
  region?: string
): CredentialWriteResult {
  const entries: [string, string][] = [
    ["aws_access_key_id", accessKeyId],
    ["aws_secret_access_key", secretAccessKey],
  ];

  if (region) {
    entries.push(["region", region]);
  }

  for (const [key, value] of entries) {
    const result = spawnSync(
      "aws",
      ["configure", "set", key, value, "--profile", profile],
      { encoding: "utf8" }
    );

    if (result.error) {
      return { ok: false, error: result.error.message };
    }

    if (result.status !== 0) {
      return {
        ok: false,
        error: result.stderr?.trim() || `aws configure set ${key} exited with ${result.status}`,
      };
    }
  }

  return { ok: true };
}

export function credentialsFilePath(): string {
  return process.env.AWS_SHARED_CREDENTIALS_FILE ?? path.join(awsConfigDir(), "credentials");
}
