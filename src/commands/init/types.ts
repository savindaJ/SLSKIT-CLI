export type RuntimeId = "typescript" | "javascript" | "python";
export type DatabaseId = "none" | "prisma" | "mongoose" | "dynamodb";
export type MemorySize = 128 | 256 | 512 | 1024 | 2048 | 3008 | 4096 | 10240;

export const MEMORY_SIZES: MemorySize[] = [
  128, 256, 512, 1024, 2048, 3008, 4096, 10240,
];

export interface InitOptions {
  name?: string;
  runtime?: string;
  database?: string;
  apiGateway?: string | boolean;
  sharedApi?: string | boolean;
  layer?: string | boolean;
  memory?: string | number;
  force?: boolean;
}

export interface InitAnswers {
  name: string;
  runtime: RuntimeId;
  database: DatabaseId;
  apiGateway: boolean;
  // One HTTP API for the whole project rather than one per service. SAM only
  // resolves an ApiId inside the template that declares the API, so a shared API
  // means a single flat template instead of a stack per service.
  sharedApi: boolean;
  layer: boolean;
  memorySize: MemorySize;
  force: boolean;
}

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

export interface ServiceFunction {
  name: string;
  httpPath: string;
  method: HttpMethod;
  // Per-function overrides. Unset for the functions init() scaffolds, since those
  // all share the project's runtime/memory; set when "slskit function" attaches a
  // function whose language or memory differs from the rest of its application.
  runtime?: RuntimeId;
  memorySize?: MemorySize;
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

// Every generated project is an AWS SAM project: a root stack that nests one
// template per application.
export const INFRA_FILE = "template.yaml";

// Service templates are gathered in one directory rather than buried next to the
// handlers, so the whole infrastructure of a project is readable in one place --
// the thing that matters most once a project has more than a handful of services.
export const TEMPLATES_DIR = "templates";

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

export function serviceTemplatePath(appName: string): string {
  return `${TEMPLATES_DIR}/${appName}.yaml`;
}

// Node and Python are different runtime families: a layer/db built for one can never
// be attached to or imported by a function running the other.
export function runtimeFamily(runtime: RuntimeId): "node" | "python" {
  return runtime === "python" ? "python" : "node";
}

export function sameRuntimeFamily(a: RuntimeId, b: RuntimeId): boolean {
  return runtimeFamily(a) === runtimeFamily(b);
}
