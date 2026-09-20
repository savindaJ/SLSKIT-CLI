import { Command } from "commander";
import { runCommand } from "../../core/run.js";
import type { StatusOptions } from "./types.js";

export function registerStatusCommand(program: Command): void {
  program
    .command("status")
    .description(
      "Show what is deployed — stack status, endpoints, functions and drift hints"
    )
    .argument(
      "[environment]",
      "Environment to report on (example: dev, production) — defaults to the default environment"
    )
    .option("-e, --env <name>", "Environment to report on")
    .option("--profile <name>", "AWS named profile to use for this run only")
    .action((environment: string | undefined, options: StatusOptions) =>
      runCommand(async () => {
        const { statusAction } = await import("./action.js");
        await statusAction({ ...options, env: environment ?? options.env });
      })
    );
}
