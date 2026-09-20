import type { CheckResult, DoctorReport, DoctorSummary } from "./types.js";

// Wide enough for "Environment" without pushing the detail column off a narrow
// terminal; longer titles simply take the space they need.
const TITLE_WIDTH = 22;
const STATUS_WIDTH = 6;

export function summarize(checks: CheckResult[]): DoctorReport {
  const summary: DoctorSummary = { ok: 0, warn: 0, fail: 0, skip: 0 };

  for (const check of checks) {
    summary[check.status] += 1;
  }

  return { ok: summary.fail === 0, checks, summary };
}

function line(check: CheckResult): string {
  const status = check.status.padEnd(STATUS_WIDTH);
  const title = check.detail ? check.title.padEnd(TITLE_WIDTH) : check.title;
  return `  ${status}${title}${check.detail ?? ""}`.trimEnd();
}

// Plain ASCII on purpose: this is the one command people run when something is
// already wrong, and a mojibaked arrow in a Windows console would not help.
function fixLine(check: CheckResult): string {
  return `          fix: ${check.fix}`;
}

export function summaryLine(summary: DoctorSummary): string {
  const parts: string[] = [];

  if (summary.fail > 0) {
    parts.push(`${summary.fail} failed`);
  }
  if (summary.warn > 0) {
    parts.push(`${summary.warn} warning${summary.warn === 1 ? "" : "s"}`);
  }
  if (summary.ok > 0) {
    parts.push(`${summary.ok} ok`);
  }
  if (summary.skip > 0) {
    parts.push(`${summary.skip} skipped`);
  }

  return `${parts.join(", ")}.`;
}

export function formatReport(report: DoctorReport): string {
  const lines: string[] = [];

  for (const check of report.checks) {
    lines.push(line(check));
    // A passing check has nothing to fix, whatever it carries.
    if (check.fix && check.status !== "ok") {
      lines.push(fixLine(check));
    }
  }

  lines.push("", summaryLine(report.summary));

  if (!report.ok) {
    lines.push('\nFix the checks marked "fail", then re-run "slskit doctor".');
  } else if (report.summary.warn > 0) {
    // Deliberately not "nothing is blocking a deploy": some warnings do block one,
    // and each line above already says what it limits.
    lines.push("\nNo failures. Each warning above says what it stops you doing.");
  }

  return lines.join("\n");
}
