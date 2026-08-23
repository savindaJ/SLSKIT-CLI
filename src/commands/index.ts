import { Command } from "commander";
import { registerInitCommand } from "./init/index.js";
import { registerRunCommand } from "./run/index.js";

export function registerCommands(program: Command): void {
  registerInitCommand(program);
  registerRunCommand(program);
}
