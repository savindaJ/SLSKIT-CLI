import { Command } from "commander";
import { registerCommands } from "./commands/index.js";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("sless")
    .description("Global sless CLI")
    .version("0.1.0");

  registerCommands(program);

  return program;
}
