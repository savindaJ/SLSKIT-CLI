import { Command } from "commander";
import { runCommand } from "../../core/run.js";
import {
  stageAddAction,
  stageListAction,
  stageRemoveAction,
  stageUseAction,
} from "./action.js";
import type { StageAddOptions, StageRemoveOptions } from "./types.js";

export function registerStageCommand(program: Command): void {
  const stage = program
    .command("stage")
    .description("Manage deployment stages (dev, staging, production, ...)");

  stage
    .command("list")
    .alias("ls")
    .description("Show every stage and its deploy target")
    .action(() => runCommand(() => stageListAction()));

  stage
    .command("add")
    .description("Add a stage and configure its AWS deploy target")
    .argument("<name>", "Stage name (example: staging)")
    .option("--profile <name>", "AWS named profile to resolve credentials from")
    .option("--region <region>", "AWS region to deploy into (example: us-east-1)")
    .option("--stack-name <name>", "CloudFormation stack name for this stage")
    .option("--skip-verify", "Save without checking that the credentials work", false)
    .action((name: string, options: StageAddOptions) =>
      runCommand(() => stageAddAction(name, options))
    );

  stage
    .command("use")
    .description("Set the stage that commands default to")
    .argument("<name>", "Stage name")
    .action((name: string) => runCommand(() => stageUseAction(name)));

  stage
    .command("remove")
    .alias("rm")
    .description("Remove a stage from this project")
    .argument("<name>", "Stage name")
    .option("-y, --yes", "Skip the confirmation prompt", false)
    .action((name: string, options: StageRemoveOptions) =>
      runCommand(() => stageRemoveAction(name, options))
    );
}
