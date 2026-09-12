import { CliError } from "../../core/errors.js";
import { SRC_DIR, serviceTemplatePath, sourceExt } from "../init/types.js";
import type { InitAnswers, ServiceDef, ServiceFunction } from "../init/types.js";

export type RemovalKind = "function" | "service";

export interface RemovalTarget {
  kind: RemovalKind;
  appName: string;
  // Only set when kind is "function".
  functionName?: string;
}

export interface RemovalPlan {
  kind: RemovalKind;
  appName: string;
  functionName?: string;
  // The application list the manifest and every template are rebuilt from.
  apps: ServiceDef[];
  // Files and directories to delete, relative to the project root.
  paths: string[];
  functionsRemoved: string[];
  routes: string[];
  // A service whose last function is removed has nothing left to generate -- an
  // empty service template is not valid CloudFormation -- so it goes too.
  cascadesToService: boolean;
}

function functionPaths(
  answers: InitAnswers,
  appName: string,
  fn: ServiceFunction
): string[] {
  return [
    `${SRC_DIR}/functions/${appName}/${fn.name}`,
    `${SRC_DIR}/services/${appName}/${fn.name}.${sourceExt(fn.runtime ?? answers.runtime)}`,
  ];
}

function servicePaths(appName: string): string[] {
  return [
    `${SRC_DIR}/functions/${appName}`,
    `${SRC_DIR}/services/${appName}`,
    serviceTemplatePath(appName),
  ];
}

function routeLabel(fn: ServiceFunction): string {
  return `${fn.method} ${fn.httpPath}`;
}

function totalFunctions(apps: ServiceDef[]): number {
  return apps.reduce((count, app) => count + app.functions.length, 0);
}

// Works out everything a removal touches without writing anything, so the command
// can describe the change before it is confirmed -- and so the whole decision is
// testable without a filesystem.
export function planRemoval(
  answers: InitAnswers,
  apps: ServiceDef[],
  target: RemovalTarget
): RemovalPlan {
  const app = apps.find((each) => each.name === target.appName);

  if (!app) {
    const known = apps.map((each) => each.name).join(", ") || "(none)";
    throw new CliError(
      `Application "${target.appName}" was not found. Existing: ${known}.`
    );
  }

  if (target.kind === "service") {
    const remaining = apps.filter((each) => each.name !== app.name);

    if (totalFunctions(remaining) === 0) {
      throw new CliError(
        `Removing "${app.name}" would leave the project with no functions, and a stack with no resources cannot be deployed. Add another function first, or start over with "slskit init".`
      );
    }

    return {
      kind: "service",
      appName: app.name,
      apps: remaining,
      paths: servicePaths(app.name),
      functionsRemoved: app.functions.map((fn) => fn.name),
      routes: app.functions.map(routeLabel),
      cascadesToService: false,
    };
  }

  const fn = app.functions.find((each) => each.name === target.functionName);

  if (!fn) {
    const known = app.functions.map((each) => each.name).join(", ") || "(none)";
    throw new CliError(
      `Function "${target.functionName}" was not found in application "${app.name}". Existing: ${known}.`
    );
  }

  const keptFunctions = app.functions.filter((each) => each.name !== fn.name);
  const cascadesToService = keptFunctions.length === 0;

  const remaining = cascadesToService
    ? apps.filter((each) => each.name !== app.name)
    : apps.map((each) =>
        each.name === app.name ? { ...each, functions: keptFunctions } : each
      );

  if (totalFunctions(remaining) === 0) {
    throw new CliError(
      `"${fn.name}" is the only function in this project, and a stack with no resources cannot be deployed. Add another function first, or start over with "slskit init".`
    );
  }

  return {
    kind: "function",
    appName: app.name,
    functionName: fn.name,
    apps: remaining,
    paths: cascadesToService ? servicePaths(app.name) : functionPaths(answers, app.name, fn),
    functionsRemoved: [fn.name],
    routes: [routeLabel(fn)],
    cascadesToService,
  };
}

// Drops every generated-file entry that the removal deletes, including anything
// nested under a removed directory (a Python function's __init__.py, say).
export function pruneGeneratedFiles(files: string[], removed: string[]): string[] {
  return files.filter(
    (file) => !removed.some((path) => file === path || file.startsWith(`${path}/`))
  );
}
