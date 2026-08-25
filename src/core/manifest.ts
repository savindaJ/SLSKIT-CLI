import fs from "node:fs";
import path from "node:path";
import { CliError } from "./errors.js";

export const MANIFEST_FILE = "sless.json";

// How a stage's environment variable gets its value at deploy time. Exactly one of
// these is set: an inline value that is safe to commit, a secret read from the
// gitignored .env.<stage>, or a path in SSM Parameter Store resolved by AWS.
export interface EnvVarDef {
  value?: string;
  secret?: boolean;
  ssm?: string;
}

export type EnvVarSource = "value" | "secret" | "ssm";

export interface StageConfig {
  region: string;
  profile?: string;
  stackName: string;
  env?: Record<string, EnvVarDef>;
}

export interface DeploymentConfig {
  defaultStage: string;
  stages: Record<string, StageConfig>;
}

export interface ProjectManifest {
  name: string;
  framework?: { id?: string };
  deployment?: DeploymentConfig;
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

export function stageNames(manifest: ProjectManifest): string[] {
  return Object.keys(manifest.deployment?.stages ?? {}).sort();
}

// Falls back to the project's default stage so every stage-aware command can be
// run without --stage once configure has set one up.
export function resolveStageName(
  manifest: ProjectManifest,
  requested?: string
): string {
  if (requested) {
    return requested;
  }

  const fallback = manifest.deployment?.defaultStage;
  if (!fallback) {
    throw new CliError(
      'This project has no stages yet. Run "slskit configure" to set one up.'
    );
  }

  return fallback;
}

export function requireStage(
  manifest: ProjectManifest,
  stage: string
): StageConfig {
  const config = manifest.deployment?.stages?.[stage];

  if (!config) {
    const known = stageNames(manifest).join(", ") || "(none)";
    throw new CliError(
      `Stage "${stage}" was not found. Existing stages: ${known}.`
    );
  }

  return config;
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

// Templates are shared by every stage, so they must declare a parameter for the
// union of variable names: a stage that does not set one just falls back to the
// parameter's empty default.
export function allEnvKeys(manifest: { deployment?: DeploymentConfig }): string[] {
  const keys = new Set<string>();

  for (const stage of Object.values(manifest.deployment?.stages ?? {})) {
    for (const key of Object.keys(stage.env ?? {})) {
      keys.add(key);
    }
  }

  return [...keys].sort();
}
