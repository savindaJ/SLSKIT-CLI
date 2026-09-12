import { CliError } from "../../core/errors.js";
import type { ProjectManifest } from "../function/types.js";
import type { RemovalKind, RemovalTarget } from "./plan.js";
import type { RmOptions } from "./types.js";

interface FunctionLocation {
  app: string;
  fn: string;
}

// Function names are unique across the whole project, so a name is enough to find
// one -- the same property "slskit function" enforces when it creates them.
function findFunction(
  manifest: ProjectManifest,
  name: string
): FunctionLocation | undefined {
  const wanted = name.trim().toLowerCase();

  for (const app of manifest.applications) {
    for (const fn of app.functions) {
      if (fn.name.toLowerCase() === wanted) {
        return { app: app.name, fn: fn.name };
      }
    }
  }

  return undefined;
}

function findService(manifest: ProjectManifest, name: string): string | undefined {
  const wanted = name.trim().toLowerCase();
  return manifest.applications.find((app) => app.name.toLowerCase() === wanted)?.name;
}

function serviceNames(manifest: ProjectManifest): string {
  return manifest.applications.map((app) => app.name).join(", ") || "(none)";
}

function functionNames(manifest: ProjectManifest): string {
  return (
    manifest.applications.flatMap((app) => app.functions.map((fn) => fn.name)).join(", ") ||
    "(none)"
  );
}

function targetForFunction(manifest: ProjectManifest, name: string): RemovalTarget {
  const found = findFunction(manifest, name);

  if (!found) {
    throw new CliError(
      `Function "${name}" was not found. Existing functions: ${functionNames(manifest)}.`
    );
  }

  return { kind: "function", appName: found.app, functionName: found.fn };
}

function targetForService(manifest: ProjectManifest, name: string): RemovalTarget {
  const found = findService(manifest, name);

  if (!found) {
    throw new CliError(
      `Application "${name}" was not found. Existing applications: ${serviceNames(manifest)}.`
    );
  }

  return { kind: "service", appName: found };
}

// A bare name is resolved by looking it up. It is only ambiguous when a function and
// an application share a name, and then the flag settles it rather than a guess.
function targetForName(manifest: ProjectManifest, name: string): RemovalTarget {
  const asFunction = findFunction(manifest, name);
  const asService = findService(manifest, name);

  if (asFunction && asService) {
    throw new CliError(
      `"${name}" is both a function and an application. Pass --function ${name} or --service ${name} to say which.`
    );
  }

  if (asFunction) {
    return { kind: "function", appName: asFunction.app, functionName: asFunction.fn };
  }

  if (asService) {
    return { kind: "service", appName: asService };
  }

  throw new CliError(
    `Nothing named "${name}" in this project.\n  functions:    ${functionNames(manifest)}\n  applications: ${serviceNames(manifest)}`
  );
}

export async function resolveRemovalTarget(
  manifest: ProjectManifest,
  options: RmOptions
): Promise<RemovalTarget> {
  const service = options.service ?? options.app;

  if (options.function && service) {
    throw new CliError('Pass either "--function" or "--service", not both.');
  }

  if (options.function) {
    return targetForFunction(manifest, options.function);
  }

  if (service) {
    return targetForService(manifest, service);
  }

  if (options.name) {
    return targetForName(manifest, options.name);
  }

  if (!process.stdin.isTTY) {
    throw new CliError(
      'Non-interactive mode needs a name, "--function <name>" or "--service <name>".'
    );
  }

  const { select } = await import("@inquirer/prompts");

  const kind = await select<RemovalKind>({
    message: "What do you want to remove?",
    choices: [
      { name: "A function", value: "function" },
      { name: "An application — and every function in it", value: "service" },
    ],
  });

  if (manifest.applications.length === 0) {
    throw new CliError("This project has no applications to remove.");
  }

  if (kind === "service") {
    const appName = await select<string>({
      message: "Application:",
      choices: manifest.applications.map((app) => ({
        name: `${app.name} (${app.functions.length} function${app.functions.length === 1 ? "" : "s"})`,
        value: app.name,
      })),
    });

    return { kind: "service", appName };
  }

  const choices = manifest.applications.flatMap((app) =>
    app.functions.map((fn) => ({
      name: `${app.name}/${fn.name}${
        fn.apiGateway.enabled ? `  ${fn.apiGateway.method ?? "GET"} ${fn.apiGateway.path ?? ""}` : ""
      }`,
      value: `${app.name}.${fn.name}`,
    }))
  );

  if (choices.length === 0) {
    throw new CliError("This project has no functions to remove.");
  }

  const picked = await select<string>({ message: "Function:", choices });
  const [appName, functionName] = picked.split(".");

  return { kind: "function", appName, functionName };
}
