import { CliError } from "../../core/errors.js";
import {
  APP_ENVIRONMENT_PARAM,
  envVarSource,
  requireEnvironment,
} from "../../core/environments.js";
import type { ProjectManifest } from "../../core/environments.js";
import { envParameterName } from "../init/templates/helpers.js";
import { dotenvFileName, readDotenv } from "./dotenv.js";
import { projectEnvKeys } from "./keys.js";

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

  const fileValues = readDotenv(cwd, environment);
  const declared = config.variables ?? {};

  // The whole project's key set, not just this environment's: templates are shared,
  // so every parameter they declare has to be resolvable from here.
  for (const key of projectEnvKeys(cwd, manifest)) {
    const def = declared[key];
    const name = envParameterName(key);

    if (!def) {
      // Undeclared: it exists only because someone put it in a .env file. Stages
      // that leave it out fall through to the parameter's empty default.
      const value = fileValues[key];
      if (value !== undefined && value !== "") {
        overrides.push({ name, value });
      }
      continue;
    }

    const source = envVarSource(def);

    if (source === "ssm") {
      // A CloudFormation dynamic reference: AWS resolves it at deploy time, so the
      // secret never passes through this process.
      overrides.push({ name, value: `{{resolve:ssm:${def.ssm}}}` });
      continue;
    }

    if (source === "secret") {
      const value = fileValues[key];
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

// The shorthand "Key=Value" form the AWS SAM CLI also accepts splits on whitespace,
// so a value with a space in it is silently truncated -- "hello world" arrives as
// "hello". The explicit ParameterKey/ParameterValue form with the value quoted is the
// only one that survives spaces, commas and equals signs alike. Backslashes are
// deliberately left alone: escaping them doubles them.
function quoteValue(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

export function toCliArguments(overrides: ParameterOverride[]): string[] {
  return overrides.map(
    ({ name, value }) => `ParameterKey=${name},ParameterValue=${quoteValue(value)}`
  );
}
