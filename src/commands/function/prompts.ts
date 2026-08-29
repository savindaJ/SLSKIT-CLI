import { CliError } from "../../core/errors.js";
import { logger } from "../../core/logger.js";
import {
  RUNTIME_ALIASES,
  memoryLabel,
  parseAlias,
  parseMemory,
} from "../init/prompts.js";
import { MEMORY_SIZES } from "../init/types.js";
import type { HttpMethod, MemorySize, RuntimeId } from "../init/types.js";
import type { FunctionOptions, ProjectManifest } from "./types.js";

const HTTP_METHODS: HttpMethod[] = ["GET", "POST", "PUT", "DELETE", "PATCH"];
const IDENTIFIER = /^[A-Za-z][A-Za-z0-9]*$/;

function parseMethod(value: string | undefined): HttpMethod | undefined {
  if (!value) {
    return undefined;
  }
  const upper = value.trim().toUpperCase();
  if (!HTTP_METHODS.includes(upper as HttpMethod)) {
    throw new CliError(`Unknown HTTP method "${value}". Expected ${HTTP_METHODS.join(", ")}.`);
  }
  return upper as HttpMethod;
}

// The route "slskit function" gives a new function. Kept here so the uniqueness
// check and the generator can never disagree about what is being created.
export function functionHttpPath(appName: string, functionName: string): string {
  return `/${appName}/${functionName}`;
}

interface FunctionLocation {
  app: string;
  fn: string;
}

// A function name has to be unique across the whole project, not just its own
// application: the Lambda is physically named <project>-<environment>-<function>,
// and with one shared API Gateway the template's logical id is <Name>Function. Both
// are project-scoped, so reusing a name in another application silently replaces the
// first function instead of failing -- SAM validates and builds it without complaint.
function findFunctionNamed(
  manifest: ProjectManifest,
  name: string
): FunctionLocation | undefined {
  const wanted = name.toLowerCase();

  for (const app of manifest.applications) {
    for (const fn of app.functions) {
      if (fn.name.toLowerCase() === wanted) {
        return { app: app.name, fn: fn.name };
      }
    }
  }

  return undefined;
}

function findRoute(
  manifest: ProjectManifest,
  method: string,
  path: string
): FunctionLocation | undefined {
  for (const app of manifest.applications) {
    for (const fn of app.functions) {
      if (
        fn.apiGateway.enabled &&
        fn.apiGateway.path === path &&
        (fn.apiGateway.method ?? "GET").toUpperCase() === method.toUpperCase()
      ) {
        return { app: app.name, fn: fn.name };
      }
    }
  }

  return undefined;
}

// Returns the reason this name cannot be used, or undefined when it is free.
export function functionNameProblem(
  manifest: ProjectManifest,
  appName: string,
  value: string
): string | undefined {
  const trimmed = value.trim();

  if (!IDENTIFIER.test(trimmed)) {
    return `Function name must start with a letter and contain only letters and numbers (got "${value}").`;
  }

  const clash = findFunctionNamed(manifest, trimmed);
  if (clash) {
    return clash.app === appName
      ? `Function "${clash.fn}" already exists in application "${appName}". Choose another name.`
      : `Function "${clash.fn}" already exists in application "${clash.app}", and every function in a project needs its own name. Choose another name.`;
  }

  return undefined;
}

export function applicationNameProblem(
  manifest: ProjectManifest,
  value: string
): string | undefined {
  const trimmed = value.trim();

  if (!IDENTIFIER.test(trimmed)) {
    return `Application name must start with a letter and contain only letters and numbers (got "${value}").`;
  }

  if (manifest.applications.some((app) => app.name === trimmed)) {
    return `Application "${trimmed}" already exists. Choose another name, or add to it with --app ${trimmed}.`;
  }

  return undefined;
}

export interface ApplicationTarget {
  appName: string;
  isNewApp: boolean;
}

async function resolveApplication(
  manifest: ProjectManifest,
  options: FunctionOptions
): Promise<ApplicationTarget> {
  if (options.app && options.newApp) {
    throw new CliError('Pass either "--app" or "--new-app", not both.');
  }

  if (options.newApp) {
    const problem = applicationNameProblem(manifest, options.newApp);
    if (problem) {
      throw new CliError(problem);
    }
    return { appName: options.newApp.trim(), isNewApp: true };
  }

  if (options.app) {
    const existing = manifest.applications.find((app) => app.name === options.app);
    if (!existing) {
      const known = manifest.applications.map((app) => app.name).join(", ") || "(none)";
      throw new CliError(`Application "${options.app}" was not found. Existing: ${known}.`);
    }
    return { appName: existing.name, isNewApp: false };
  }

  if (!process.stdin.isTTY) {
    throw new CliError('Non-interactive mode needs "--app <name>" or "--new-app <name>".');
  }

  const { select, input } = await import("@inquirer/prompts");

  const target = await select<"existing" | "new">({
    message: "Add this function to:",
    choices: [
      { name: "An existing application", value: "existing" },
      { name: "A new application", value: "new" },
    ],
  });

  if (target === "new") {
    // validate re-asks in place, so a name that is taken costs one keystroke
    // rather than the whole command.
    const name = await input({
      message: "New application name:",
      required: true,
      validate: (value) => applicationNameProblem(manifest, value) ?? true,
    });
    return { appName: name.trim(), isNewApp: true };
  }

  if (manifest.applications.length === 0) {
    throw new CliError('This project has no applications yet. Choose "A new application" instead.');
  }

  const appName = await select<string>({
    message: "Application:",
    choices: manifest.applications.map((app) => ({
      name: `${app.name} (${app.functions.length} function${app.functions.length === 1 ? "" : "s"})`,
      value: app.name,
    })),
  });

  const existingApp = manifest.applications.find((app) => app.name === appName);
  if (existingApp && existingApp.functions.length > 0) {
    logger.info(
      `\nExisting functions in "${appName}": ${existingApp.functions.map((fn) => fn.name).join(", ")}`
    );
  }

  return { appName, isNewApp: false };
}

export interface FunctionAnswers {
  appName: string;
  isNewApp: boolean;
  functionName: string;
  method: HttpMethod;
  memorySize: MemorySize;
  runtime: RuntimeId;
}

export async function collectFunctionAnswers(
  manifest: ProjectManifest,
  options: FunctionOptions
): Promise<FunctionAnswers> {
  const { appName, isNewApp } = await resolveApplication(manifest, options);

  let functionName = options.name?.trim();
  let method = parseMethod(options.method);
  let memorySize = parseMemory(options.memory);
  let runtime = parseAlias(options.runtime, RUNTIME_ALIASES, "runtime");

  const needsPrompt =
    !functionName || (manifest.apiGateway.enabled && !method) || !memorySize || !runtime;

  if (needsPrompt && !process.stdin.isTTY) {
    throw new CliError(
      'Non-interactive mode needs a function name plus "--method", "--memory", and "--runtime".'
    );
  }

  if (needsPrompt) {
    const { input, select } = await import("@inquirer/prompts");

    functionName ??= await input({
      message: "Function name:",
      required: true,
      validate: (value) => functionNameProblem(manifest, appName, value) ?? true,
    });

    if (manifest.apiGateway.enabled) {
      method ??= await select<HttpMethod>({
        message: "HTTP method:",
        choices: HTTP_METHODS.map((value) => ({ name: value, value })),
      });
    }

    memorySize ??= await select<MemorySize>({
      message: "Function memory size:",
      default: manifest.functions.memorySize,
      choices: MEMORY_SIZES.map((size) => ({ name: memoryLabel(size), value: size })),
    });

    runtime ??= await select<RuntimeId>({
      message: "Language:",
      default: manifest.runtime.id,
      choices: [
        { name: "TypeScript (Node.js)", value: "typescript" },
        { name: "JavaScript (Node.js)", value: "javascript" },
        { name: "Python", value: "python" },
      ],
    });
  }

  const name = (functionName ?? "").trim();

  // Reached with --name on a non-interactive run, where there is nothing to re-ask.
  const problem = functionNameProblem(manifest, appName, name);
  if (problem) {
    throw new CliError(problem);
  }

  const path = functionHttpPath(appName, name);
  const chosenMethod = method ?? "GET";
  const routeClash = manifest.apiGateway.enabled
    ? findRoute(manifest, chosenMethod, path)
    : undefined;

  if (routeClash) {
    throw new CliError(
      `${chosenMethod} ${path} is already served by "${routeClash.app}/${routeClash.fn}". Choose another name or method.`
    );
  }

  return {
    appName,
    isNewApp,
    functionName: name,
    method: chosenMethod,
    memorySize: memorySize as MemorySize,
    runtime: runtime as RuntimeId,
  };
}
