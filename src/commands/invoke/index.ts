import { Command } from "commander";
import { runCommand } from "../../core/run.js";
import type { InvokeOptions } from "./types.js";

export function registerInvokeCommand(program: Command): void {
  program
    .command("invoke")
    .description(
      "Invoke one function locally with sam, or remotely in AWS with --remote"
    )
    .argument("[function]", "Function to invoke (example: login)")
    .option("-e, --env <name>", "Environment whose variables to use (default environment)")
    .option("-s, --service <name>", "Service the function belongs to (with --function)")
    .option("--function <name>", "Function to invoke (same as the positional name)")
    .option("--event <path>", "JSON event file to pass to the handler")
    .option("--remote", "Invoke the deployed Lambda in AWS instead of sam local", false)
    .option("--no-build", 'Skip "sam build" before a local invoke')
    .option("--profile <name>", "AWS named profile (remote invoke only)")
    .option(
      "--out <path>",
      "File for the remote invoke response (default: .slskit-invoke-response.json)"
    )
    .action((name: string | undefined, options: InvokeOptions) =>
      runCommand(async () => {
        const { invokeAction } = await import("./action.js");
        await invokeAction({ ...options, name });
      })
    );
}