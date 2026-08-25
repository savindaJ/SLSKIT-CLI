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

export function validateIdentifier(value: string, label: string): string {
  const trimmed = value.trim();
  if (!IDENTIFIER.test(trimmed)) {
    throw new CliError(
      `${label} must start with a letter and contain only letters and numbers (got "${value}").`
    );
  }
  return trimmed;
}

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
    const name = validateIdentifier(options.newApp, "Application name");
    if (manifest.applications.some((app) => app.name === name)) {
      throw new CliError(`Application "${name}" already exists. Use --app ${name} instead.`);
    }
    return { appName: name, isNewApp: true };
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
    const name = await input({ message: "New application name:", required: true });
    const appName = validateIdentifier(name, "Application name");
    if (manifest.applications.some((app) => app.name === appName)) {
      throw new CliError(`Application "${appName}" already exists.`);
    }
    return { appName, isNewApp: true };
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

    functionName ??= await input({ message: "Function name:", required: true });

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

  const name = validateIdentifier(functionName ?? "", "Function name");

  const existingApp = manifest.applications.find((app) => app.name === appName);
  if (existingApp?.functions.some((fn) => fn.name === name)) {
    throw new CliError(`Function "${name}" already exists in application "${appName}".`);
  }

  return {
    appName,
    isNewApp,
    functionName: name,
    method: method ?? "GET",
    memorySize: memorySize as MemorySize,
    runtime: runtime as RuntimeId,
  };
}
