import fs from "node:fs";
import path from "node:path";
import { CliError } from "../../core/errors.js";
import { manifestPathFor } from "../../core/environments.js";
import type { HttpMethod, InitAnswers, RuntimeId, ServiceDef } from "../init/types.js";
import type { ProjectManifest } from "./types.js";

export function readProjectManifest(
  cwd: string,
  command = "slskit function"
): ProjectManifest {
  const manifestPath = manifestPathFor(cwd);

  if (!manifestPath) {
    throw new CliError(
      `No slskit.json found in ${cwd}. Run "slskit init" first, or run "${command}" from your project root.`
    );
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as ProjectManifest;

  if (manifest.framework?.id !== "sam") {
    throw new CliError(
      `"${command}" supports AWS SAM projects only (this project uses "${manifest.framework?.id ?? "unknown"}").`
    );
  }

  return manifest;
}

// The manifest stores the AWS Lambda runtime string (e.g. "nodejs20.x"), which loses
// the TypeScript/JavaScript distinction; the generated handler's extension still has it.
function runtimeFromHandlerFile(handlerFile: string): RuntimeId {
  if (handlerFile.endsWith(".ts")) {
    return "typescript";
  }
  if (handlerFile.endsWith(".py")) {
    return "python";
  }
  return "javascript";
}

export function toInitAnswers(manifest: ProjectManifest): InitAnswers {
  return {
    name: manifest.name,
    runtime: manifest.runtime.id,
    database: manifest.database.id,
    apiGateway: manifest.apiGateway.enabled,
    sharedApi: manifest.apiGateway.enabled && manifest.apiGateway.perService === false,
    layer: manifest.layer.enabled,
    memorySize: manifest.functions.memorySize,
    force: false,
  };
}

export function toServiceDefs(manifest: ProjectManifest): ServiceDef[] {
  return manifest.applications.map((app) => ({
    name: app.name,
    functions: app.functions.map((fn) => ({
      name: fn.name,
      httpPath: fn.apiGateway.path ?? `/${app.name}/${fn.name}`,
      method: (fn.apiGateway.method as HttpMethod | undefined) ?? "GET",
      runtime: runtimeFromHandlerFile(fn.handlerFile),
      memorySize: fn.memorySize,
    })),
  }));
}
