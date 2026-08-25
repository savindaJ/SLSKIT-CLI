import {
  INFRA_FILE,
  SRC_DIR,
  handlerFileName,
  lambdaRuntime,
  sameRuntimeFamily,
  serviceTemplatePath,
  sharedCodeDir,
  sourceExt,
} from "./types.js";
import type { InitAnswers, RuntimeId, ServiceDef } from "./types.js";

// Handler paths are relative to the Lambda CodeUri, which is the project root.
function handlerValue(runtime: RuntimeId, appName: string, fnName: string): string {
  if (runtime === "python") {
    return `${SRC_DIR}.functions.${appName}.${fnName}.handler.handler`;
  }

  return `${SRC_DIR}/functions/${appName}/${fnName}/handler.handler`;
}

export function buildSlessManifest(
  answers: InitAnswers,
  apps: ServiceDef[],
  generatedFiles: string[]
): Record<string, unknown> {
  const sharedDir = sharedCodeDir(answers);

  const applications = apps.map((app) => ({
    name: app.name,
    path: `${SRC_DIR}/functions/${app.name}`,
    template: serviceTemplatePath(app.name),
    functions: app.functions.map((fn) => {
      const fnRuntime = fn.runtime ?? answers.runtime;
      const sameFamily = sameRuntimeFamily(fnRuntime, answers.runtime);
      const attachesLayer = answers.layer && sameFamily;

      return {
        id: `${app.name}.${fn.name}`,
        name: fn.name,
        path: `${SRC_DIR}/functions/${app.name}/${fn.name}`,
        handlerFile: `${SRC_DIR}/functions/${app.name}/${fn.name}/${handlerFileName(fnRuntime)}`,
        handler: handlerValue(fnRuntime, app.name, fn.name),
        service: {
          application: app.name,
          path: `${SRC_DIR}/services/${app.name}/${fn.name}.${sourceExt(fnRuntime)}`,
          export: fn.name,
        },
        runtime: lambdaRuntime(fnRuntime),
        memorySize: fn.memorySize ?? answers.memorySize,
        apiGateway: answers.apiGateway
          ? {
              enabled: true,
              gateway: app.name,
              path: fn.httpPath,
              method: fn.method,
            }
          : { enabled: false },
        layer: attachesLayer
          ? { enabled: true, name: "shared", path: `${SRC_DIR}/shared` }
          : { enabled: false },
      };
    }),
  }));

  const services = apps.map((app) => ({
    application: app.name,
    path: `${SRC_DIR}/services/${app.name}`,
    files: app.functions.map(
      (fn) => `${SRC_DIR}/services/${app.name}/${fn.name}.${sourceExt(fn.runtime ?? answers.runtime)}`
    ),
  }));

  const routes = answers.apiGateway
    ? apps.flatMap((app) =>
        app.functions.map((fn) => ({
          path: fn.httpPath,
          method: fn.method,
          function: `${app.name}.${fn.name}`,
        }))
      )
    : [];

  const directories = [
    SRC_DIR,
    `${SRC_DIR}/functions`,
    `${SRC_DIR}/services`,
    ...apps.flatMap((app) => [
      `${SRC_DIR}/functions/${app.name}`,
      ...app.functions.map((fn) => `${SRC_DIR}/functions/${app.name}/${fn.name}`),
      `${SRC_DIR}/services/${app.name}`,
    ]),
    sharedDir,
    ...(answers.database === "prisma" ? ["prisma"] : []),
  ];

  const layerAttachedTo = apps.flatMap((app) =>
    app.functions
      .filter((fn) => sameRuntimeFamily(fn.runtime ?? answers.runtime, answers.runtime))
      .map((fn) => `${app.name}.${fn.name}`)
  );

  return {
    name: answers.name,
    version: "0.1.0",
    generatedBy: "slskit",
    runtime: {
      id: answers.runtime,
      lambda: lambdaRuntime(answers.runtime),
    },
    framework: {
      id: "sam",
      files: {
        root: INFRA_FILE,
        application: INFRA_FILE,
        applications: apps.map((app) => serviceTemplatePath(app.name)),
      },
    },
    database: {
      id: answers.database,
      enabled: answers.database !== "none",
    },
    functions: {
      memorySize: answers.memorySize,
    },
    apiGateway: answers.apiGateway
      ? {
          enabled: true,
          name: `${answers.name}-http-api`,
          type: "HttpApi",
          // SAM gives each service its own API so every reference resolves inside one template.
          perService: true,
          templates: apps.map((app) => serviceTemplatePath(app.name)),
          attachAllFunctions: true,
          routes,
        }
      : { enabled: false },
    layer: answers.layer
      ? {
          enabled: true,
          name: `${answers.name}-shared`,
          path: `${SRC_DIR}/shared`,
          source: sharedDir,
          templates: apps.map((app) => serviceTemplatePath(app.name)),
          compatibleRuntimes: [lambdaRuntime(answers.runtime)],
          attachAllFunctions: layerAttachedTo.length === applications.flatMap((a) => a.functions).length,
          attachedTo: layerAttachedTo,
        }
      : { enabled: false, path: `${SRC_DIR}/shared` },
    applications,
    services,
    structure: {
      directories,
      files: [...generatedFiles, "sless.json"].sort(),
    },
  };
}
