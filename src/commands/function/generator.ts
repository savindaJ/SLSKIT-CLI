import {
  SRC_DIR,
  handlerFileName,
  sameRuntimeFamily,
  serviceTemplatePath,
  sourceExt,
} from "../init/types.js";
import type { InitAnswers, RuntimeId, ServiceDef, ServiceFunction } from "../init/types.js";
import { buildProjectManifest } from "../init/manifest.js";
import { nodeHandler, nodeService, standaloneNodeService } from "../init/templates/node.js";
import {
  pythonHandler,
  pythonService,
  standalonePythonService,
} from "../init/templates/python.js";
import {
  samFlatTemplate,
  samRootTemplate,
  samServiceTemplate,
} from "../init/templates/sam.js";

export interface GeneratedFunction {
  files: Record<string, string>;
  appTemplatePath: string;
  rootTemplatePath?: string;
}

function handlerSource(
  answers: InitAnswers,
  appName: string,
  fn: ServiceFunction,
  fnRuntime: RuntimeId
): string {
  if (fnRuntime === "python") {
    return pythonHandler(appName, fn);
  }
  return nodeHandler(answers, appName, fn, fnRuntime === "typescript");
}

function serviceSource(
  answers: InitAnswers,
  fn: ServiceFunction,
  fnRuntime: RuntimeId,
  sameFamily: boolean
): string {
  if (fnRuntime === "python") {
    return sameFamily ? pythonService(answers, fn) : standalonePythonService(fn);
  }
  return sameFamily
    ? nodeService(answers, fn, fnRuntime === "typescript")
    : standaloneNodeService(fn, fnRuntime === "typescript");
}

// Attaches `fn` to `appName` (existing or new) and regenerates every file that must
// stay consistent with it: the handler, the service, that app's own infra template,
// the root template.yaml when a SAM app is brand new, and slskit.json.
export function generateFunction(
  answers: InitAnswers,
  apps: ServiceDef[],
  appName: string,
  isNewApp: boolean,
  fn: ServiceFunction,
  existingGeneratedFiles: string[],
  envKeys: string[] = []
): GeneratedFunction {
  const fnRuntime = fn.runtime ?? answers.runtime;
  const sameFamily = sameRuntimeFamily(fnRuntime, answers.runtime);
  const files: Record<string, string> = {};

  if (fnRuntime === "python") {
    files[`${SRC_DIR}/__init__.py`] = "";
    files[`${SRC_DIR}/functions/__init__.py`] = "";
    files[`${SRC_DIR}/services/__init__.py`] = "";
    files[`${SRC_DIR}/functions/${appName}/__init__.py`] = "";
    files[`${SRC_DIR}/services/${appName}/__init__.py`] = "";
    files[`${SRC_DIR}/functions/${appName}/${fn.name}/__init__.py`] = "";
  }

  files[`${SRC_DIR}/functions/${appName}/${fn.name}/${handlerFileName(fnRuntime)}`] =
    handlerSource(answers, appName, fn, fnRuntime);
  files[`${SRC_DIR}/services/${appName}/${fn.name}.${sourceExt(fnRuntime)}`] = serviceSource(
    answers,
    fn,
    fnRuntime,
    sameFamily
  );

  const targetApp: ServiceDef = {
    name: appName,
    functions: [...(apps.find((app) => app.name === appName)?.functions ?? []), fn],
  };

  const updatedApps = isNewApp
    ? [...apps, targetApp]
    : apps.map((app) => (app.name === appName ? targetApp : app));

  // With one shared API Gateway every function lives in the single root template,
  // so there is no per-service template to update -- and the root always changes.
  const appTemplatePath = answers.sharedApi
    ? "template.yaml"
    : serviceTemplatePath(appName);

  let rootTemplatePath: string | undefined;

  if (answers.sharedApi) {
    files[appTemplatePath] = samFlatTemplate(answers, updatedApps, envKeys);
  } else {
    files[appTemplatePath] = samServiceTemplate(answers, targetApp, envKeys);

    if (isNewApp) {
      rootTemplatePath = "template.yaml";
      files[rootTemplatePath] = samRootTemplate(answers, updatedApps, envKeys);
    }
  }

  const generatedFiles = Array.from(
    new Set([...existingGeneratedFiles, ...Object.keys(files)])
  ).sort();

  files["slskit.json"] = `${JSON.stringify(
    buildProjectManifest(answers, updatedApps, generatedFiles),
    null,
    2
  )}\n`;

  return { files, appTemplatePath, rootTemplatePath };
}
