import { Command } from "commander";
import { runCommand } from "../../core/run.js";
import { envListAction, envSetAction, envUnsetAction } from "./action.js";
import type { EnvListOptions, EnvSetOptions, EnvUnsetOptions } from "./types.js";

export function registerEnvCommand(program: Command): void {
  const env = program
    .command("env")
    .description("Manage the environment variables of a deployment stage");

  env
    .command("set")
    .description("Add or update a variable (KEY=value)")
    .argument("<assignment>", "KEY=value, or just KEY with --secret or --ssm")
    .option("--stage <name>", "Stage to change (defaults to the project's default stage)")
    .option("--secret", "Keep the value in .env.<stage> instead of sless.json", false)
    .option("--ssm <path>", "Resolve the value from an SSM Parameter Store path")
    .action((assignment: string, options: EnvSetOptions) =>
      runCommand(() => envSetAction(assignment, options))
    );

  env
    .command("list")
    .alias("ls")
    .description("Show every variable configured for a stage")
    .option("--stage <name>", "Stage to show (defaults to the project's default stage)")
    .option("--show-secrets", "Print secret values instead of masking them", false)
    .action((options: EnvListOptions) => runCommand(() => envListAction(options)));

  env
    .command("unset")
    .alias("rm")
    .description("Remove a variable from a stage")
    .argument("<key>", "Variable name")
    .option("--stage <name>", "Stage to change (defaults to the project's default stage)")
    .action((key: string, options: EnvUnsetOptions) =>
      runCommand(() => envUnsetAction(key, options))
    );
}
