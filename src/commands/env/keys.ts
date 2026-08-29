import { APP_ENVIRONMENT_KEY, allEnvKeys } from "../../core/environments.js";
import type { EnvironmentsConfig } from "../../core/environments.js";
import { readDotenv } from "./dotenv.js";

// Structural rather than the full ProjectManifest: "slskit function" carries its own
// manifest type and only ever needs the environments off it.
type ManifestView = { environments?: EnvironmentsConfig };

// Anything that is not a legal shell/Lambda variable name is skipped rather than
// turned into a CloudFormation parameter, so a stray line in a hand-edited .env
// file can never produce an unbuildable template.
const VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function isVariableName(key: string): boolean {
  return VARIABLE_NAME.test(key) && key !== APP_ENVIRONMENT_KEY;
}

// Every variable name in play across the whole project, whether it was declared
// with "slskit env set" or simply typed into a .env.<environment> file by hand.
// Templates are shared by every environment, so they declare a parameter for the
// union: a variable only one stage sets still has to exist in the template that
// every other stage deploys from.
export function projectEnvKeys(cwd: string, manifest: ManifestView): string[] {
  const keys = new Set(allEnvKeys(manifest).filter(isVariableName));

  for (const environment of Object.keys(manifest.environments?.list ?? {})) {
    for (const key of Object.keys(readDotenv(cwd, environment))) {
      if (isVariableName(key)) {
        keys.add(key);
      }
    }
  }

  return [...keys].sort();
}

// The keys one environment actually supplies a value for, declared or not.
export function environmentEnvKeys(
  cwd: string,
  manifest: ManifestView,
  environment: string
): string[] {
  const config = manifest.environments?.list?.[environment];
  const keys = new Set(Object.keys(config?.variables ?? {}).filter(isVariableName));

  for (const key of Object.keys(readDotenv(cwd, environment))) {
    if (isVariableName(key)) {
      keys.add(key);
    }
  }

  return [...keys].sort();
}
