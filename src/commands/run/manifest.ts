import fs from "node:fs";
import path from "node:path";
import { CliError } from "../../core/errors.js";
import type { SlessManifest } from "./types.js";

export function readManifest(cwd: string): SlessManifest {
  const manifestPath = path.join(cwd, "sless.json");

  if (!fs.existsSync(manifestPath)) {
    throw new CliError(
      `No sless.json found in ${cwd}. Run "slskit init" first, or run "slskit run" from your project root.`
    );
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as SlessManifest;

  if (manifest.framework?.id !== "sam") {
    throw new CliError(
      `"slskit run" supports AWS SAM projects only (this project uses "${manifest.framework?.id ?? "unknown"}").`
    );
  }

  return manifest;
}
