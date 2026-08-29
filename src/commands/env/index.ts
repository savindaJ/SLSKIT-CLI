import { Command } from "commander";
import { runCommand } from "../../core/run.js";
import {
  envAddAction,
  envListAction,
  envRemoveAction,
  envSetAction,
  envUnsetAction,
  envUseAction,
  envVarsAction,
} from "./action.js";
import type {
  EnvAddOptions,
  EnvRemoveOptions,
  EnvSetOptions,
  EnvUnsetOptions,
  EnvVarsOptions,
} from "./types.js";

export function registerEnvCommand(program: Command): void {
  const env = program
    .command("env")
    .description(
      "Manage deployment environments (dev, staging, production, ...) and their variables"
    );

  env
    .command("list")
    .alias("ls")
    .description("Show every environment and its deploy target")
    .action(() => runCommand(() => envListAction()));

  env
    .command("add")
    .description("Add an environment and configure its AWS deploy target")
    .argument("<name>", "Environment name (example: staging)")
    .option("--profile <name>", "AWS named profile to resolve credentials from")
    .option("--region <region>", "AWS region to deploy into (example: us-east-1)")
    .option("--stack-name <name>", "CloudFormation stack name for this environment")
    .option("--skip-verify", "Save without checking that the credentials work", false)
    .action((name: string, options: EnvAddOptions) =>
      runCommand(() => envAddAction(name, options))
    );

  env
    .command("use")
    .description("Set the environment that commands default to")
    .argument("<name>", "Environment name")
    .action((name: string) => runCommand(() => envUseAction(name)));

  env
    .command("remove")
    .alias("rm")
    .description("Remove an environment from this project")
    .argument("<name>", "Environment name")
    .option("-y, --yes", "Skip the confirmation prompt", false)
    .action((name: string, options: EnvRemoveOptions) =>
      runCommand(() => envRemoveAction(name, options))
    );

  env
    .command("set")
    .description("Add or update a variable (KEY=value)")
    .argument("<assignment>", "KEY=value")
    .option("-e, --env <name>", "Environment to change (default: the default environment)")
    .option("--secret", "Store the value in .env.<environment> instead of slskit.json", false)
    .option("--ssm <path>", "Read the value from an SSM Parameter Store path at deploy time")
    .action((assignment: string, options: EnvSetOptions) =>
      runCommand(() => envSetAction(assignment, options))
    );

  env
    .command("unset")
    .description("Remove a variable from an environment")
    .argument("<key>", "Variable name")
    .option("-e, --env <name>", "Environment to change (default: the default environment)")
    .action((key: string, options: EnvUnsetOptions) =>
      runCommand(() => envUnsetAction(key, options))
    );

  env
    .command("vars")
    .description("Show every variable configured for an environment")
    .option("-e, --env <name>", "Environment to show (default: the default environment)")
    .option("--show-secrets", "Reveal secret values instead of masking them", false)
    .action((options: EnvVarsOptions) => runCommand(() => envVarsAction(options)));
}
