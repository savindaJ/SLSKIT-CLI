import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { CliError } from "../../core/errors.js";
import { allEnvKeys } from "../../core/manifest.js";
import { logger } from "../../core/logger.js";
import { SRC_DIR, sameRuntimeFamily } from "../init/types.js";
import type { ServiceFunction } from "../init/types.js";
import { generateFunction } from "./generator.js";
import { readProjectManifest, toInitAnswers, toServiceDefs } from "./manifest.js";
import { collectFunctionAnswers } from "./prompts.js";
import { ensureToolingForRuntime } from "./tooling.js";
import type { FunctionOptions } from "./types.js";

function runNpmInstall(root: string): void {
  logger.info("\nInstalling npm dependencies...");
  const result = spawnSync("npm", ["install"], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error) {
    throw new CliError(`Failed to run npm install: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new CliError(`npm install exited with code ${result.status ?? 1}`);
  }
}

export async function functionAction(options: FunctionOptions): Promise<void> {
  const root = process.cwd();
  const manifest = readProjectManifest(root);
  const answers = toInitAnswers(manifest);
  const apps = toServiceDefs(manifest);

  const picked = await collectFunctionAnswers(manifest, options);

  const fn: ServiceFunction = {
    name: picked.functionName,
    httpPath: `/${picked.appName}/${picked.functionName}`,
    method: picked.method,
    runtime: picked.runtime,
    memorySize: picked.memorySize,
  };

  const sameFamily = sameRuntimeFamily(picked.runtime, answers.runtime);

  const { files, appTemplatePath, rootTemplatePath } = generateFunction(
    answers,
    apps,
    picked.appName,
    picked.isNewApp,
    fn,
    manifest.structure.files,
    allEnvKeys(manifest)
  );

  for (const [relativePath, contents] of Object.entries(files)) {
    const fullPath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, contents);
  }

  if (ensureToolingForRuntime(root, answers, picked.runtime)) {
    runNpmInstall(root);
  }

  logger.info(
    `\nAdded "${picked.functionName}" to application "${picked.appName}"${
      picked.isNewApp ? " (new application)" : ""
    }.`
  );
  logger.info(`  language:  ${picked.runtime}`);
  logger.info(`  memory:    ${picked.memorySize} MB`);
  if (manifest.apiGateway.enabled) {
    logger.info(`  route:     ${picked.method} ${fn.httpPath}`);
  }
  logger.info(`  handler:   ${SRC_DIR}/functions/${picked.appName}/${picked.functionName}`);
  logger.info(`  service:   ${SRC_DIR}/services/${picked.appName}/${picked.functionName}`);
  logger.info(`  template:  ${appTemplatePath}`);
  if (rootTemplatePath) {
    logger.info(`  template:  ${rootTemplatePath} (root stack updated)`);
  }
  if (!sameFamily) {
    logger.info(
      `\nNote: "${picked.functionName}" uses a different language family than the rest of the project, so it was generated standalone (no shared layer, no database wiring).`
    );
  }

  logger.info('\nRun "slskit run" to try it locally.');
}
