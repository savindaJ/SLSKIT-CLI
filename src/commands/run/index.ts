import { Command } from "commander";
import { runCommand } from "../../core/run.js";
import type { RunOptions } from "./types.js";

export function registerRunCommand(program: Command): void {
  program
    .command("run")
    .description(
      "Run the generated SAM project locally (every application served from one API Gateway port)"
    )
    .argument(
      "[environment]",
      "Environment to run with (example: dev, staging) — defaults to the default environment"
    )
    .option("-p, --port <port>", "Local API Gateway port", "3000")
    .option("-s, --service <name>", "Run every function in one service")
    .option("--function <name>", "Run one function on its own")
    .option("--all", "Run everything without being asked what to run", false)
    .option("--no-build", 'Skip "sam build" before starting the local API')
    .option(
      "--no-watch",
      "Do not rebuild on file changes (stop and re-run to pick up edits)"
    )
    .option(
      "-e, --env <name>",
      "Environment whose variables to run with (default: the default environment)"
    )
    .action((environment: string | undefined, options: RunOptions) =>
      runCommand(async () => {
        const { runAction } = await import("./action.js");
        await runAction({ ...options, env: environment ?? options.env });
      })
    );
}
