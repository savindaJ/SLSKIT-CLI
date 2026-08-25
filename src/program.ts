import { Command } from "commander";
import { registerCommands } from "./commands/index.js";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("slskit")
    .description("Scaffold and incrementally grow multi-service AWS Lambda projects")
    .version("0.1.0");

  registerCommands(program);

  return program;
}
