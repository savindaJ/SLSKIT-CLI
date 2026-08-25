import path from "node:path";
import { logger } from "../../core/logger.js";
import { collectAnswers } from "./prompts.js";
import { scaffoldProject } from "./scaffold.js";
import { INFRA_FILE, LAMBDA_APPS, SRC_DIR } from "./types.js";
import type { InitOptions } from "./types.js";

export async function initAction(options: InitOptions): Promise<void> {
  const answers = await collectAnswers(options);
  const root = await scaffoldProject(answers);

  const relative = path.relative(process.cwd(), root) || ".";
  logger.info(`\nInitialized slskit project "${answers.name}" in ${relative}`);
  for (const app of LAMBDA_APPS) {
    logger.info(`  ${SRC_DIR}/functions/${app.name}   (${INFRA_FILE} + handlers)`);
  }
  for (const app of LAMBDA_APPS) {
    logger.info(`  ${SRC_DIR}/services/${app.name}`);
  }
  logger.info(
    answers.layer
      ? `  ${SRC_DIR}/shared     (common Lambda layer)`
      : `  ${SRC_DIR}/shared`
  );
  logger.info("  template.yaml     (root stack)");
  logger.info(`  memory:    ${answers.memorySize} MB`);
  logger.info("  sless.json");
}
