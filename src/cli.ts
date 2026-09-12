import { CliError } from "./core/errors.js";
import { logger } from "./core/logger.js";
import { createProgram } from "./program.js";

async function main(): Promise<void> {
  const program = createProgram();
  const argv = process.argv.slice(2);

  if (argv.length === 0) {
    program.outputHelp();
    return;
  }

  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    if (error instanceof CliError) {
      logger.error(error.message);
      process.exitCode = error.exitCode;
      return;
    }
    throw error;
  }
}

void main();
