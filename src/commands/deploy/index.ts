import { Command } from "commander";
import { runCommand } from "../../core/run.js";
import { deployAction } from "./action.js";
import type { DeployOptions } from "./types.js";

export function registerDeployCommand(program: Command): void {
  program
    .command("deploy")
    .description(
      "Deploy an environment to AWS (functions, API Gateways, layers and tables)"
    )
    .argument(
      "[environment]",
      "Environment to deploy (example: dev, production) — defaults to the default environment"
    )
    .option("-e, --env <name>", "Environment to deploy")
    .option("--no-build", 'Skip "sam build" before deploying')
    .option("-y, --yes", "Skip the confirmation prompt", false)
    .option("--skip-verify", "Deploy without checking the credentials first", false)
    .option("--guided", 'Run "sam deploy --guided" instead of the managed defaults', false)
    .action((environment: string | undefined, options: DeployOptions) =>
      runCommand(() => deployAction({ ...options, env: environment ?? options.env }))
    );
}
