import { formatReport, summarize, summaryLine } from "../../src/commands/doctor/report";
import type { CheckResult } from "../../src/commands/doctor/types";

const ok: CheckResult = { id: "node", title: "Node.js", status: "ok", detail: "v20.11.0" };
const warn: CheckResult = {
  id: "docker",
  title: "Docker",
  status: "warn",
  detail: "installed, but the daemon is not responding",
  fix: "Start Docker Desktop.",
};
const fail: CheckResult = {
  id: "credentials",
  title: "AWS credentials",
  status: "fail",
  detail: "rejected in us-east-1",
  fix: "slskit configure --env dev --set-credentials",
};
const skip: CheckResult = {
  id: "project",
  title: "Project",
  status: "skip",
  detail: "no slskit.json here",
};

describe("summarize", () => {
  it("counts each status", () => {
    expect(summarize([ok, ok, warn, fail, skip]).summary).toEqual({
      ok: 2,
      warn: 1,
      fail: 1,
      skip: 1,
    });
  });

  // ok mirrors the exit code, so only a failure may clear it.
  it("is ok when nothing failed", () => {
    expect(summarize([ok, warn, skip]).ok).toBe(true);
  });

  it("is not ok when anything failed", () => {
    expect(summarize([ok, fail]).ok).toBe(false);
  });

  it("is ok for an empty run", () => {
    expect(summarize([]).ok).toBe(true);
  });
});

describe("summaryLine", () => {
  it("names only the statuses that occurred", () => {
    expect(summaryLine({ ok: 3, warn: 0, fail: 0, skip: 0 })).toBe("3 ok.");
  });

  it("leads with the failures", () => {
    expect(summaryLine({ ok: 4, warn: 1, fail: 2, skip: 1 })).toBe(
      "2 failed, 1 warning, 4 ok, 1 skipped."
    );
  });

  it("singularises one warning", () => {
    expect(summaryLine({ ok: 0, warn: 1, fail: 0, skip: 0 })).toBe("1 warning.");
  });
});

describe("formatReport", () => {
  it("puts the fix under the check it belongs to", () => {
    const lines = formatReport(summarize([warn])).split("\n");

    expect(lines[0]).toContain("warn");
    expect(lines[0]).toContain("Docker");
    expect(lines[1]).toContain("fix: Start Docker Desktop.");
  });

  it("tells you what to do next when something failed", () => {
    const text = formatReport(summarize([ok, fail]));
    expect(text).toContain("1 failed, 1 ok.");
    expect(text).toContain('Fix the checks marked "fail"');
  });

  it("does not print a fix for a passing check", () => {
    const passing: CheckResult = { ...ok, fix: "should never be shown" };
    expect(formatReport(summarize([passing]))).not.toContain("should never be shown");
  });

  // A warning is not a failure, so the closing line must not read like one.
  it("closes differently for warnings and failures", () => {
    expect(formatReport(summarize([warn]))).toContain("No failures.");
    expect(formatReport(summarize([fail]))).toContain('Fix the checks marked "fail"');
  });

  it("says nothing extra when everything passed", () => {
    const text = formatReport(summarize([ok]));
    expect(text).not.toContain("No failures.");
    expect(text).not.toContain("fix:");
  });
});
