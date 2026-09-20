import { Command } from "commander";
import { registerConfigureCommand } from "./configure/index.js";
import { registerDeployCommand } from "./deploy/index.js";
import { registerDoctorCommand } from "./doctor/index.js";
import { registerEnvCommand } from "./env/index.js";
import { registerFunctionCommand } from "./function/index.js";
import { registerInitCommand } from "./init/index.js";
import { registerRmCommand } from "./rm/index.js";
import { registerRunCommand } from "./run/index.js";
import { registerStatusCommand } from "./status/index.js";

export function registerCommands(program: Command): void {
  registerInitCommand(program);
  registerRunCommand(program);
  registerFunctionCommand(program);
  registerRmCommand(program);
  registerConfigureCommand(program);
  registerEnvCommand(program);
  registerDeployCommand(program);
  registerStatusCommand(program);
  registerDoctorCommand(program);
}
