import { Command } from "commander";
import { runCommand } from "../../core/run.js";
import { initAction } from "./action.js";
import type { InitOptions } from "./types.js";

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Scaffold a multi-service AWS SAM project")
    .argument("[name]", "Project name (example: my-lambda-app)")
    .option("-r, --runtime <runtime>", "typescript | javascript | python")
    .option("--database <database>", "none | prisma | mongoose | dynamodb")
    .option("--api-gateway <yes|no>", "Attach every function to a single HTTP API")
    .option("--layer <yes|no>", "Use shared/ as a common Lambda layer")
    .option(
      "--memory <mb>",
      "Function memory size: 128 | 256 | 512 | 1024 | 2048 | 3008 | 4096 | 10240"
    )
    .option("-f, --force", "Overwrite files if the folder already exists", false)
    .action((name: string | undefined, options: InitOptions) =>
      runCommand(() =>
        initAction({
          name: name ?? options.name,
          runtime: options.runtime,
          database: options.database,
          apiGateway: options.apiGateway,
          layer: options.layer,
          memory: options.memory,
          force: options.force,
        })
      )
    );
}
