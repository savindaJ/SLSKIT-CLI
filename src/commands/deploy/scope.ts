import { CliError } from "../../core/errors.js";
import { resourceIdFor } from "../run/resources.js";
import type { ProjectManifest } from "../../core/environments.js";

export interface ApplicationView {
  name: string;
  functions?: { name: string }[];
}

export type DeployScope =
  | { kind: "all"; label: string; resourceIds: [] }
  // A service or a single function is a code-only update of a stack that already
  // exists; only "all" can create infrastructure.
  | { kind: "service"; label: string; service: string; resourceIds: string[] }
  | {
      kind: "function";
      label: string;
      service: string;
      functionName: string;
      resourceIds: string[];
    };

export function applicationsOf(manifest: ProjectManifest): ApplicationView[] {
  return (manifest.applications as ApplicationView[] | undefined) ?? [];
}

// One shared API Gateway means a single flat template, where a function is
// addressed on its own rather than through its application's nested stack.
export function sharesOneApi(manifest: ProjectManifest): boolean {
  const api = manifest.apiGateway as { perService?: boolean } | undefined;
  return api?.perService === false;
}

function requireService(manifest: ProjectManifest, name: string): ApplicationView {
  const apps = applicationsOf(manifest);
  const found = apps.find((app) => app.name === name);

  if (!found) {
    const known = apps.map((app) => app.name).join(", ") || "(none)";
    throw new CliError(`Service "${name}" was not found. This project has: ${known}.`);
  }

  return found;
}

export function serviceScope(manifest: ProjectManifest, name: string): DeployScope {
  const app = requireService(manifest, name);
  const functions = app.functions ?? [];

  if (functions.length === 0) {
    throw new CliError(`Service "${name}" has no functions to deploy.`);
  }

  return {
    kind: "service",
    label: `service "${name}" (${functions.length} function${functions.length === 1 ? "" : "s"})`,
    service: name,
    resourceIds: functions.map((fn) =>
      resourceIdFor(name, fn.name, sharesOneApi(manifest))
    ),
  };
}

// Function names are unique across a project, so the service is derived rather than
// asked for a second time.
export function functionScope(manifest: ProjectManifest, name: string): DeployScope {
  for (const app of applicationsOf(manifest)) {
    for (const fn of app.functions ?? []) {
      if (fn.name === name) {
        return {
          kind: "function",
          label: `function "${app.name}/${fn.name}"`,
          service: app.name,
          functionName: fn.name,
          resourceIds: [resourceIdFor(app.name, fn.name, sharesOneApi(manifest))],
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

export const allScope: DeployScope = {
  kind: "all",
  label: "the whole project",
  resourceIds: [],
};

// Asks what to deploy, then which one. Only reached with a TTY and no scope flag.
export async function promptForScope(manifest: ProjectManifest): Promise<DeployScope> {
  const apps = applicationsOf(manifest).filter((app) => (app.functions ?? []).length > 0);

  if (apps.length === 0) {
    return allScope;
  }

  const { select } = await import("@inquirer/prompts");

  const kind = await select<"all" | "service" | "function">({
    message: "What do you want to deploy?",
    choices: [
      { name: "Everything — the whole project", value: "all" },
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
