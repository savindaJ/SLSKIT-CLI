import fs from "node:fs";
import path from "node:path";
import { allEnvKeys } from "../../core/manifest.js";
import type { ProjectManifest } from "../../core/manifest.js";
import { serviceTemplatePath } from "../init/types.js";
import { samRootTemplate, samServiceTemplate } from "../init/templates/sam.js";
import { toInitAnswers, toServiceDefs } from "../function/manifest.js";
import type { ProjectManifest as FunctionManifest } from "../function/types.js";

// Templates declare a parameter per environment variable, so every template has to
// be rewritten whenever the set of variable names changes in any stage.
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
  const envKeys = allEnvKeys(manifest);

  const written: string[] = [];

  for (const app of apps) {
    const relative = serviceTemplatePath(app.name);
    fs.writeFileSync(
      path.join(cwd, relative),
      samServiceTemplate(answers, app, envKeys)
    );
    written.push(relative);
  }

  fs.writeFileSync(
    path.join(cwd, "template.yaml"),
    samRootTemplate(answers, apps, envKeys)
  );
  written.push("template.yaml");

  return written;
}
