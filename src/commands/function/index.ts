import { Command } from "commander";
import { runCommand } from "../../core/run.js";
import type { FunctionOptions } from "./types.js";

export function registerFunctionCommand(program: Command): void {
  program
    .command("function")
    .description("Add a function to an existing or new application in this project")
    .argument("[name]", "Function name")
    .option("--app <name>", "Existing application to attach the function to")
    .option("--new-app <name>", "Create a new application with this name")
    .option("--method <method>", "GET | POST | PUT | DELETE | PATCH")
    .option(
      "--memory <mb>",
      "Function memory size: 128 | 256 | 512 | 1024 | 2048 | 3008 | 4096 | 10240"
    )
    .option("-r, --runtime <runtime>", "typescript | javascript | python")
    .action((name: string | undefined, options: FunctionOptions) =>
      runCommand(async () => {
        const { functionAction } = await import("./action.js");
        await functionAction({
          name: name ?? options.name,
          app: options.app,
          newApp: options.newApp,
          method: options.method,
          memory: options.memory,
          runtime: options.runtime,
        });
      })
    );
}
