import fs from "node:fs";
import path from "node:path";
import { CliError } from "../../core/errors.js";
import { manifestPathFor } from "../../core/environments.js";
import type { ProjectManifestFile } from "./types.js";

export function readManifest(cwd: string): ProjectManifestFile {
  const manifestPath = manifestPathFor(cwd);

  if (!manifestPath) {
    throw new CliError(
      `No slskit.json found in ${cwd}. Run "slskit init" first, or run "slskit run" from your project root.`
    );
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as ProjectManifestFile;

  if (manifest.framework?.id !== "sam") {
    throw new CliError(
      `"slskit run" supports AWS SAM projects only (this project uses "${manifest.framework?.id ?? "unknown"}").`
    );
  }

  return manifest;
}
