import { CliError } from "../../core/errors.js";
import {
  APP_ENVIRONMENT_PARAM,
  envVarSource,
  requireEnvironment,
} from "../../core/environments.js";
import type { ProjectManifest } from "../../core/environments.js";
import { envParameterName } from "../init/templates/helpers.js";
import { dotenvFileName, readDotenv } from "./dotenv.js";

export interface ParameterOverride {
  name: string;
  value: string;
}

// Turns one environment into the --parameter-overrides list that both "slskit run"
// and a deploy hand to the AWS SAM CLI. AppEnvironment always comes first: it is
// what every stage-scoped resource name is built from.
export function parameterOverrides(
  cwd: string,
  manifest: ProjectManifest,
  environment: string
): ParameterOverride[] {
  const config = requireEnvironment(manifest, environment);
  const overrides: ParameterOverride[] = [
    { name: APP_ENVIRONMENT_PARAM, value: environment },
  ];

  const secrets = readDotenv(cwd, environment);

  for (const key of Object.keys(config.variables ?? {}).sort()) {
    const def = config.variables![key];
    const source = envVarSource(def);
    const name = envParameterName(key);

    if (source === "ssm") {
      // A CloudFormation dynamic reference: AWS resolves it at deploy time, so the
      // secret never passes through this process.
      overrides.push({ name, value: `{{resolve:ssm:${def.ssm}}}` });
      continue;
    }

    if (source === "secret") {
      const value = secrets[key];
      if (value === undefined) {
        throw new CliError(
          `Variable "${key}" is marked secret for environment "${environment}" but is missing from ${dotenvFileName(environment)}.\nSet it with: slskit env set ${key}=<value> --secret --env ${environment}`
        );
      }
      overrides.push({ name, value });
      continue;
    }

    overrides.push({ name, value: def.value ?? "" });
  }

  return overrides;
}

export function toCliArguments(overrides: ParameterOverride[]): string[] {
  return overrides.map(({ name, value }) => `${name}=${value}`);
}
