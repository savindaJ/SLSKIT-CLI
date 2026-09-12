import { Command } from "commander";
import { runCommand } from "../../core/run.js";
import type { DeployOptions } from "./types.js";

export function registerDeployCommand(program: Command): void {
  program
    .command("deploy")
    .description(
      "Deploy to AWS — the whole project, one service, or a single function"
    )
    .argument(
      "[environment]",
      "Environment to deploy (example: dev, production) — defaults to the default environment"
    )
    .option("-e, --env <name>", "Environment to deploy")
    .option("-s, --service <name>", "Deploy every function in one service")
    .option("--function <name>", "Deploy one function on its own")
    .option("--all", "Deploy the whole project without asking what to deploy", false)
    .option("--profile <name>", "AWS named profile (overrides slskit.json for this run)")
    .option("--no-build", 'Skip "sam build" before deploying')
    .option("-y, --yes", "Skip the confirmation prompt", false)
    .option("--skip-verify", "Deploy without checking the credentials first", false)
    .option("--guided", 'Run "sam deploy --guided" instead of the managed defaults', false)
    .action((environment: string | undefined, options: DeployOptions) =>
      runCommand(async () => {
        const { deployAction } = await import("./action.js");
        await deployAction({ ...options, env: environment ?? options.env });
      })
    );
}
