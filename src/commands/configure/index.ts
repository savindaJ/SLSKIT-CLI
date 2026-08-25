import { Command } from "commander";
import { runCommand } from "../../core/run.js";
import { configureAction } from "./action.js";
import { DEFAULT_STAGE } from "./types.js";
import type { ConfigureOptions } from "./types.js";

export function registerConfigureCommand(program: Command): void {
  program
    .command("configure")
    .description("Set up AWS credentials and the deploy target for this project")
    .option("--stage <name>", `Deployment stage to configure (default: "${DEFAULT_STAGE}")`)
    .option("--profile <name>", "AWS named profile to resolve credentials from")
    .option("--region <region>", "AWS region to deploy into (example: us-east-1)")
    .option("--stack-name <name>", "CloudFormation stack name for this stage")
    .option("--skip-verify", "Save without checking that the credentials work", false)
    .action((options: ConfigureOptions) => runCommand(() => configureAction(options)));
}
