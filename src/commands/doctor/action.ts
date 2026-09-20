import { getContext } from "../../core/context.js";
import { logger } from "../../core/logger.js";
import { checkAwsCli, checkDocker, checkNode, checkSamCli } from "./checks.js";
import {
  checkCredentials,
  checkEnvironment,
  checkProject,
  checkVariables,
} from "./project.js";
import { formatReport, summarize } from "./report.js";
import type { CheckResult, DoctorOptions } from "./types.js";

// Every run reports the same list of checks in the same order, whether or not each
// one could be answered, so a --json consumer can rely on the shape.
function skipped(id: string, title: string, reason: string): CheckResult {
  return { id, title, status: "skip", detail: reason };
}

function collect(cwd: string, options: DoctorOptions): CheckResult[] {
  const awsCli = checkAwsCli();
  const checks: CheckResult[] = [checkNode(), checkSamCli(), awsCli, checkDocker()];

  const { result: project, manifest } = checkProject(cwd);
  checks.push(project);

  if (!manifest) {
    checks.push(
      skipped("environment", "Environment", "no project here"),
      skipped("variables", "Variables", "no project here"),
      skipped("credentials", "AWS credentials", "no project here")
    );
    return checks;
  }

  const { result: environment, target } = checkEnvironment(manifest, options.env);
  checks.push(environment);

  if (!target) {
    checks.push(
      skipped("variables", "Variables", "needs a usable environment"),
      skipped("credentials", "AWS credentials", "needs a usable environment")
    );
    return checks;
  }

  checks.push(
    checkVariables(cwd, manifest, target.environment),
    // Asking AWS is the slowest check and the only one that leaves the machine, so
    // it runs last — by now everything cheaper has already had its say.
    checkCredentials(target, awsCli.status === "ok")
  );

  return checks;
}

export async function doctorAction(options: DoctorOptions): Promise<void> {
  const cwd = process.cwd();
  const report = summarize(collect(cwd, options));

  if (getContext().json) {
    // logger.info is silenced under --json, so the report is written directly and is
    // the only thing on stdout.
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    logger.info(`\nslskit doctor — ${cwd}\n`);
    logger.info(formatReport(report));
  }

  // Reported rather than thrown: every failure has already been printed with the
  // command that fixes it, and a CliError would only repeat one of them.
  if (!report.ok) {
    process.exitCode = 1;
  }
}
