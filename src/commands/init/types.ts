export type RuntimeId = "typescript" | "javascript" | "python";
export type FrameworkId = "sam" | "serverless";
export type DatabaseId = "none" | "prisma" | "mongoose" | "dynamodb";
export type MemorySize = 128 | 256 | 512 | 1024 | 2048 | 3008 | 4096 | 10240;

export const MEMORY_SIZES: MemorySize[] = [
  128, 256, 512, 1024, 2048, 3008, 4096, 10240,
];

export interface InitOptions {
  name?: string;
  runtime?: string;
  framework?: string;
  database?: string;
  apiGateway?: string | boolean;
  layer?: string | boolean;
  memory?: string | number;
  force?: boolean;
}

export interface InitAnswers {
  name: string;
  runtime: RuntimeId;
  framework: FrameworkId;
  database: DatabaseId;
  apiGateway: boolean;
  layer: boolean;
  memorySize: MemorySize;
  force: boolean;
}

export interface ServiceFunction {
  name: string;
  httpPath: string;
  method: "GET" | "POST";
}

export interface ServiceDef {
  name: string;
  functions: ServiceFunction[];
}

export const LAMBDA_APPS: ServiceDef[] = [
  {
    name: "auth",
    functions: [
      { name: "login", httpPath: "/auth/login", method: "POST" },
      { name: "register", httpPath: "/auth/register", method: "POST" },
    ],
  },
  {
    name: "product",
    functions: [
      { name: "getProducts", httpPath: "/products", method: "GET" },
      { name: "createProduct", httpPath: "/products", method: "POST" },
    ],
  },
];

export function infraFileName(framework: FrameworkId): "template.yaml" | "serverless.yml" {
  return framework === "sam" ? "template.yaml" : "serverless.yml";
}

export function lambdaRuntime(runtime: RuntimeId): string {
  return runtime === "python" ? "python3.12" : "nodejs20.x";
}

export function handlerFileName(runtime: RuntimeId): string {
  if (runtime === "typescript") {
    return "handler.ts";
  }
  if (runtime === "javascript") {
    return "handler.js";
  }
  return "handler.py";
}

export function sourceExt(runtime: RuntimeId): "ts" | "js" | "py" {
  if (runtime === "python") {
    return "py";
  }
  return runtime === "typescript" ? "ts" : "js";
}

// Every generated source file lives under src/, which is also the Lambda CodeUri.
export const SRC_DIR = "src";

export function sharedCodeDir(answers: InitAnswers): string {
  if (!answers.layer) {
    return `${SRC_DIR}/shared`;
  }

  return answers.runtime === "python"
    ? `${SRC_DIR}/shared/python`
    : `${SRC_DIR}/shared/nodejs`;
}

export function serviceTemplatePath(
  framework: FrameworkId,
  appName: string
): string {
  return `${SRC_DIR}/functions/${appName}/${infraFileName(framework)}`;
}
