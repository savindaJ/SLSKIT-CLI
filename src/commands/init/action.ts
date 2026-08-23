import path from "node:path";
import { logger } from "../../core/logger.js";
import { collectAnswers } from "./prompts.js";
import { scaffoldProject } from "./scaffold.js";
import { LAMBDA_APPS, SRC_DIR, infraFileName } from "./types.js";
import type { InitOptions } from "./types.js";

export async function initAction(options: InitOptions): Promise<void> {
  const answers = await collectAnswers(options);
  const root = await scaffoldProject(answers);

  const relative = path.relative(process.cwd(), root) || ".";
  logger.info(`\nInitialized sless project "${answers.name}" in ${relative}`);
  if (answers.apiGateway && answers.framework !== "sam") {
    logger.info("  gateway/   (shared API Gateway template)");
  }

  const infra = infraFileName(answers.framework);
  for (const app of LAMBDA_APPS) {
    logger.info(`  ${SRC_DIR}/functions/${app.name}   (${infra} + handlers)`);
  }
  for (const app of LAMBDA_APPS) {
    logger.info(`  ${SRC_DIR}/services/${app.name}`);
  }
  logger.info(
    answers.layer
      ? `  ${SRC_DIR}/shared     (common Lambda layer)`
      : `  ${SRC_DIR}/shared`
  );
  if (answers.framework === "sam") {
    logger.info("  template.yaml     (root stack)");
  }
  logger.info(`  memory:    ${answers.memorySize} MB`);
  logger.info("  sless.json");
}
