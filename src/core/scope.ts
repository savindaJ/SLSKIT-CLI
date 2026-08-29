import { CliError } from "./errors.js";
import type { ProjectManifest } from "./environments.js";

export interface ApplicationView {
  name: string;
  functions?: { name: string }[];
}

export type ScopeKind = "all" | "service" | "function";

// What a command was asked to act on. Deploy turns this into template resource ids;
// run turns it into the set of functions to build and serve.
export type Scope =
  | { kind: "all"; label: string }
  | { kind: "service"; label: string; service: string }
  | { kind: "function"; label: string; service: string; functionName: string };

export const allScope: Scope = { kind: "all", label: "the whole project" };

export function applicationsOf(manifest: ProjectManifest): ApplicationView[] {
  return (manifest.applications as ApplicationView[] | undefined) ?? [];
}

export function requireService(
  manifest: ProjectManifest,
  name: string
): ApplicationView {
  const apps = applicationsOf(manifest);
  const found = apps.find((app) => app.name === name);

  if (!found) {
    const known = apps.map((app) => app.name).join(", ") || "(none)";
    throw new CliError(`Service "${name}" was not found. This project has: ${known}.`);
  }

  return found;
}

export function serviceScope(manifest: ProjectManifest, name: string): Scope {
  const app = requireService(manifest, name);
  const count = (app.functions ?? []).length;

  if (count === 0) {
    throw new CliError(`Service "${name}" has no functions.`);
  }

  return {
    kind: "service",
    label: `service "${name}" (${count} function${count === 1 ? "" : "s"})`,
    service: name,
  };
}

// Function names are unique across a project, so the service is derived rather than
// asked for a second time.
export function functionScope(manifest: ProjectManifest, name: string): Scope {
  for (const app of applicationsOf(manifest)) {
    for (const fn of app.functions ?? []) {
      if (fn.name === name) {
        return {
          kind: "function",
          label: `function "${app.name}/${fn.name}"`,
          service: app.name,
          functionName: fn.name,
        };
      }
    }
  }

  const known = applicationsOf(manifest)
    .flatMap((app) => (app.functions ?? []).map((fn) => fn.name))
    .join(", ");

  throw new CliError(
    `Function "${name}" was not found. This project has: ${known || "(none)"}.`
  );
}

export interface ScopeOptions {
  service?: string;
  function?: string;
  all?: boolean;
}

export function scopeFromFlags(
  manifest: ProjectManifest,
  options: ScopeOptions
): Scope | undefined {
  if (options.service && options.function) {
    throw new CliError('Pass either "--service" or "--function", not both.');
  }

  if (options.service) {
    return serviceScope(manifest, options.service);
  }

  if (options.function) {
    return functionScope(manifest, options.function);
  }

  return options.all ? allScope : undefined;
}

// Asks what to act on, then which one. Only reached with a TTY and no scope flag.
export async function promptForScope(
  manifest: ProjectManifest,
  verb: string,
  everything: string
): Promise<Scope> {
  const apps = applicationsOf(manifest).filter((app) => (app.functions ?? []).length > 0);

  if (apps.length === 0) {
    return allScope;
  }

  const { select } = await import("@inquirer/prompts");

  const kind = await select<ScopeKind>({
    message: `What do you want to ${verb}?`,
    choices: [
      { name: everything, value: "all" },
      { name: "One service — all of its functions", value: "service" },
      { name: "One function", value: "function" },
    ],
  });

  if (kind === "all") {
    return allScope;
  }

  if (kind === "service") {
    const name = await select<string>({
      message: "Service:",
      choices: apps.map((app) => ({
        name: `${app.name} (${(app.functions ?? []).length} functions)`,
        value: app.name,
      })),
    });
    return serviceScope(manifest, name);
  }

  const service = await select<string>({
    message: "Service:",
    choices: apps.map((app) => ({ name: app.name, value: app.name })),
  });

  const functionName = await select<string>({
    message: "Function:",
    choices: (requireService(manifest, service).functions ?? []).map((fn) => ({
      name: fn.name,
      value: fn.name,
    })),
  });

  return functionScope(manifest, functionName);
}
