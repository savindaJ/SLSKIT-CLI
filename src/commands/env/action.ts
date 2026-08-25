import { CliError } from "../../core/errors.js";
import { logger } from "../../core/logger.js";
import {
  envVarSource,
  readManifest,
  requireStage,
  resolveStageName,
  writeManifest,
} from "../../core/manifest.js";
import type { EnvVarDef, ProjectManifest, StageConfig } from "../../core/manifest.js";
import { envParameterName } from "../init/templates/helpers.js";
import {
  dotenvFileName,
  ensureDotenvIgnored,
  readDotenv,
  setDotenvValue,
  unsetDotenvValue,
} from "./dotenv.js";
import { regenerateTemplates } from "./templates.js";
import type { EnvListOptions, EnvSetOptions, EnvUnsetOptions } from "./types.js";

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function parseKey(value: string): string {
  const key = value.trim();
  if (!KEY_PATTERN.test(key)) {
    throw new CliError(
      `Invalid variable name "${value}". Use letters, digits and underscores, starting with a letter or underscore.`
    );
  }
  return key;
}

// LOG_LEVEL and LOG__LEVEL would both become EnvLogLevel, which CloudFormation
// would reject as a duplicate parameter. Catch it here rather than at deploy.
function assertNoParameterCollision(
  manifest: ProjectManifest,
  key: string
): void {
  const target = envParameterName(key);

  for (const stage of Object.values(manifest.deployment?.stages ?? {})) {
    for (const existing of Object.keys(stage.env ?? {})) {
      if (existing !== key && envParameterName(existing) === target) {
        throw new CliError(
          `"${key}" and "${existing}" both map to the CloudFormation parameter ${target}. Rename one of them.`
        );
      }
    }
  }
}

function writeStageEnv(
  cwd: string,
  manifest: ProjectManifest,
  stage: string,
  env: Record<string, EnvVarDef>
): void {
  const config = requireStage(manifest, stage);
  const next: StageConfig = { ...config };

  if (Object.keys(env).length > 0) {
    next.env = env;
  } else {
    delete next.env;
  }

  writeManifest(cwd, {
    ...manifest,
    deployment: {
      defaultStage: manifest.deployment?.defaultStage ?? stage,
      stages: { ...manifest.deployment?.stages, [stage]: next },
    },
  });
}

function reportTemplates(written: string[]): void {
  if (written.length === 0) {
    return;
  }
  logger.info(`\nRegenerated ${written.length} template(s):`);
  for (const file of written) {
    logger.info(`  ${file}`);
  }
}

export async function envSetAction(
  input: string,
  options: EnvSetOptions
): Promise<void> {
  const cwd = process.cwd();
  const manifest = readManifest(cwd, "slskit env set");
  const stage = resolveStageName(manifest, options.stage);
  const config = requireStage(manifest, stage);

  const eq = input.indexOf("=");
  const key = parseKey(eq === -1 ? input : input.slice(0, eq));
  const inlineValue = eq === -1 ? undefined : input.slice(eq + 1);

  if (options.secret && options.ssm) {
    throw new CliError('Pass either "--secret" or "--ssm <path>", not both.');
  }

  assertNoParameterCollision(manifest, key);

  let def: EnvVarDef;
  let secretFile: string | undefined;

  if (options.ssm) {
    if (inlineValue !== undefined) {
      throw new CliError(
        `"--ssm" resolves the value from Parameter Store, so do not also pass a value for ${key}.`
      );
    }
    def = { ssm: options.ssm.trim() };
  } else if (options.secret) {
    let value = inlineValue;

    if (value === undefined) {
      if (!process.stdin.isTTY) {
        throw new CliError(
          `Non-interactive use needs a value: slskit env set ${key}=<value> --secret`
        );
      }
      const { password } = await import("@inquirer/prompts");
      value = await password({ message: `Value for ${key}:`, mask: true });
    }

    if (!value) {
      throw new CliError(`A secret value for ${key} is required.`);
    }

    ensureDotenvIgnored(cwd);
    secretFile = setDotenvValue(cwd, stage, key, value);
    def = { secret: true };
  } else {
    if (inlineValue === undefined) {
      throw new CliError(
        `Pass a value: slskit env set ${key}=<value>  (or "--secret" to keep it out of ${"sless.json"}).`
      );
    }
    def = { value: inlineValue };
  }

  const env = { ...config.env, [key]: def };
  writeStageEnv(cwd, manifest, stage, env);

  const updated = readManifest(cwd, "slskit env set");
  const written = regenerateTemplates(cwd, updated);

  logger.info(`\nSet ${key} for stage "${stage}".`);
  logger.info(`  source:    ${envVarSource(def)}`);
  if (def.value !== undefined) {
    logger.info(`  value:     ${def.value}`);
  }
  if (secretFile) {
    logger.info(`  value:     stored in ${secretFile} (gitignored, never in sless.json)`);
  }
  if (def.ssm) {
    logger.info(`  ssm path:  ${def.ssm}`);
  }
  logger.info(`  parameter: ${envParameterName(key)}`);
  reportTemplates(written);
}

export async function envListAction(options: EnvListOptions): Promise<void> {
  const cwd = process.cwd();
  const manifest = readManifest(cwd, "slskit env list");
  const stage = resolveStageName(manifest, options.stage);
  const config = requireStage(manifest, stage);

  const env = config.env ?? {};
  const keys = Object.keys(env).sort();

  if (keys.length === 0) {
    logger.info(`\nStage "${stage}" has no environment variables yet.`);
    logger.info(`  Add one: slskit env set KEY=value --stage ${stage}`);
    return;
  }

  const secrets = readDotenv(cwd, stage);
  logger.info(`\nEnvironment variables for stage "${stage}":\n`);

  for (const key of keys) {
    const def = env[key];
    const source = envVarSource(def);

    let shown: string;
    if (source === "ssm") {
      shown = `ssm:${def.ssm}`;
    } else if (source === "secret") {
      const stored = secrets[key];
      if (stored === undefined) {
        shown = `<missing from ${dotenvFileName(stage)}>`;
      } else {
        shown = options.showSecrets ? stored : "********";
      }
    } else {
      shown = def.value ?? "";
    }

    logger.info(`  ${key.padEnd(24)} ${source.padEnd(7)} ${shown}`);
  }
}

export async function envUnsetAction(
  keyInput: string,
  options: EnvUnsetOptions
): Promise<void> {
  const cwd = process.cwd();
  const manifest = readManifest(cwd, "slskit env unset");
  const stage = resolveStageName(manifest, options.stage);
  const config = requireStage(manifest, stage);
  const key = parseKey(keyInput);

  if (!config.env?.[key]) {
    throw new CliError(`Stage "${stage}" has no variable named "${key}".`);
  }

  const wasSecret = envVarSource(config.env[key]) === "secret";
  const env = { ...config.env };
  delete env[key];

  writeStageEnv(cwd, manifest, stage, env);

  if (wasSecret) {
    unsetDotenvValue(cwd, stage, key);
  }

  const updated = readManifest(cwd, "slskit env unset");
  const written = regenerateTemplates(cwd, updated);

  logger.info(`\nRemoved ${key} from stage "${stage}".`);
  if (wasSecret) {
    logger.info(`  also removed from ${dotenvFileName(stage)}`);
  }
  reportTemplates(written);
}
