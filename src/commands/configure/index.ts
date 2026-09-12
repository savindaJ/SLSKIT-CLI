import { Command } from "commander";
import { runCommand } from "../../core/run.js";
import { DEFAULT_ENVIRONMENT } from "./types.js";
import type { ConfigureOptions } from "./types.js";

export function registerConfigureCommand(program: Command): void {
  program
    .command("configure")
    .description("Set up AWS credentials and the deploy target for an environment")
    .option(
      "-e, --env <name>",
      `Environment to configure (default: "${DEFAULT_ENVIRONMENT}")`
    )
    .option("--profile <name>", "AWS named profile to resolve credentials from")
    .option("--region <region>", "AWS region to deploy into (example: us-east-1)")
    .option("--stack-name <name>", "CloudFormation stack name for this environment")
    .option("--skip-verify", "Save without checking that the credentials work", false)
    .option(
      "--set-credentials",
      "Enter an AWS access key and store it in ~/.aws/credentials",
      false
    )
    .action((options: ConfigureOptions) =>
      runCommand(async () => {
        const { configureAction } = await import("./action.js");
        await configureAction(options);
      })
    );
}
