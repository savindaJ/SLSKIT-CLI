import { CliError } from "../../core/errors.js";
import type { ProjectManifest } from "../../core/environments.js";
import {
  functionScope,
  requireService,
  scopeFromFlags,
  type Scope,
  type ScopeOptions,
} from "../../core/scope.js";

export interface InvokeScopeOptions extends ScopeOptions {
  /** Positional function name from the CLI */
  name?: string;
}

async function promptForFunction(
  manifest: ProjectManifest,
  service?: string
): Promise<Scope> {
  const { select } = await import("@inquirer/prompts");

  let appName = service;
  if (!appName) {
    const apps = (manifest.applications as { name: string; functions?: { name: string }[] }[])
      .filter((app) => (app.functions ?? []).length > 0);

    if (apps.length === 0) {
      throw new CliError("This project has no functions to invoke.");
    }

    appName = await select<string>({
      message: "Service:",
      choices: apps.map((app) => ({
        name: `${app.name} (${(app.functions ?? []).length} functions)`,
        value: app.name,
      })),
    });
  }

  const app = requireService(manifest, appName);
  const functionName = await select<string>({
    message: "Function:",
    choices: (app.functions ?? []).map((fn) => ({ name: fn.name, value: fn.name })),
  });

  return functionScope(manifest, functionName);
}

export async function resolveInvokeScope(
  manifest: ProjectManifest,
  options: InvokeScopeOptions
): Promise<Scope> {
  const merged: InvokeScopeOptions = {
    ...options,
    function: options.function ?? options.name?.trim(),
  };

  if (options.all) {
    throw new CliError(
      '"slskit invoke" targets one function. Pass its name or use --function <name>.'
    );
  }

  const fromFlags = scopeFromFlags(manifest, merged);
  if (fromFlags) {
    if (fromFlags.kind === "function") {
      return fromFlags;
    }

    // --service without --function: pick one interactively, or fail without a TTY.
    if (fromFlags.kind === "service") {
      if (!process.stdin.isTTY) {
        throw new CliError(
          `Pass a function name to invoke in service "${fromFlags.service}", e.g. --function login.`
        );
      }
      return promptForFunction(manifest, fromFlags.service);
    }
  }

  if (merged.function) {
    return functionScope(manifest, merged.function);
  }

  if (!process.stdin.isTTY) {
    throw new CliError(
      'Pass a function name, e.g. slskit invoke login --event events/login.json'
    );
  }

  return promptForFunction(manifest);
}