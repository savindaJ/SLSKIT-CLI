import fs from "node:fs";
import path from "node:path";
import type { ProjectManifest } from "../../core/environments.js";
import { projectEnvKeys } from "../env/keys.js";
import { toInitAnswers, toServiceDefs } from "../function/manifest.js";
import type { ProjectManifest as FunctionManifest } from "../function/types.js";
import { samFlatTemplate } from "../init/templates/sam.js";
import type { ServiceDef } from "../init/types.js";
import { allScope } from "../../core/scope.js";
import type { Scope } from "../../core/scope.js";

// Written at the project root so the flat template's "CodeUri: ./" resolves the same
// way the deployed templates' paths do.
export const LOCAL_TEMPLATE_FILE = ".slskit-local.yaml";
export const LOCAL_BUILD_DIR = path.join(".aws-sam", "local");

// A shared API Gateway lives in the root stack, and SAM local cannot resolve an API
// that a nested stack only holds an id for -- every route comes back 502. So local
// runs get a flattened copy of the same project instead. It is generated from the
// manifest on every run, so it can never drift from what gets deployed.
export function needsLocalTemplate(manifest: ProjectManifest): boolean {
  const api = manifest.apiGateway as
    | { enabled?: boolean; perService?: boolean }
    | undefined;

  return Boolean(api?.enabled) && api?.perService === false;
}

// Narrowing the template to one service or one function is what makes a scoped run
// fast: sam only builds the functions the template still contains.
function narrow(apps: ServiceDef[], scope: Scope): ServiceDef[] {
  if (scope.kind === "all") {
    return apps;
  }

  return apps
    .filter((app) => app.name === scope.service)
    .map((app) => ({
      ...app,
      functions: app.functions.filter(
        (fn) => scope.kind !== "function" || fn.name === scope.functionName
      ),
    }));
}

export function writeLocalTemplate(
  cwd: string,
  manifest: ProjectManifest,
  scope: Scope = allScope
): string {
  const functionView = manifest as unknown as FunctionManifest;
  const answers = toInitAnswers(functionView);
  const apps = narrow(toServiceDefs(functionView), scope);

  fs.writeFileSync(
    path.join(cwd, LOCAL_TEMPLATE_FILE),
    samFlatTemplate(answers, apps, projectEnvKeys(cwd, manifest))
  );

  return LOCAL_TEMPLATE_FILE;
}

// The built template sam local serves, rather than the source one.
export function localBuiltTemplate(): string {
  return path.join(LOCAL_BUILD_DIR, "template.yaml");
}
