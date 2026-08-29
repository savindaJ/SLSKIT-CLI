import { resourceIdFor } from "../run/resources.js";
import {
  allScope,
  applicationsOf,
  functionScope,
  promptForScope,
  scopeFromFlags,
  serviceScope,
} from "../../core/scope.js";
import type { Scope, ScopeOptions } from "../../core/scope.js";
import type { ProjectManifest } from "../../core/environments.js";

export { allScope, applicationsOf, functionScope, serviceScope };
export type { Scope as DeployScope };

// Which template resources a scoped deploy syncs. Deploys always go through the
// nested service stacks, so every id is qualified by its stack.
export function resourceIdsFor(manifest: ProjectManifest, scope: Scope): string[] {
  if (scope.kind === "all") {
    return [];
  }

  return applicationsOf(manifest)
    .filter((app) => app.name === scope.service)
    .flatMap((app) => app.functions ?? [])
    .filter((fn) => scope.kind !== "function" || fn.name === scope.functionName)
    .map((fn) => resourceIdFor(scope.service, fn.name));
}

export async function resolveDeployScope(
  manifest: ProjectManifest,
  options: ScopeOptions & { yes?: boolean }
): Promise<Scope> {
  const fromFlags = scopeFromFlags(manifest, options);
  if (fromFlags) {
    return fromFlags;
  }

  // Without a TTY there is nobody to ask, and --yes already means "no questions".
  if (options.yes || !process.stdin.isTTY) {
    return allScope;
  }

  return promptForScope(manifest, "deploy", "Everything — the whole project");
}
