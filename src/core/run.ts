import { getContext } from "./context.js";
import { CliError } from "./errors.js";
import { logger } from "./logger.js";

export async function runCommand(
  action: () => Promise<void> | void
): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (error instanceof CliError) {
      logger.error(error.message);
      if (getContext().debug && error.stack) {
        logger.error(error.stack);
      }
      process.exitCode = error.exitCode;
      return;
    }

    const message =
      error instanceof Error ? error.message : "Unexpected CLI error";
    logger.error(message);
    if (getContext().debug && error instanceof Error && error.stack) {
      logger.error(error.stack);
    }
    process.exitCode = 1;
  }
}
