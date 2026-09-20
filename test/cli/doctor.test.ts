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
import type { DoctorReport } from "../../src/commands/doctor/types";

const mockSpawnSync = spawnSync as unknown as jest.Mock;

const AWS_ENV_KEYS = [
  "AWS_PROFILE",
  "AWS_REGION",
  "AWS_DEFAULT_REGION",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
];

let savedEnv: Record<string, string | undefined> = {};
let root: string;

function infoText(): string {
  return cliLogs.infos.join("\n");
}

function ok(stdout = ""): Record<string, unknown> {
  return { error: null, status: 0, stdout, stderr: "" };
}

// One place to describe the machine doctor is running on, so each test only states
// the part it is actually about.
function mockToolchain(
  overrides: {
    sam?: boolean;
    aws?: boolean;
    docker?: "running" | "stopped" | "missing";
    identity?: { Account: string; Arn: string };
    identityError?: string;
  } = {}
): void {
  const { sam = true, aws = true, docker = "running", identity, identityError } = overrides;

  const missing = {
    error: Object.assign(new Error("spawnSync ENOENT"), { code: "ENOENT" }),
    status: null,
    stdout: "",
    stderr: "",
  };

  mockSpawnSync.mockImplementation((command: string, args: string[]) => {
    if (command === "sam") {
      return sam ? ok("SAM CLI, version 1.120.0") : missing;
    }

    if (command === "docker") {
      if (docker === "missing") {
        return missing;
      }
      if (args[0] === "info") {
        return docker === "running"
          ? ok("24.0.7")
          : { error: null, status: 1, stdout: "", stderr: "Cannot connect to the daemon" };
      }
      return ok("Docker version 24.0.7, build afdd53b");
    }

    if (command === "aws") {
      if (!aws) {
        return missing;
      }
      if (args[0] === "--version") {
        return ok("aws-cli/2.15.30 Python/3.11.8");
      }
      if (args[0] === "sts") {
        return identity
          ? ok(JSON.stringify(identity))
          : { error: null, status: 255, stdout: "", stderr: identityError ?? "no credentials" };
      }
    }

    return ok();
  });
}

function writeProject(manifest: Record<string, unknown>): void {
  fs.writeFileSync(
    path.join(root, "slskit.json"),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
}

const healthyProject = {
  name: "shop",
  framework: { id: "sam" },
  applications: [{ name: "auth", functions: [{ name: "login" }] }],
  environments: {
    default: "dev",
    list: { dev: { region: "us-east-1", stackName: "shop-dev", profile: "work" } },
  },
};

const IDENTITY = { Account: "123456789012", Arn: "arn:aws:iam::123456789012:user/dev" };

beforeEach(() => {
  root = createTempDir("slskit-doctor-cli-");
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

describe("slskit doctor", () => {
  it("passes on a healthy machine and project", async () => {
    mockToolchain({ identity: IDENTITY });
    writeProject(healthyProject);

    const result = await runProgram(["doctor"], { cwd: root });

    expect(result.status).toBe(0);
    expect(infoText()).toContain("AWS SAM CLI");
    expect(infoText()).toContain('"shop" — 1 service, 1 function');
    expect(infoText()).toContain("account 123456789012");
    expect(infoText()).toContain("8 ok.");
  });

  // The point of the command: it runs anywhere, and having no project is not an error.
  it("runs outside a project and skips the project checks", async () => {
    mockToolchain();

    const result = await runProgram(["doctor"], { cwd: root });

    expect(result.status).toBe(0);
    expect(infoText()).toContain("skip");
    expect(infoText()).toContain("no slskit.json");
  });

  it("exits non-zero when a required tool is missing", async () => {
    mockToolchain({ sam: false });

    const result = await runProgram(["doctor"], { cwd: root });

    expect(result.status).toBe(1);
    expect(infoText()).toContain("not found on your PATH");
    expect(infoText()).toContain("install-sam-cli");
  });

  // Docker is only needed by "slskit run", so its absence must not fail a CI gate.
  it("warns about a stopped Docker daemon without failing", async () => {
    mockToolchain({ docker: "stopped" });

    const result = await runProgram(["doctor"], { cwd: root });

    expect(result.status).toBe(0);
    expect(infoText()).toContain("daemon is not responding");
  });

  it("fails when the credentials are rejected, and names the fix", async () => {
    mockToolchain({ identityError: "The config profile (work) could not be found" });
    writeProject(healthyProject);

    const result = await runProgram(["doctor"], { cwd: root });

    expect(result.status).toBe(1);
    expect(infoText()).toContain("could not be found");
    expect(infoText()).toContain("slskit configure --env dev --set-credentials");
  });

  it("checks the environment named by --env", async () => {
    mockToolchain({ identity: IDENTITY });
    writeProject({
      ...healthyProject,
      environments: {
        default: "dev",
        list: {
          dev: { region: "us-east-1", stackName: "shop-dev" },
          production: { region: "eu-west-2", stackName: "shop-production", profile: "prod" },
        },
      },
    });

    const result = await runProgram(["doctor", "--env", "production"], { cwd: root });

    expect(result.status).toBe(0);
    expect(infoText()).toContain('Environment "production"');
    expect(infoText()).toContain("eu-west-2");
  });

  it("fails on an environment that does not exist", async () => {
    mockToolchain({ identity: IDENTITY });
    writeProject(healthyProject);

    const result = await runProgram(["doctor", "--env", "staging"], { cwd: root });

    expect(result.status).toBe(1);
    expect(infoText()).toContain('Environment "staging"');
    expect(infoText()).toContain("slskit env add staging");
  });

  it("emits a machine-readable report under --json and nothing else", async () => {
    mockToolchain({ identity: IDENTITY });
    writeProject(healthyProject);

    const written: string[] = [];
    const spy = jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: unknown) => {
        written.push(String(chunk));
        return true;
      });

    const result = await runProgram(["doctor", "--json"], { cwd: root });
    spy.mockRestore();

    expect(result.status).toBe(0);
    expect(infoText()).toBe("");

    const report = JSON.parse(written.join("")) as DoctorReport;
    expect(report.ok).toBe(true);
    expect(report.summary.fail).toBe(0);
    expect(report.checks.map((check) => check.id)).toEqual([
      "node",
      "sam-cli",
      "aws-cli",
      "docker",
      "project",
      "environment",
      "variables",
      "credentials",
    ]);
  });

  // The shape has to hold even when most checks could not run, or a CI consumer
  // would have to special-case every partial machine.
  it("reports the same check list when there is no project", async () => {
    mockToolchain();

    const written: string[] = [];
    const spy = jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: unknown) => {
        written.push(String(chunk));
        return true;
      });

    await runProgram(["doctor", "--json"], { cwd: root });
    spy.mockRestore();

    const report = JSON.parse(written.join("")) as DoctorReport;
    expect(report.checks).toHaveLength(8);
    expect(report.summary.skip).toBe(4);
  });
});
