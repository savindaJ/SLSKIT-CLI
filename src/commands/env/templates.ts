import fs from "node:fs";
import path from "node:path";
import type { ProjectManifest } from "../../core/environments.js";
import { envParameterName } from "../init/templates/helpers.js";
import { serviceTemplatePath } from "../init/types.js";
import { samRootTemplate, samServiceTemplate } from "../init/templates/sam.js";
import { toInitAnswers, toServiceDefs } from "../function/manifest.js";
import type { ProjectManifest as FunctionManifest } from "../function/types.js";
import { projectEnvKeys } from "./keys.js";

// Templates declare a CloudFormation parameter per variable name, so every template
// has to be rewritten whenever that set changes in any environment.
export function regenerateTemplates(
  cwd: string,
  manifest: ProjectManifest
): string[] {
  const functionView = manifest as unknown as FunctionManifest;

  if (!Array.isArray(functionView.applications)) {
    return [];
  }

  const answers = toInitAnswers(functionView);
  const apps = toServiceDefs(functionView);
  const envKeys = projectEnvKeys(cwd, manifest);

  const written: string[] = [];

  for (const app of apps) {
    const relative = serviceTemplatePath(app.name);
    const full = path.join(cwd, relative);
    // Absent in a project generated before services had their own templates.
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, samServiceTemplate(answers, app, envKeys));
    written.push(relative);
  }

  fs.writeFileSync(
    path.join(cwd, "template.yaml"),
    samRootTemplate(answers, apps, envKeys)
  );
  written.push("template.yaml");

  return written;
}

// The stage parameters the root template currently declares. Scoped to the
// Parameters block so a resource that happens to start with "Env" is never counted.
function declaredStageParameters(cwd: string): Set<string> {
  const file = path.join(cwd, "template.yaml");
  if (!fs.existsSync(file)) {
    return new Set();
  }

  const body = fs.readFileSync(file, "utf8");
  const block = /^Parameters:\n((?: .*\n|\n)*)/m.exec(body);
  if (!block) {
    return new Set();
  }

  const names = new Set<string>();
  for (const match of block[1].matchAll(/^ {2}(Env[A-Za-z0-9]*):$/gm)) {
    names.add(match[1]);
  }

  return names;
}

// Variables can appear without any slskit command running -- someone edits
// .env.production by hand -- so "run" and "deploy" reconcile the templates with the
// current key set before handing anything to SAM. Returns the files it rewrote,
// empty when they were already in step.
export function syncTemplates(cwd: string, manifest: ProjectManifest): string[] {
  const wanted = new Set(projectEnvKeys(cwd, manifest).map(envParameterName));
  const declared = declaredStageParameters(cwd);

  const inStep =
    wanted.size === declared.size && [...wanted].every((name) => declared.has(name));

  return inStep ? [] : regenerateTemplates(cwd, manifest);
}
