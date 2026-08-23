import {
  LAMBDA_APPS,
  SRC_DIR,
  handlerFileName,
  infraFileName,
  lambdaRuntime,
  serviceTemplatePath,
  sharedCodeDir,
  sourceExt,
} from "./types.js";
import type { InitAnswers } from "./types.js";

// Handler paths are relative to the Lambda CodeUri, which is the project root.
function handlerValue(answers: InitAnswers, appName: string, fnName: string): string {
  if (answers.runtime === "python") {
    return `${SRC_DIR}.functions.${appName}.${fnName}.handler.handler`;
  }

  return `${SRC_DIR}/functions/${appName}/${fnName}/handler.handler`;
}

export function buildSlessManifest(
  answers: InitAnswers,
  generatedFiles: string[]
): Record<string, unknown> {
  const infra = infraFileName(answers.framework);
  const runtime = lambdaRuntime(answers.runtime);
  const handler = handlerFileName(answers.runtime);
  const ext = sourceExt(answers.runtime);
  const sharedDir = sharedCodeDir(answers);
  const isSam = answers.framework === "sam";

  const applications = LAMBDA_APPS.map((app) => ({
    name: app.name,
    path: `${SRC_DIR}/functions/${app.name}`,
    template: serviceTemplatePath(answers.framework, app.name),
    functions: app.functions.map((fn) => ({
      id: `${app.name}.${fn.name}`,
      name: fn.name,
      path: `${SRC_DIR}/functions/${app.name}/${fn.name}`,
      handlerFile: `${SRC_DIR}/functions/${app.name}/${fn.name}/${handler}`,
      handler: handlerValue(answers, app.name, fn.name),
      service: {
        application: app.name,
        path: `${SRC_DIR}/services/${app.name}/${fn.name}.${ext}`,
        export: fn.name,
      },
      runtime,
      memorySize: answers.memorySize,
      apiGateway: answers.apiGateway
        ? {
            enabled: true,
            gateway: isSam ? app.name : "gateway",
            path: fn.httpPath,
            method: fn.method,
          }
        : { enabled: false },
      layer: answers.layer
        ? { enabled: true, name: "shared", path: `${SRC_DIR}/shared` }
        : { enabled: false },
    })),
  }));

  const services = LAMBDA_APPS.map((app) => ({
    application: app.name,
    path: `${SRC_DIR}/services/${app.name}`,
    files: app.functions.map(
      (fn) => `${SRC_DIR}/services/${app.name}/${fn.name}.${ext}`
    ),
  }));

  const routes = answers.apiGateway
    ? LAMBDA_APPS.flatMap((app) =>
        app.functions.map((fn) => ({
          path: fn.httpPath,
          method: fn.method,
          function: `${app.name}.${fn.name}`,
        }))
      )
    : [];

  const directories = [
    ...(answers.apiGateway && !isSam ? ["gateway"] : []),
    SRC_DIR,
    `${SRC_DIR}/functions`,
    `${SRC_DIR}/services`,
    ...LAMBDA_APPS.flatMap((app) => [
      `${SRC_DIR}/functions/${app.name}`,
      ...app.functions.map((fn) => `${SRC_DIR}/functions/${app.name}/${fn.name}`),
      `${SRC_DIR}/services/${app.name}`,
    ]),
    sharedDir,
    ...(answers.database === "prisma" ? ["prisma"] : []),
  ];

  return {
    name: answers.name,
    version: "0.1.0",
    generatedBy: "sless",
    runtime: {
      id: answers.runtime,
      lambda: runtime,
    },
    framework: {
      id: answers.framework,
      files: {
        root: isSam ? "template.yaml" : undefined,
        application: infra,
        applications: LAMBDA_APPS.map((app) =>
          serviceTemplatePath(answers.framework, app.name)
        ),
        gateway: answers.apiGateway && !isSam ? `gateway/${infra}` : undefined,
        layer: answers.layer && !isSam ? `${SRC_DIR}/shared/${infra}` : undefined,
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
          perService: isSam,
          templates: isSam
            ? LAMBDA_APPS.map((app) => serviceTemplatePath("sam", app.name))
            : [`gateway/${infra}`],
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
          templates: isSam
            ? LAMBDA_APPS.map((app) => serviceTemplatePath("sam", app.name))
            : [`${SRC_DIR}/shared/${infra}`],
          compatibleRuntimes: [runtime],
          attachAllFunctions: true,
          attachedTo: LAMBDA_APPS.flatMap((app) =>
            app.functions.map((fn) => `${app.name}.${fn.name}`)
          ),
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
