import fs from "node:fs";
import path from "node:path";
import { CliError } from "./errors.js";

export const MANIFEST_FILE = "sless.json";

// Every project has this environment from "slskit init" onward, and every
// stage-aware command falls back to it when no --env is given.
export const DEFAULT_ENVIRONMENT = "dev";

// The variable slskit always generates. Its value is the environment name, and
// every stage-scoped resource name is built from it.
export const APP_ENVIRONMENT_KEY = "APP_ENVIRONMENT";

// The matching CloudFormation parameter. Templates are shared by every
// environment, so the name has to arrive as an override at deploy time.
export const APP_ENVIRONMENT_PARAM = "AppEnvironment";

// Lambda caps a function name at 64 characters, and slskit builds it as
// <project>-<environment>-<function>.
export const FUNCTION_NAME_MAX = 64;

const ENVIRONMENT_PATTERN = /^[a-z][a-z0-9-]*$/;

// How a variable gets its value at deploy time. Exactly one applies: an inline
// value safe to commit, a secret read from the gitignored .env.<environment>, or
// a path in SSM Parameter Store.
export interface EnvVarDef {
  value?: string;
  secret?: boolean;
  ssm?: string;
}

export type EnvVarSource = "value" | "secret" | "ssm";

export interface EnvironmentConfig {
  region?: string;
  profile?: string;
  stackName: string;
  variables?: Record<string, EnvVarDef>;
}

export interface EnvironmentsConfig {
  default: string;
  list: Record<string, EnvironmentConfig>;
}

export interface ProjectManifest {
  name: string;
  framework?: { id?: string };
  environments?: EnvironmentsConfig;
  [key: string]: unknown;
}

export function readManifest(cwd: string, command = "slskit"): ProjectManifest {
  const manifestPath = path.join(cwd, MANIFEST_FILE);

  if (!fs.existsSync(manifestPath)) {
    throw new CliError(
      `No ${MANIFEST_FILE} found in ${cwd}. Run "slskit init" first, or run "${command}" from your project root.`
    );
  }

  let manifest: ProjectManifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as ProjectManifest;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CliError(`${MANIFEST_FILE} is not valid JSON: ${message}`);
  }

  if (!manifest?.name) {
    throw new CliError(`${MANIFEST_FILE} is missing a project "name".`);
  }

  return manifest;
}

export function writeManifest(cwd: string, manifest: ProjectManifest): void {
  fs.writeFileSync(
    path.join(cwd, MANIFEST_FILE),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
}

export function parseEnvironmentName(
  value: string | undefined,
  label = "Environment name"
): string | undefined {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }

  const name = value.trim().toLowerCase();
  if (!ENVIRONMENT_PATTERN.test(name)) {
    throw new CliError(
      `Invalid ${label.toLowerCase()} "${value}". Use lowercase letters, digits and hyphens, starting with a letter (for example: dev, staging, stage-1, production).`
    );
  }

  return name;
}

export function environmentNames(manifest: ProjectManifest): string[] {
  return Object.keys(manifest.environments?.list ?? {}).sort();
}

export function defaultEnvironment(manifest: ProjectManifest): string {
  return manifest.environments?.default ?? DEFAULT_ENVIRONMENT;
}

export function resolveEnvironmentName(
  manifest: ProjectManifest,
  requested?: string
): string {
  return parseEnvironmentName(requested) ?? defaultEnvironment(manifest);
}

export function requireEnvironment(
  manifest: ProjectManifest,
  name: string
): EnvironmentConfig {
  const config = manifest.environments?.list?.[name];

  if (!config) {
    const known = environmentNames(manifest).join(", ") || "(none)";
    throw new CliError(
      `Environment "${name}" was not found. Existing environments: ${known}. Add one with "slskit env add ${name}".`
    );
  }

  return config;
}

// Resource names are derived, never stored, so renaming an environment can never
// leave a stale name behind in the manifest.
export function stackNameFor(projectName: string, environment: string): string {
  return sanitizeName(`${projectName}-${environment}`);
}

export function functionNameFor(
  projectName: string,
  environment: string,
  functionName: string
): string {
  return sanitizeName(`${projectName}-${environment}-${functionName}`);
}

function sanitizeName(value: string): string {
  const cleaned = value
    .replace(/[^A-Za-z0-9-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");

  return /^[A-Za-z]/.test(cleaned) ? cleaned : `app-${cleaned}`;
}

// Checked at generate time so a too-long name fails while it is still a local
// file, rather than midway through a CloudFormation deploy.
export function assertFunctionNameFits(
  projectName: string,
  environment: string,
  functionName: string
): void {
  const full = functionNameFor(projectName, environment, functionName);

  if (full.length > FUNCTION_NAME_MAX) {
    throw new CliError(
      `Lambda function name "${full}" is ${full.length} characters, over the ${FUNCTION_NAME_MAX} character limit.\nShorten the project name, the environment name "${environment}", or the function name "${functionName}".`
    );
  }
}

export function envVarSource(def: EnvVarDef): EnvVarSource {
  if (def.ssm) {
    return "ssm";
  }
  if (def.secret) {
    return "secret";
  }
  return "value";
}

// Templates are shared by every environment, so they declare a parameter for the
// union of variable names. APP_ENVIRONMENT is excluded: it has its own dedicated
// parameter and is never stored as a normal variable.
export function allEnvKeys(manifest: { environments?: EnvironmentsConfig }): string[] {
  const keys = new Set<string>();

  for (const environment of Object.values(manifest.environments?.list ?? {})) {
    for (const key of Object.keys(environment.variables ?? {})) {
      if (key !== APP_ENVIRONMENT_KEY) {
        keys.add(key);
      }
    }
  }

  return [...keys].sort();
}

export function writeEnvironment(
  cwd: string,
  manifest: ProjectManifest,
  name: string,
  config: EnvironmentConfig
): void {
  const environments = manifest.environments;

  writeManifest(cwd, {
    ...manifest,
    environments: {
      default: environments?.default ?? name,
      list: { ...environments?.list, [name]: config },
    },
  });
}
