import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CommanderError } from "commander";
import { createProgram } from "../../src/program";

export interface CliResult {
  stdout: string;
  stderr: string;
  status: number;
}

export async function runProgram(
  args: string[],
  options: { cwd?: string } = {}
): Promise<CliResult> {
  let stdout = "";
  let stderr = "";
  const program = createProgram();

  program.exitOverride((error) => {
    throw error;
  });
  program.configureOutput({
    writeOut: (str) => {
      stdout += str;
    },
    writeErr: (str) => {
      stderr += str;
    },
  });

  const previousCwd = process.cwd();
  if (options.cwd) {
    process.chdir(options.cwd);
  }

  process.exitCode = undefined;

  try {
    if (args.length === 0) {
      program.outputHelp();
    } else {
      await program.parseAsync(["node", "slskit", ...args], { from: "node" });
    }
  } catch (error) {
    if (error instanceof CommanderError) {
      process.exitCode =
        error.code === "commander.helpDisplayed" || error.code === "commander.help"
          ? 0
          : error.exitCode;
      if (error.message) {
        stderr += `${error.message}\n`;
      }
    } else {
      const message = error instanceof Error ? error.message : String(error);
      stderr += `${message}\n`;
      process.exitCode = 1;
    }
  } finally {
    if (options.cwd) {
      process.chdir(previousCwd);
    }
  }

  return {
    stdout,
    stderr,
    status: process.exitCode ?? 0,
  };
}

export function createTempDir(prefix = "slskit-test-"): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function removeDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

export function listFiles(root: string): string[] {
  const files: string[] = [];

  function walk(current: string): void {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.name === "node_modules" || entry.name === ".git") {
        continue;
      }
      if (entry.isDirectory()) {
        walk(full);
      } else {
        files.push(path.relative(root, full));
      }
    }
  }

  walk(root);
  return files.sort();
}

export const BASE_INIT_FLAGS = [
  "--runtime",
  "javascript",
  "--database",
  "none",
  "--api-gateway",
  "no",
  "--layer",
  "no",
  "--memory",
  "256",
] as const;
