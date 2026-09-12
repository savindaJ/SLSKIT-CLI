import { Command } from "commander";
import { runCommand } from "../../core/run.js";
import type { RmOptions } from "./types.js";

export function registerRmCommand(program: Command): void {
  program
    .command("rm")
    .alias("remove")
    .description("Remove a function or an application, and everything that referenced it")
    .argument("[name]", "Function or application name")
    .option("--function <name>", "Remove this function")
    .option("--service <name>", "Remove this application and every function in it")
    .option("--app <name>", "Same as --service")
    .option("-y, --yes", "Skip the confirmation prompt", false)
    .action((name: string | undefined, options: RmOptions) =>
      runCommand(async () => {
        const { rmAction } = await import("./action.js");
        await rmAction({
          name: name ?? options.name,
          function: options.function,
          service: options.service,
          app: options.app,
          yes: options.yes,
        });
      })
    );
}
