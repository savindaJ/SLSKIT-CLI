import { formatReport, formatTimestamp, relativeAge } from "../../src/commands/status/format";
import type { StatusReport } from "../../src/commands/status/types";

const NOW = Date.parse("2026-09-20T12:00:00.000Z");

describe("relativeAge", () => {
  it("reads under a minute as just now", () => {
    expect(relativeAge("2026-09-20T11:59:30.000Z", NOW)).toBe("just now");
  });

  it("counts minutes, hours, days and months", () => {
    expect(relativeAge("2026-09-20T11:15:00.000Z", NOW)).toBe("45 minutes ago");
    expect(relativeAge("2026-09-19T18:00:00.000Z", NOW)).toBe("18 hours ago");
    expect(relativeAge("2026-09-13T12:00:00.000Z", NOW)).toBe("7 days ago");
    expect(relativeAge("2026-06-20T12:00:00.000Z", NOW)).toBe("3 months ago");
  });

  it("singularises one of each", () => {
    expect(relativeAge("2026-09-20T11:00:00.000Z", NOW)).toBe("1 hour ago");
    expect(relativeAge("2026-09-19T11:00:00.000Z", NOW)).toBe("1 day ago");
  });

  // AWS returns "+0000", which is not the offset format the Date parser is
  // specified to take.
  it("parses the offset format AWS actually returns", () => {
    expect(relativeAge("2026-09-19T18:00:00.000+0000", NOW)).toBe("18 hours ago");
  });

  // A machine whose clock is behind AWS must not report a negative age.
  it("never reports a future timestamp as negative", () => {
    expect(relativeAge("2026-09-20T12:05:00.000Z", NOW)).toBe("just now");
  });

  it("gives up quietly on an unparseable timestamp", () => {
    expect(relativeAge("whenever", NOW)).toBe("");
  });
});

describe("formatTimestamp", () => {
  it("pairs the UTC stamp with the age", () => {
    expect(formatTimestamp("2026-09-19T18:00:00.000+0000", NOW)).toBe(
      "2026-09-19 18:00 UTC (18 hours ago)"
    );
  });

  it("returns an unparseable value unchanged", () => {
    expect(formatTimestamp("whenever", NOW)).toBe("whenever");
  });
});

const report: StatusReport = {
  project: "shop",
  environment: "production",
  stackName: "shop-production",
  region: "eu-west-2",
  profile: "prod-admin",
  health: "ok",
  stack: {
    status: "UPDATE_COMPLETE",
    createdAt: "2026-08-01T09:00:00.000+0000",
    updatedAt: "2026-09-19T18:00:00.000+0000",
  },
  endpoints: [
    { key: "ApiUrl", value: "https://6hjgplpky0.execute-api.eu-west-2.amazonaws.com" },
  ],
  functions: [
    {
      name: "login",
      service: "auth",
      physical: "shop-production-login",
      deployed: {
        name: "shop-production-login",
        runtime: "nodejs20.x",
        memorySize: 512,
        lastModified: "2026-09-19T18:00:00.000+0000",
        state: "Active",
        variableNames: ["APP_ENVIRONMENT", "LOG_LEVEL"],
      },
    },
    { name: "list", service: "product", physical: "shop-production-list" },
  ],
  hints: ['"list" is in slskit.json but not in the stack.'],
};

describe("formatReport", () => {
  it("leads with the project, environment and stack status", () => {
    const text = formatReport(report, NOW);
    expect(text.split("\n")[0]).toBe("shop — production");
    expect(text).toContain("shop-production   UPDATE_COMPLETE");
    expect(text).toContain("eu-west-2");
    expect(text).toContain("prod-admin");
  });

  it("shows when the stack last changed", () => {
    expect(formatReport(report, NOW)).toContain("updated   2026-09-19 18:00 UTC (18 hours ago)");
  });

  // The whole point of the command: the URLs deploy printed once.
  it("lists the endpoints", () => {
    expect(formatReport(report, NOW)).toContain(
      "ApiUrl   https://6hjgplpky0.execute-api.eu-west-2.amazonaws.com"
    );
  });

  it("groups functions under their service", () => {
    const lines = formatReport(report, NOW).split("\n");
    const auth = lines.findIndex((line) => line === "  auth");
    expect(lines[auth + 1]).toContain("login");
    expect(lines[auth + 1]).toContain("nodejs20.x");
    expect(lines[auth + 1]).toContain("512 MB");
    expect(lines[auth + 1]).toContain("18 hours ago");
  });

  it("says plainly when a declared function is not in AWS", () => {
    expect(formatReport(report, NOW)).toContain("not deployed");
  });

  it("prints the hints", () => {
    expect(formatReport(report, NOW)).toContain('- "list" is in slskit.json but not in the stack.');
  });

  it("names a Lambda state only when it is not Active", () => {
    expect(formatReport(report, NOW)).not.toContain("state Active");

    const pending = {
      ...report,
      functions: [
        {
          ...report.functions[0],
          deployed: { ...report.functions[0].deployed!, state: "Pending" },
        },
      ],
    };
    expect(formatReport(pending, NOW)).toContain("state Pending");
  });

  it("falls back to the creation time on a stack that was never updated", () => {
    const fresh = { ...report, stack: { status: "CREATE_COMPLETE", createdAt: report.stack.createdAt } };
    const text = formatReport(fresh, NOW);
    expect(text).toContain("created");
    expect(text).not.toContain("updated");
  });

  it("shows the reason a stack gives for its status", () => {
    const failed = {
      ...report,
      stack: { ...report.stack, status: "UPDATE_ROLLBACK_COMPLETE", reason: "Resource handler returned message" },
    };
    expect(formatReport(failed, NOW)).toContain("Resource handler returned message");
  });

  it("omits empty sections", () => {
    const bare = { ...report, endpoints: [], functions: [], hints: [] };
    const text = formatReport(bare, NOW);
    expect(text).not.toContain("Endpoints");
    expect(text).not.toContain("Functions");
    expect(text).not.toContain("Hints");
  });
});
