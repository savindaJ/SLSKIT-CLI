jest.mock("node:child_process", () => ({
  ...jest.requireActual("node:child_process"),
  spawnSync: jest.fn(),
}));

import { spawnSync } from "node:child_process";
import {
  describeStack,
  listDeployedFunctions,
  stackHealth,
} from "../../src/commands/status/aws";

const mockSpawnSync = spawnSync as unknown as jest.Mock;
const target = { stackName: "shop-dev", region: "us-east-1", profile: "work" };

function ok(stdout: string): Record<string, unknown> {
  return { error: null, status: 0, stdout, stderr: "" };
}

beforeEach(() => {
  mockSpawnSync.mockReset();
});

describe("stackHealth", () => {
  it("treats settled stacks as ok", () => {
    expect(stackHealth("CREATE_COMPLETE")).toBe("ok");
    expect(stackHealth("UPDATE_COMPLETE")).toBe("ok");
    expect(stackHealth("IMPORT_COMPLETE")).toBe("ok");
  });

  it("treats anything in progress as busy", () => {
    expect(stackHealth("UPDATE_IN_PROGRESS")).toBe("busy");
    expect(stackHealth("CREATE_IN_PROGRESS")).toBe("busy");
  });

  it("treats failures and rollbacks as failed", () => {
    expect(stackHealth("CREATE_FAILED")).toBe("failed");
    expect(stackHealth("ROLLBACK_COMPLETE")).toBe("failed");
  });

  // UPDATE_ROLLBACK_COMPLETE ends in _COMPLETE but is not a healthy stack, so the
  // rollback test has to win.
  it("reads a completed rollback as failed, not ok", () => {
    expect(stackHealth("UPDATE_ROLLBACK_COMPLETE")).toBe("failed");
    expect(stackHealth("UPDATE_ROLLBACK_IN_PROGRESS")).toBe("failed");
  });

  it("treats an unrecognised status as failed rather than assuming the best", () => {
    expect(stackHealth("REVIEW_IN_PROGRESS_SOMETHING_ELSE")).toBe("failed");
  });
});

describe("describeStack", () => {
  it("returns the status and timestamps", () => {
    mockSpawnSync.mockReturnValue(
      ok(
        JSON.stringify({
          status: "UPDATE_COMPLETE",
          reason: null,
          created: "2026-08-01T09:00:00.000+0000",
          updated: "2026-09-19T18:00:00.000+0000",
        })
      )
    );

    expect(describeStack(target).summary).toEqual({
      status: "UPDATE_COMPLETE",
      reason: undefined,
      createdAt: "2026-08-01T09:00:00.000+0000",
      updatedAt: "2026-09-19T18:00:00.000+0000",
    });
  });

  it("passes the profile and region through to the AWS CLI", () => {
    mockSpawnSync.mockReturnValue(ok(JSON.stringify({ status: "CREATE_COMPLETE" })));
    describeStack(target);

    const args = mockSpawnSync.mock.calls[0][1] as string[];
    expect(args).toContain("--profile");
    expect(args).toContain("work");
    expect(args).toContain("--region");
    expect(args).toContain("us-east-1");
  });

  it("reports the CLI's own message when the stack cannot be read", () => {
    mockSpawnSync.mockReturnValue({
      error: null,
      status: 254,
      stdout: "",
      stderr: "An error occurred (ValidationError): Stack with id shop-dev does not exist",
    });

    const { summary, error } = describeStack(target);
    expect(summary).toBeUndefined();
    expect(error).toContain("does not exist");
  });
});

describe("listDeployedFunctions", () => {
  it("maps what Lambda returns, sorted by name", () => {
    mockSpawnSync.mockReturnValue(
      ok(
        JSON.stringify([
          {
            FunctionName: "shop-dev-register",
            Runtime: "nodejs20.x",
            MemorySize: 256,
            LastModified: "2026-09-19T18:00:00.000+0000",
            State: "Active",
            Variables: { LOG_LEVEL: "debug", APP_ENVIRONMENT: "dev" },
          },
          {
            FunctionName: "shop-dev-login",
            Runtime: "nodejs20.x",
            MemorySize: 512,
            LastModified: "2026-09-19T18:00:00.000+0000",
            State: "Active",
            Variables: null,
          },
        ])
      )
    );

    const functions = listDeployedFunctions(target, "shop-dev-");

    expect(functions.map((fn) => fn.name)).toEqual(["shop-dev-login", "shop-dev-register"]);
    expect(functions[1].memorySize).toBe(256);
  });

  // A status report must not be able to print a secret, so only names are kept.
  it("keeps variable names and discards their values", () => {
    mockSpawnSync.mockReturnValue(
      ok(
        JSON.stringify([
          {
            FunctionName: "shop-dev-login",
            Variables: { API_KEY: "sk-live-do-not-print", APP_ENVIRONMENT: "dev" },
          },
        ])
      )
    );

    const [fn] = listDeployedFunctions(target, "shop-dev-");

    expect(fn.variableNames).toEqual(["APP_ENVIRONMENT", "API_KEY"].sort());
    expect(JSON.stringify(fn)).not.toContain("sk-live-do-not-print");
  });

  it("handles a function with no environment block", () => {
    mockSpawnSync.mockReturnValue(ok(JSON.stringify([{ FunctionName: "shop-dev-login" }])));
    expect(listDeployedFunctions(target, "shop-dev-")[0].variableNames).toEqual([]);
  });

  it("filters on the project's own prefix", () => {
    mockSpawnSync.mockReturnValue(ok("[]"));
    listDeployedFunctions(target, "shop-dev-");

    const args = mockSpawnSync.mock.calls[0][1] as string[];
    expect(args.join(" ")).toContain("starts_with(FunctionName, 'shop-dev-')");
  });

  it("returns nothing rather than throwing when the call fails", () => {
    mockSpawnSync.mockReturnValue({ error: new Error("boom"), status: null, stdout: "", stderr: "" });
    expect(listDeployedFunctions(target, "shop-dev-")).toEqual([]);
  });

  it("returns nothing when the response is not JSON", () => {
    mockSpawnSync.mockReturnValue(ok("not json"));
    expect(listDeployedFunctions(target, "shop-dev-")).toEqual([]);
  });
});
