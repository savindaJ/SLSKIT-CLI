import type { InitAnswers } from "../types.js";

export function pascal(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
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
