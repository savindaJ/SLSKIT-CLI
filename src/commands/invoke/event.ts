import fs from "node:fs";
import path from "node:path";
import { CliError } from "../../core/errors.js";

export function resolveEventPath(cwd: string, eventPath?: string): string | undefined {
  if (!eventPath?.trim()) {
    return undefined;
  }

  const resolved = path.resolve(cwd, eventPath);
  if (!fs.existsSync(resolved)) {
    throw new CliError(`Event file not found: ${eventPath}`);
  }

  const contents = fs.readFileSync(resolved, "utf8").trim();
  if (contents.length === 0) {
    throw new CliError(`Event file is empty: ${eventPath}`);
  }

  try {
    JSON.parse(contents);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CliError(`Event file is not valid JSON (${eventPath}): ${message}`);
  }

  return resolved;
}