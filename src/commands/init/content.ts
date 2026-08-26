import { DEFAULT_ENVIRONMENT } from "../../core/environments.js";
import { buildSlessManifest } from "./manifest.js";
import {
  LAMBDA_APPS,
  SRC_DIR,
  handlerFileName,
  serviceTemplatePath,
  sharedCodeDir,
  sourceExt,
} from "./types.js";
import type { InitAnswers, ServiceFunction } from "./types.js";
import { loggerExt } from "./templates/helpers.js";
import {
  environmentDotenv,
  envExample,
  gitignore,
  packageJson,
  readme,
  requirementsTxt,
  tsconfig,
} from "./templates/project.js";
import {
  prismaSchema,
  sharedDb,
  sharedLayerLogger,
  sharedLayerLoggerTypes,
  sharedLogger,
} from "./templates/shared-code.js";
import { nodeHandler, nodeService } from "./templates/node.js";
import { pythonHandler, pythonService } from "./templates/python.js";
import { samRootTemplate, samServiceTemplate } from "./templates/sam.js";

function handlerSource(
  answers: InitAnswers,
  appName: string,
  fn: ServiceFunction
): string {
  if (answers.runtime === "python") {
    return pythonHandler(appName, fn);
  }

  return nodeHandler(answers, appName, fn, answers.runtime === "typescript");
}

function serviceSource(answers: InitAnswers, fn: ServiceFunction): string {
  if (answers.runtime === "python") {
    return pythonService(answers, fn);
  }

  return nodeService(answers, fn, answers.runtime === "typescript");
}

export function buildFileMap(
  answers: InitAnswers,
  envKeys: string[] = []
): Record<string, string> {
  const files: Record<string, string> = {
    ".gitignore": gitignore(answers.runtime),
    "README.md": readme(answers),
    "package.json": packageJson(answers),
  };

  // The environment file is always generated; .env stays for tooling that reads it
  // directly (Prisma), and only exists when there is a database to configure.
  files[`.env.${DEFAULT_ENVIRONMENT}`] = environmentDotenv(
    DEFAULT_ENVIRONMENT,
    answers.database
  );

  const env = envExample(answers.database);
  if (env) {
    files[".env.example"] = env;
    files[".env"] = env;
  }

  if (answers.runtime === "typescript") {
    files["tsconfig.json"] = tsconfig(answers);
  }

  if (answers.runtime === "python") {
    files["requirements.txt"] = requirementsTxt(answers);
    files[`${SRC_DIR}/__init__.py`] = "";
    files[`${SRC_DIR}/functions/__init__.py`] = "";
    files[`${SRC_DIR}/services/__init__.py`] = "";
    files[`${SRC_DIR}/shared/__init__.py`] = "";
    if (answers.layer) {
      files[`${SRC_DIR}/shared/python/__init__.py`] = "";
    }
  }

  files["template.yaml"] = samRootTemplate(answers, LAMBDA_APPS, envKeys);

  const sharedDir = sharedCodeDir(answers);
  const isNodeLayer = answers.layer && answers.runtime !== "python";

  // A real Lambda layer is deployed raw, never esbuild-bundled, so it must ship plain CommonJS.
  const loggerFileExt = isNodeLayer ? "js" : loggerExt(answers.runtime);
  files[`${sharedDir}/logger.${loggerFileExt}`] = isNodeLayer
    ? sharedLayerLogger()
    : sharedLogger(answers.runtime);

  if (isNodeLayer && answers.runtime === "typescript") {
    files[`${sharedDir}/logger.d.ts`] = sharedLayerLoggerTypes();
  }

  // db stays out of the layer: a layer ships no node_modules, so anything importing a
  // database client must be packaged with the function instead.
  const db = sharedDb(answers);
  if (db) {
    files[`${SRC_DIR}/shared/db.${sourceExt(answers.runtime)}`] = db;
  }

  if (answers.database === "prisma") {
    files["prisma/schema.prisma"] = prismaSchema();
  }

  const serviceExt = sourceExt(answers.runtime);

  for (const app of LAMBDA_APPS) {
    if (answers.runtime === "python") {
      files[`${SRC_DIR}/functions/${app.name}/__init__.py`] = "";
      files[`${SRC_DIR}/services/${app.name}/__init__.py`] = "";
    }

    files[serviceTemplatePath(app.name)] = samServiceTemplate(answers, app, envKeys);

    for (const fn of app.functions) {
      if (answers.runtime === "python") {
        files[`${SRC_DIR}/functions/${app.name}/${fn.name}/__init__.py`] = "";
      }

      files[
        `${SRC_DIR}/functions/${app.name}/${fn.name}/${handlerFileName(answers.runtime)}`
      ] = handlerSource(answers, app.name, fn);

      files[`${SRC_DIR}/services/${app.name}/${fn.name}.${serviceExt}`] =
        serviceSource(answers, fn);
    }
  }

  files["sless.json"] = `${JSON.stringify(
    buildSlessManifest(answers, LAMBDA_APPS, Object.keys(files)),
    null,
    2
  )}\n`;

  return files;
}
