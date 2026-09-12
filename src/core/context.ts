import fs from "node:fs";
import path from "node:path";
import { CliError } from "./errors.js";

export interface GlobalOptions {
  cwd?: string;
  debug?: boolean;
  silent?: boolean;
  json?: boolean;
}

export interface CliContext {
  cwd: string;
  debug: boolean;
  silent: boolean;
  json: boolean;
}

function defaultContext(): CliContext {
  return {
    cwd: process.cwd(),
    debug: false,
    silent: false,
    json: false,
  };
}

let context: CliContext = defaultContext();

export function getContext(): CliContext {
  return context;
}

export function resetContext(): void {
  context = defaultContext();
}

export function applyGlobalOptions(options: GlobalOptions): void {
  if (options.cwd) {
    const resolved = path.resolve(options.cwd);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
      throw new CliError(`Working directory "${options.cwd}" does not exist.`);
    }
    process.chdir(resolved);
  }

  context = {
    cwd: process.cwd(),
    debug: Boolean(options.debug),
    silent: Boolean(options.silent),
    json: Boolean(options.json),
  };
}
