// A check either passed, passed with something worth saying, failed, or could not
// be run at all. Only "fail" changes the exit code: a warning is something slskit
// can still work around (Docker is needed by "slskit run" and nothing else), and a
// skip means the answer was unknowable here, not that anything is wrong.
export type CheckStatus = "ok" | "warn" | "fail" | "skip";

export interface CheckResult {
  /** Stable machine-readable id, so --json output can be asserted on in CI. */
  id: string;
  title: string;
  status: CheckStatus;
  /** What was actually found. */
  detail?: string;
  /** The command or action that resolves it. Only set for warn and fail. */
  fix?: string;
}

export interface DoctorOptions {
  env?: string;
}

export interface DoctorSummary {
  ok: number;
  warn: number;
  fail: number;
  skip: number;
}

export interface DoctorReport {
  /** False when any check failed. Mirrors the exit code. */
  ok: boolean;
  checks: CheckResult[];
  summary: DoctorSummary;
}
