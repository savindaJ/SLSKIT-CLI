import type { FunctionStatus, StatusReport } from "./types.js";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;

// Lambda and CloudFormation return "+0000" rather than the "+00:00" the Date parser
// is specified to accept, so the offset is normalised before parsing.
function parseTimestamp(value: string): Date | undefined {
  const date = new Date(value.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function plural(value: number, noun: string): string {
  return `${value} ${noun}${value === 1 ? "" : "s"} ago`;
}

export function relativeAge(value: string, now: number = Date.now()): string {
  const date = parseTimestamp(value);
  if (!date) {
    return "";
  }

  const elapsed = now - date.getTime();

  // A clock skew between this machine and AWS should read as "just now", never as a
  // negative age.
  if (elapsed < MINUTE) {
    return "just now";
  }
  if (elapsed < HOUR) {
    return plural(Math.floor(elapsed / MINUTE), "minute");
  }
  if (elapsed < DAY) {
    return plural(Math.floor(elapsed / HOUR), "hour");
  }
  if (elapsed < MONTH) {
    return plural(Math.floor(elapsed / DAY), "day");
  }

  return plural(Math.floor(elapsed / MONTH), "month");
}

// UTC throughout: a deploy timestamp is compared against what AWS shows, not
// against the reader's wall clock.
export function formatTimestamp(value: string, now: number = Date.now()): string {
  const date = parseTimestamp(value);
  if (!date) {
    return value;
  }

  const stamp = date.toISOString().slice(0, 16).replace("T", " ");
  const age = relativeAge(value, now);

  return age ? `${stamp} UTC (${age})` : `${stamp} UTC`;
}

function functionLine(fn: FunctionStatus, width: number, now: number): string {
  const name = fn.name.padEnd(width);

  if (!fn.deployed) {
    return `    ${name}not deployed`;
  }

  const { runtime, memorySize, lastModified, state } = fn.deployed;
  const parts = [
    runtime ?? "",
    memorySize ? `${memorySize} MB` : "",
    lastModified ? relativeAge(lastModified, now) : "",
  ].filter(Boolean);

  // Lambda reports Pending while a function is still being created, and Failed when
  // it cannot be started at all; Active is the normal case and goes unsaid.
  if (state && state !== "Active") {
    parts.push(`state ${state}`);
  }

  return `    ${name}${parts.join("   ")}`;
}

export function formatReport(report: StatusReport, now: number = Date.now()): string {
  const lines: string[] = [`${report.project} — ${report.environment}`, ""];

  lines.push(`  stack     ${report.stackName}   ${report.stack.status}`);
  if (report.stack.reason) {
    lines.push(`            ${report.stack.reason}`);
  }
  lines.push(`  region    ${report.region}`);
  if (report.profile) {
    lines.push(`  profile   ${report.profile}`);
  }

  // LastUpdatedTime is absent on a stack that has only ever been created.
  const changed = report.stack.updatedAt ?? report.stack.createdAt;
  if (changed) {
    const label = report.stack.updatedAt ? "updated" : "created";
    lines.push(`  ${label.padEnd(9)} ${formatTimestamp(changed, now)}`);
  }

  if (report.endpoints.length > 0) {
    lines.push("", "Endpoints");
    const width = Math.max(...report.endpoints.map((output) => output.key.length)) + 3;
    for (const output of report.endpoints) {
      lines.push(`  ${output.key.padEnd(width)}${output.value}`);
    }
  }

  if (report.functions.length > 0) {
    lines.push("", "Functions");
    const width = Math.max(...report.functions.map((fn) => fn.name.length)) + 3;

    // Grouped by service, which is how the project is laid out and how people ask
    // the question.
    const services = [...new Set(report.functions.map((fn) => fn.service))];
    for (const service of services) {
      lines.push(`  ${service}`);
      for (const fn of report.functions.filter((entry) => entry.service === service)) {
        lines.push(functionLine(fn, width, now));
      }
    }
  }

  if (report.hints.length > 0) {
    lines.push("", "Hints");
    for (const hint of report.hints) {
      lines.push(`  - ${hint}`);
    }
  }

  return lines.join("\n");
}
