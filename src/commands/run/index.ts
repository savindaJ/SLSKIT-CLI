import { Command } from "commander";
import { runCommand } from "../../core/run.js";
import { runAction } from "./action.js";
import type { RunOptions } from "./types.js";

export function registerRunCommand(program: Command): void {
  program
    .command("run")
    .description(
      "Run the generated SAM project locally (every application served from one API Gateway port)"
    )
    .option("-p, --port <port>", "Local API Gateway port", "3000")
    .option("--no-build", 'Skip "sam build" before starting the local API')
    .action((options: RunOptions) => runCommand(() => runAction(options)));
}
