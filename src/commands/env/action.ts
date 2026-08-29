import { CliError } from "../../core/errors.js";
import { logger } from "../../core/logger.js";
import {
  APP_ENVIRONMENT_KEY,
  assertFunctionNameFits,
  envVarSource,
  environmentNames,
  parseEnvironmentName,
  readManifest,
  requireEnvironment,
  resolveEnvironmentName,
  stackNameFor,
  writeManifest,
} from "../../core/environments.js";
import type { EnvVarDef, ProjectManifest } from "../../core/environments.js";
import { configureAction } from "../configure/action.js";
import { environmentEnvKeys } from "./keys.js";
import {
  dotenvFileName,
  ensureDotenvIgnored,
  readDotenv,
  setDotenvValue,
  unsetDotenvValue,
  writeDotenv,
} from "./dotenv.js";
import { regenerateTemplates } from "./templates.js";
import type {
  EnvAddOptions,
  EnvRemoveOptions,
  EnvSetOptions,
  EnvUnsetOptions,
  EnvVarsOptions,
} from "./types.js";

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function requireName(name: string | undefined): string {
  const parsed = parseEnvironmentName(name);
  if (!parsed) {
    throw new CliError("An environment name is required.");
  }
  return parsed;
}

function parseKey(key: string): string {
  const trimmed = key.trim();

  if (!KEY_PATTERN.test(trimmed)) {
    throw new CliError(
      `Invalid variable name "${key}". Use letters, digits and underscores, starting with a letter or underscore.`
    );
  }

  if (trimmed === APP_ENVIRONMENT_KEY) {
    throw new CliError(
      `${APP_ENVIRONMENT_KEY} is managed by slskit and always equals the environment name. Use "slskit env add <name>" to create another environment instead.`
    );
  }

  return trimmed;
}

// Every function's physical name is <project>-<environment>-<function>, so a long
// environment name can push it past Lambda's limit. Caught before anything is written.
function assertNamesFit(manifest: ProjectManifest, environment: string): void {
  const applications =
    (manifest.applications as { functions?: { name: string }[] }[] | undefined) ?? [];

  for (const app of applications) {
    for (const fn of app.functions ?? []) {
      assertFunctionNameFits(manifest.name, environment, fn.name);
    }
  }
}

export async function envListAction(): Promise<void> {
  const cwd = process.cwd();
  const manifest = readManifest(cwd, "slskit env list");
  const names = environmentNames(manifest);

  if (names.length === 0) {
    logger.info('\nThis project has no environments yet. Add one with "slskit env add dev".');
    return;
  }

  const active = manifest.environments?.default;
  logger.info(`\nEnvironments for "${manifest.name}":\n`);

  for (const name of names) {
    const config = requireEnvironment(manifest, name);
    const marker = name === active ? "*" : " ";
    const count = Object.keys(config.variables ?? {}).length;

    logger.info(`${marker} ${name}`);
    logger.info(`    ${APP_ENVIRONMENT_KEY}: ${name}`);
    logger.info(`    stack:     ${config.stackName}`);
    logger.info(`    region:    ${config.region ?? "(not configured)"}`);
    logger.info(`    profile:   ${config.profile ?? "(environment)"}`);
    logger.info(`    variables: ${count}`);
  }

  logger.info("\n* default environment");
}

// An environment is a deploy target plus a name, so creating one runs the same
// credential flow as configure rather than duplicating it.
export async function envAddAction(
  name: string,
  options: EnvAddOptions
): Promise<void> {
  const cwd = process.cwd();
  const manifest = readManifest(cwd, "slskit env add");
  const environment = requireName(name);

  if (manifest.environments?.list?.[environment]) {
    throw new CliError(
      `Environment "${environment}" already exists. Use "slskit configure --env ${environment}" to change it.`
    );
  }

  assertNamesFit(manifest, environment);

  await configureAction({ ...options, env: environment });
}

export async function envUseAction(name: string): Promise<void> {
  const cwd = process.cwd();
  const manifest = readManifest(cwd, "slskit env use");
  const environment = requireName(name);

  requireEnvironment(manifest, environment);

  writeManifest(cwd, {
    ...manifest,
    environments: {
      default: environment,
      list: manifest.environments?.list ?? {},
    },
  });

  logger.info(`\nDefault environment is now "${environment}".`);
  logger.info(`  ${APP_ENVIRONMENT_KEY}=${environment}`);
}

export async function envRemoveAction(
  name: string,
  options: EnvRemoveOptions
): Promise<void> {
  const cwd = process.cwd();
  const manifest = readManifest(cwd, "slskit env remove");
  const environment = requireName(name);

  const config = requireEnvironment(manifest, environment);
  const remaining = environmentNames(manifest).filter((each) => each !== environment);

  if (!options.yes) {
    if (!process.stdin.isTTY) {
      throw new CliError(
        `Removing an environment cannot be undone. Re-run with --yes to remove "${environment}".`
      );
    }

    const { confirm } = await import("@inquirer/prompts");
    const count = Object.keys(config.variables ?? {}).length;
    const proceed = await confirm({
      message: `Remove environment "${environment}" and its ${count} variable(s) from slskit.json?`,
      default: false,
    });

    if (!proceed) {
      logger.info("\nNothing was removed.");
      return;
    }
  }

  const list = { ...manifest.environments?.list };
  delete list[environment];

  const wasDefault = manifest.environments?.default === environment;

  writeManifest(cwd, {
    ...manifest,
    environments: {
      default: wasDefault ? remaining[0] ?? environment : manifest.environments!.default,
      list,
    },
  });

  const written = regenerateTemplates(cwd, readManifest(cwd, "slskit env remove"));

  logger.info(`\nRemoved environment "${environment}".`);
  if (wasDefault && remaining.length > 0) {
    logger.info(`  default environment is now "${remaining[0]}"`);
  }
  logger.info(
    `  ${dotenvFileName(environment)} was left in place — delete it yourself if you no longer need those values.`
  );
  if (written.length > 0) {
    logger.info(`  regenerated ${written.length} template(s)`);
  }
}

export async function envSetAction(
  assignment: string,
  options: EnvSetOptions
): Promise<void> {
  const cwd = process.cwd();
  const manifest = readManifest(cwd, "slskit env set");
  const environment = resolveEnvironmentName(manifest, options.env);
  const config = requireEnvironment(manifest, environment);

  const eq = assignment.indexOf("=");
  const hasValue = eq > 0;
  const key = parseKey(hasValue ? assignment.slice(0, eq) : assignment);
  const value = hasValue ? assignment.slice(eq + 1) : undefined;

  if (options.ssm && options.secret) {
    throw new CliError('Pass either "--secret" or "--ssm", not both.');
  }

  let def: EnvVarDef;
  let where: string;

  if (options.ssm) {
    def = { ssm: options.ssm };
    where = `SSM parameter ${options.ssm}`;
  } else if (options.secret) {
    if (value === undefined) {
      throw new CliError(`A secret needs a value: slskit env set ${key}=<value> --secret`);
    }
    def = { secret: true };
    ensureDotenvIgnored(cwd);
    const file = setDotenvValue(cwd, environment, key, value);
    where = file;
  } else {
    if (value === undefined) {
      throw new CliError(`A value is required: slskit env set ${key}=<value>`);
    }
    def = { value };
    where = "slskit.json";
  }

  const variables = { ...config.variables, [key]: def };
  const knownBefore = Object.keys(config.variables ?? {});

  writeManifest(cwd, {
    ...manifest,
    environments: {
      default: manifest.environments!.default,
      list: {
        ...manifest.environments!.list,
        [environment]: { ...config, variables },
      },
    },
  });

  logger.info(`\nSet ${key} for environment "${environment}".`);
  logger.info(`  stored in: ${where}`);

  // A brand-new variable name means every template needs a matching parameter.
  if (!knownBefore.includes(key)) {
    const written = regenerateTemplates(cwd, readManifest(cwd, "slskit env set"));
    if (written.length > 0) {
      logger.info(`  regenerated ${written.length} template(s) for the new parameter`);
    }
  }
}

export async function envUnsetAction(
  key: string,
  options: EnvUnsetOptions
): Promise<void> {
  const cwd = process.cwd();
  const manifest = readManifest(cwd, "slskit env unset");
  const environment = resolveEnvironmentName(manifest, options.env);
  const config = requireEnvironment(manifest, environment);
  const name = parseKey(key);

  if (!config.variables?.[name]) {
    throw new CliError(
      `Variable "${name}" is not set for environment "${environment}".`
    );
  }

  const variables = { ...config.variables };
  delete variables[name];

  writeManifest(cwd, {
    ...manifest,
    environments: {
      default: manifest.environments!.default,
      list: {
        ...manifest.environments!.list,
        [environment]: { ...config, variables },
      },
    },
  });

  unsetDotenvValue(cwd, environment, name);
  const written = regenerateTemplates(cwd, readManifest(cwd, "slskit env unset"));

  logger.info(`\nRemoved ${name} from environment "${environment}".`);
  if (written.length > 0) {
    logger.info(`  regenerated ${written.length} template(s)`);
  }
}

export async function envVarsAction(options: EnvVarsOptions): Promise<void> {
  const cwd = process.cwd();
  const manifest = readManifest(cwd, "slskit env vars");
  const environment = resolveEnvironmentName(manifest, options.env);
  const config = requireEnvironment(manifest, environment);
  const secrets = readDotenv(cwd, environment);

  logger.info(`\nVariables for environment "${environment}":\n`);
  // Always shown first: it is generated, not stored, and every name derives from it.
  logger.info(`  ${APP_ENVIRONMENT_KEY}=${environment}   (generated)`);

  // Declared and undeclared together: a key typed straight into the .env file
  // reaches the functions exactly like one added with "slskit env set".
  const keys = environmentEnvKeys(cwd, manifest, environment);

  for (const key of keys) {
    const def = config.variables?.[key];

    if (!def) {
      const held = secrets[key] ?? "";
      const shown = options.showSecrets || held === "" ? held : "********";
      logger.info(`  ${key}=${shown}   (${dotenvFileName(environment)})`);
      continue;
    }

    const source = envVarSource(def);

    if (source === "ssm") {
      logger.info(`  ${key}=<ssm:${def.ssm}>   (resolved by AWS at deploy)`);
      continue;
    }

    if (source === "secret") {
      const held = secrets[key];
      const shown = options.showSecrets
        ? held ?? "(missing)"
        : held
          ? "********"
          : "(missing)";
      logger.info(`  ${key}=${shown}   (secret, ${dotenvFileName(environment)})`);
      continue;
    }

    logger.info(`  ${key}=${def.value ?? ""}   (slskit.json)`);
  }

  const hidden = keys.some(
    (key) => config.variables?.[key]?.secret || config.variables?.[key] === undefined
  );

  if (keys.length === 0) {
    logger.info(
      `\n  No variables set yet. Add one with "slskit env set KEY=value", or put it straight into ${dotenvFileName(environment)}.`
    );
  } else if (!options.showSecrets && hidden) {
    logger.info("\nRe-run with --show-secrets to reveal hidden values.");
  }
}

// Called by init and configure so a new environment always has its dotenv file.
export function seedDotenv(cwd: string, environment: string): string {
  ensureDotenvIgnored(cwd);
  const existing = readDotenv(cwd, environment);
  return writeDotenv(cwd, environment, existing);
}

export { stackNameFor };
