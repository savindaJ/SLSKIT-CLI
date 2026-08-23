import { createProgram } from "./program.js";

async function main(): Promise<void> {
  const program = createProgram();
  const argv = process.argv.slice(2);

  if (argv.length === 0) {
    program.outputHelp();
    return;
  }

  await program.parseAsync(process.argv);
}

void main();
