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
      process.exitCode = error.exitCode;
      return;
    }

    const message =
      error instanceof Error ? error.message : "Unexpected CLI error";
    logger.error(message);
    process.exitCode = 1;
  }
}
