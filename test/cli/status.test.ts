jest.mock("node:child_process", () => ({
  ...jest.requireActual("node:child_process"),
  spawnSync: jest.fn(),
}));

const cliLogs = { errors: [] as string[], infos: [] as string[] };

jest.mock("../../src/core/logger", () => ({
  logger: {
    info: (message: string) => {
      cliLogs.infos.push(message);
    },
    error: (message: string) => {
      cliLogs.errors.push(message);
    },
  },
}));

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createTempDir, removeDir, runProgram } from "../helpers/cli";
import type { StatusReport } from "../../src/commands/status/types";

const mockSpawnSync = spawnSync as unknown as jest.Mock;

const AWS_ENV_KEYS = ["AWS_PROFILE", "AWS_REGION", "AWS_DEFAULT_REGION", "AWS_ACCESS_KEY_ID"];
let savedEnv: Record<string, string | undefined> = {};
let root: string;

function infoText(): string {
  return cliLogs.infos.join("\n");
}

function errorText(): string {
  return cliLogs.errors.join("\n");
}

function ok(stdout = ""): Record<string, unknown> {
  return { error: null, status: 0, stdout, stderr: "" };
}

const STACK = {
  status: "UPDATE_COMPLETE",
  reason: null,
  created: "2026-08-01T09:00:00.000+0000",
  updated: "2026-09-19T18:00:00.000+0000",
};

const OUTPUTS = [
  {
    OutputKey: "ApiUrl",
    OutputValue: "https://6hjgplpky0.execute-api.us-east-1.amazonaws.com",
  },
];

const LAMBDAS = [
  {
    FunctionName: "shop-dev-login",
    Runtime: "nodejs20.x",
    MemorySize: 512,
    LastModified: "2026-09-19T18:00:00.000+0000",
    State: "Active",
    Variables: { APP_ENVIRONMENT: "dev" },
  },
];

// Describes the AWS account this run is talking to. Each test states only the part
// it is about.
function mockAws(
  options: {
    awsCli?: boolean;
    stack?: Record<string, unknown> | null;
    stackError?: string;
    outputs?: unknown[];
    functions?: unknown[];
  } = {}
): void {
  const { awsCli = true, stack = STACK, stackError, outputs = OUTPUTS, functions = LAMBDAS } =
    options;

  mockSpawnSync.mockImplementation((command: string, args: string[]) => {
    if (command !== "aws") {
      return ok();
    }

    if (!awsCli) {
      return { error: Object.assign(new Error("ENOENT"), { code: "ENOENT" }), status: null };
    }

    if (args[0] === "--version") {
      return ok("aws-cli/2.15.30");
    }

    if (args[0] === "cloudformation") {
      const query = args[args.indexOf("--query") + 1] ?? "";

      if (query.includes("Outputs")) {
        return ok(JSON.stringify(outputs));
      }

      if (stackError) {
        return { error: null, status: 254, stdout: "", stderr: stackError };
      }

      return ok(JSON.stringify(stack));
    }

    if (args[0] === "lambda") {
      return ok(JSON.stringify(functions));
    }

    return ok();
  });
}

function writeProject(overrides: Record<string, unknown> = {}): void {
  fs.writeFileSync(
    path.join(root, "slskit.json"),
    JSON.stringify(
      {
        name: "shop",
        framework: { id: "sam" },
        applications: [
          { name: "auth", functions: [{ name: "login" }] },
          { name: "product", functions: [{ name: "list" }] },
        ],
        environments: {
          default: "dev",
          list: {
            dev: { region: "us-east-1", stackName: "shop-dev", profile: "work" },
            production: {
              region: "eu-west-2",
              stackName: "shop-production",
              profile: "prod-admin",
            },
          },
        },
        ...overrides,
      },
      null,
      2
    )
  );
}

beforeEach(() => {
  root = createTempDir("slskit-status-");
  cliLogs.infos = [];
  cliLogs.errors = [];
  mockSpawnSync.mockReset();

  savedEnv = Object.fromEntries(AWS_ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of AWS_ENV_KEYS) {
    delete process.env[key];
  }
});

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  removeDir(root);
});

describe("slskit status", () => {
  it("reports the stack, endpoints and functions of the default environment", async () => {
    mockAws();
    writeProject();

    const result = await runProgram(["status"], { cwd: root });

    expect(result.status).toBe(0);
    expect(infoText()).toContain("shop — dev");
    expect(infoText()).toContain("shop-dev   UPDATE_COMPLETE");
    expect(infoText()).toContain("https://6hjgplpky0.execute-api.us-east-1.amazonaws.com");
    expect(infoText()).toContain("nodejs20.x");
    expect(infoText()).toContain("512 MB");
  });

  it("takes the environment as a positional argument", async () => {
    mockAws();
    writeProject();

    await runProgram(["status", "production"], { cwd: root });

    expect(infoText()).toContain("shop — production");
    expect(infoText()).toContain("eu-west-2");
  });

  it("takes the environment from --env as well", async () => {
    mockAws();
    writeProject();

    await runProgram(["status", "--env", "production"], { cwd: root });
    expect(infoText()).toContain("shop — production");
  });

  // The question the command exists to answer has a useful answer even when it is
  // "nothing yet", and it names the command that changes that.
  it("says nothing is deployed when the stack does not exist", async () => {
    mockAws({ stackError: "An error occurred (ValidationError): Stack with id shop-dev does not exist" });
    writeProject();

    const result = await runProgram(["status"], { cwd: root });

    expect(result.status).toBe(1);
    expect(errorText()).toContain("Nothing is deployed");
    expect(errorText()).toContain("slskit deploy dev --all");
  });

  it("separates a credentials problem from a missing stack", async () => {
    mockAws({ stackError: "An error occurred (ExpiredToken): The security token included in the request is expired" });
    writeProject();

    const result = await runProgram(["status"], { cwd: root });

    expect(result.status).toBe(1);
    expect(errorText()).toContain("Could not read stack");
    expect(errorText()).toContain("slskit doctor --env dev");
  });

  it("flags a function that is declared but not deployed", async () => {
    mockAws();
    writeProject();

    await runProgram(["status"], { cwd: root });

    expect(infoText()).toContain("not deployed");
    expect(infoText()).toContain('"list" is in slskit.json but not in the stack');
  });

  it("flags a Lambda that outlived its entry in the manifest", async () => {
    mockAws({
      functions: [
        ...LAMBDAS,
        { FunctionName: "shop-dev-oldHandler", Runtime: "nodejs20.x", Variables: {} },
      ],
    });
    writeProject();

    await runProgram(["status"], { cwd: root });

    expect(infoText()).toContain("shop-dev-oldHandler");
    expect(infoText()).toContain("no longer in slskit.json");
  });

  it("exits non-zero on a rolled-back stack and says the code may be stale", async () => {
    mockAws({ stack: { ...STACK, status: "UPDATE_ROLLBACK_COMPLETE" } });
    writeProject();

    const result = await runProgram(["status"], { cwd: root });

    expect(result.status).toBe(1);
    expect(infoText()).toContain("UPDATE_ROLLBACK_COMPLETE");
    expect(infoText()).toContain("did not finish cleanly");
  });

  it("stays at zero while a deploy is still running", async () => {
    mockAws({ stack: { ...STACK, status: "UPDATE_IN_PROGRESS" } });
    writeProject();

    const result = await runProgram(["status"], { cwd: root });

    expect(result.status).toBe(0);
    expect(infoText()).toContain("will move");
  });

  it("fails clearly when the environment has no region", async () => {
    mockAws();
    writeProject({
      environments: { default: "dev", list: { dev: { stackName: "shop-dev" } } },
    });

    const result = await runProgram(["status"], { cwd: root });

    expect(result.status).toBe(1);
    expect(errorText()).toContain("has no AWS region");
  });

  it("fails on an environment that does not exist", async () => {
    mockAws();
    writeProject();

    const result = await runProgram(["status", "staging"], { cwd: root });

    expect(result.status).toBe(1);
    expect(errorText()).toContain('Environment "staging" was not found');
  });

  it("requires the AWS CLI", async () => {
    mockAws({ awsCli: false });
    writeProject();

    const result = await runProgram(["status"], { cwd: root });

    expect(result.status).toBe(1);
    expect(errorText()).toContain("AWS CLI is required");
  });

  it("emits the report as JSON and nothing else", async () => {
    mockAws();
    writeProject();

    const written: string[] = [];
    const spy = jest.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      written.push(String(chunk));
      return true;
    });

    const result = await runProgram(["status", "--json"], { cwd: root });
    spy.mockRestore();

    expect(result.status).toBe(0);
    expect(infoText()).toBe("");

    const report = JSON.parse(written.join("")) as StatusReport;
    expect(report.project).toBe("shop");
    expect(report.environment).toBe("dev");
    expect(report.health).toBe("ok");
    expect(report.endpoints[0].key).toBe("ApiUrl");
    expect(report.functions.map((fn) => fn.name)).toEqual(["login", "list"]);
    expect(report.functions[1].deployed).toBeUndefined();
  });

  // A secret with no value is a deploy that will stop, and status is where people
  // look before they deploy.
  it("warns about a secret with no value", async () => {
    mockAws();
    writeProject({
      environments: {
        default: "dev",
        list: {
          dev: {
            region: "us-east-1",
            stackName: "shop-dev",
            variables: { API_KEY: { secret: true } },
          },
        },
      },
    });

    await runProgram(["status"], { cwd: root });

    expect(infoText()).toContain("API_KEY");
    expect(infoText()).toContain("will stop until it has a value");
  });
});
