import { Command } from "commander";
import { registerConfigureCommand } from "./configure/index.js";
import { registerEnvCommand } from "./env/index.js";
import { registerFunctionCommand } from "./function/index.js";
import { registerInitCommand } from "./init/index.js";
import { registerRunCommand } from "./run/index.js";
import { registerStageCommand } from "./stage/index.js";

export function registerCommands(program: Command): void {
  registerInitCommand(program);
  registerRunCommand(program);
  registerFunctionCommand(program);
  registerConfigureCommand(program);
  registerStageCommand(program);
  registerEnvCommand(program);
}
