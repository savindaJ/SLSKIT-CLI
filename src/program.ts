import { addGlobalOptions, BaseCommand } from "./commands/base-command.js";
import { registerCommands } from "./commands/index.js";

// Read at runtime rather than hardcoded, so "slskit --version" can never drift from
// what was actually published. Resolves to the package root from both dist/ and src/,
// which is why running from source via tsx reports the same number.
function packageVersion(): string {
  try {
    return (require("../package.json") as { version: string }).version;
  } catch {
    return "0.0.0";
  }
}

export function createProgram(): BaseCommand {
  const program = new BaseCommand();

  program
    .name("slskit")
    .description("Scaffold and incrementally grow multi-service AWS Lambda projects")
    .version(packageVersion());

  addGlobalOptions(program);
  registerCommands(program);

  return program;
}
