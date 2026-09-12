import { pascal } from "../init/templates/helpers.js";

// What a single changed file means for the build.
//   "function" -- rebuild just that one, the local API keeps serving everything else
//   "full"     -- rebuild everything (shared code is a layer inside every stack)
//   "restart"  -- routes or parameter values changed, which sam only reads at startup
export type ChangeKind = "function" | "full" | "restart";

export interface Change {
  kind: ChangeKind;
  /** Set only for "function": the resource id sam build takes, e.g. AuthStack/LoginFunction. */
  resourceId?: string;
  label: string;
}

export interface ApplicationView {
  name: string;
  functions?: { name: string }[];
}

// Per-service stacks put every function behind its application's stack, so the id sam
// build wants is the two joined. One shared API Gateway means a single flat template
// instead, where the function is addressed on its own.
export function resourceIdFor(
  appName: string,
  functionName: string,
  sharedApi = false
): string {
  const fn = `${pascal(functionName)}Function`;
  return sharedApi ? fn : `${pascal(appName)}Stack/${fn}`;
}

function findFunction(
  applications: ApplicationView[],
  appName: string,
  functionName: string
): boolean {
  return (applications.find((app) => app.name === appName)?.functions ?? []).some(
    (fn) => fn.name === functionName
  );
}

// A service module is imported by the handler of the same name, which is the shape
// every generated project has. Anything that does not match that 1:1 convention
// falls back to a full build rather than guessing which functions import it.
function fromService(
  applications: ApplicationView[],
  segments: string[],
  sharedApi: boolean
): Change | undefined {
  if (segments.length !== 2) {
    return undefined;
  }

  const [appName, file] = segments;
  const functionName = file.replace(/\.[^.]+$/, "");

  if (!findFunction(applications, appName, functionName)) {
    return undefined;
  }

  return {
    kind: "function",
    resourceId: resourceIdFor(appName, functionName, sharedApi),
    label: `${appName}/${functionName}`,
  };
}

function fromHandler(
  applications: ApplicationView[],
  segments: string[],
  sharedApi: boolean
): Change | undefined {
  if (segments.length < 2) {
    return undefined;
  }

  const [appName, functionName] = segments;

  if (!findFunction(applications, appName, functionName)) {
    return undefined;
  }

  return {
    kind: "function",
    resourceId: resourceIdFor(appName, functionName, sharedApi),
    label: `${appName}/${functionName}`,
  };
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.replace(/\\/g, "/");
}

export function classifyChange(
  applications: ApplicationView[],
  relativePath: string,
  sharedApi = false
): Change {
  const normalizedPath = normalizeRelativePath(relativePath);
  const segments = normalizedPath.split("/").filter(Boolean);
  const base = segments[segments.length - 1] ?? normalizedPath;

  // Routes, memory, layers and parameter values are all read when sam starts.
  // Service templates live in templates/ and are named after their service, so it is
  // the directory that identifies them rather than the filename.
  const isTemplate =
    base === "template.yaml" ||
    (segments[0] === "templates" && /\.ya?ml$/.test(base));

  if (isTemplate || base === "slskit.json" || base.startsWith(".env")) {
    return { kind: "restart", label: base };
  }

  if (segments[0] !== "src") {
    return { kind: "full", label: normalizedPath };
  }

  const area = segments[1];
  const rest = segments.slice(2);

  if (area === "functions") {
    return (
      fromHandler(applications, rest, sharedApi) ?? { kind: "full", label: normalizedPath }
    );
  }

  if (area === "services") {
    return (
      fromService(applications, rest, sharedApi) ?? { kind: "full", label: normalizedPath }
    );
  }

  // src/shared is published as a layer attached to every function in every stack.
  return { kind: "full", label: normalizedPath };
}

// One decision for a whole batch of file events: the most disruptive change wins,
// and a batch of ordinary edits collapses to the set of functions to rebuild.
export function planRebuild(changes: Change[]): {
  kind: ChangeKind;
  resourceIds: string[];
  labels: string[];
} {
  const labels = [...new Set(changes.map((change) => change.label))];

  if (changes.some((change) => change.kind === "restart")) {
    return { kind: "restart", resourceIds: [], labels };
  }

  if (changes.some((change) => change.kind === "full")) {
    return { kind: "full", resourceIds: [], labels };
  }

  return {
    kind: "function",
    resourceIds: [...new Set(changes.map((change) => change.resourceId!))],
    labels,
  };
}
