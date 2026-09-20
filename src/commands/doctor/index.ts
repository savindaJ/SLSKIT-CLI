import { Command } from "commander";
import { runCommand } from "../../core/run.js";
import type { DoctorOptions } from "./types.js";

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description("Check that everything slskit needs is installed and configured")
    .option(
      "-e, --env <name>",
      "Environment whose region, variables and credentials to check"
    )
    .action((options: DoctorOptions) =>
      runCommand(async () => {
        const { doctorAction } = await import("./action.js");
        await doctorAction(options);
      })
    );
}
