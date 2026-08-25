import type { InitAnswers } from "../types.js";

export function pascal(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

// CloudFormation parameter names are alphanumeric only, so LOG_LEVEL becomes
// EnvLogLevel. The Env prefix keeps stage variables from ever colliding with the
// database parameters the templates already declare.
export function envParameterName(key: string): string {
  return `Env${key
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(pascal)
    .join("")}`;
}

export function loggerExt(runtime: InitAnswers["runtime"]): "ts" | "js" | "py" {
  if (runtime === "python") {
    return "py";
  }
  return runtime === "typescript" ? "ts" : "js";
}

export function nodeLayerImport(moduleName: string): string {
  return `/opt/nodejs/${moduleName}`;
}

// "auth"/"product" keep their original table names for backward compatibility with
// projects already deployed against them; any app added later gets a name derived
// from the app itself.
export function dynamoTableName(appName: string): { resource: string; table: string } {
  if (appName === "auth") {
    return { resource: "UsersTable", table: "users" };
  }
  if (appName === "product") {
    return { resource: "ProductsTable", table: "products" };
  }
  return { resource: `${pascal(appName)}Table`, table: appName };
}
