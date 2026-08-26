import type { EnvironmentsConfig } from "../../core/environments.js";
import type { DatabaseId, MemorySize, RuntimeId } from "../init/types.js";

export interface FunctionOptions {
  name?: string;
  app?: string;
  newApp?: string;
  method?: string;
  memory?: string | number;
  runtime?: string;
}

export interface ManifestFunctionEntry {
  name: string;
  handlerFile: string;
  memorySize: MemorySize;
  apiGateway: { enabled: boolean; path?: string; method?: string };
}

export interface ManifestApplication {
  name: string;
  functions: ManifestFunctionEntry[];
}

export interface ProjectManifest {
  name: string;
  runtime: { id: RuntimeId };
  framework: { id: string };
  database: { id: DatabaseId };
  apiGateway: { enabled: boolean };
  layer: { enabled: boolean };
  functions: { memorySize: MemorySize };
  applications: ManifestApplication[];
  structure: { files: string[] };
  environments?: EnvironmentsConfig;
}
