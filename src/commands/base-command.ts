import { Command, Option } from "commander";
import { applyGlobalOptions, type GlobalOptions } from "../core/context.js";

export function addGlobalOptions(command: Command): Command {
  return command
    .addOption(new Option("--cwd <path>", "Run as if started from this directory"))
    .addOption(new Option("--debug", "Print stack traces when a command fails"))
    .addOption(new Option("--silent", "Silence informational output"))
    .addOption(new Option("--json", "JSON output where a command supports it"));
}

function attachGlobalHook(command: Command): void {
  command.hook("preAction", (_parent, actionCommand) => {
    applyGlobalOptions(actionCommand.optsWithGlobals() as GlobalOptions);
  });
}

// Every command created through program.command() inherits the global flags,
// so `slskit deploy --debug` and `slskit --debug deploy` both work.
export class BaseCommand extends Command {
  createCommand(name?: string): BaseCommand {
    const command = new BaseCommand(name);
    addGlobalOptions(command);
    attachGlobalHook(command);
    return command;
  }
}
