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

import { spawnSync } from "node:child_process";
import { scaffoldProject } from "../../src/commands/init/scaffold";
import { minimalAnswers } from "../helpers/fixtures";
import { createTempDir, removeDir, runProgram } from "../helpers/cli";

const mockSpawnSync = spawnSync as unknown as jest.Mock;

function callArgs(): string[] {
  return mockSpawnSync.mock.calls.map(([, args]) => (args as string[]).join(" "));
}

describe("sless run command", () => {
  beforeEach(() => {
    cliLogs.errors.length = 0;
    cliLogs.infos.length = 0;
    mockSpawnSync.mockReset();
    mockSpawnSync.mockReturnValue({ error: null, status: 0 });
  });

  it("errors when sless.json is missing", async () => {
    const dir = createTempDir("sless-run-missing-");
    const result = await runProgram(["run"], { cwd: dir });

    expect(result.status).not.toBe(0);
    expect(cliLogs.errors.join("\n")).toMatch(/No sless\.json found/);
    removeDir(dir);
  });

  it("rejects a non-sam project", async () => {
    const dir = createTempDir("sless-run-notsam-");
    const root = await scaffoldProject(
      { ...minimalAnswers, name: "demo-app", framework: "serverless" },
      dir
    );

    const result = await runProgram(["run"], { cwd: root });

    expect(result.status).not.toBe(0);
    expect(cliLogs.errors.join("\n")).toMatch(/supports SAM projects only/);
    removeDir(dir);
  });

  it("shows an install guide and errors when sam cli is missing", async () => {
    const dir = createTempDir("sless-run-nosam-");
    const root = await scaffoldProject({ ...minimalAnswers, name: "demo-app" }, dir);
    mockSpawnSync.mockReturnValue({ error: new Error("ENOENT"), status: null });

    const result = await runProgram(["run"], { cwd: root });

    expect(result.status).not.toBe(0);
    expect(cliLogs.infos.join("\n")).toMatch(/AWS SAM CLI was not found/);
    expect(cliLogs.errors.join("\n")).toMatch(/AWS SAM CLI is required/);
    removeDir(dir);
  });

  it("runs sam build then sam local start-api on the given port", async () => {
    const dir = createTempDir("sless-run-ok-");
    const root = await scaffoldProject({ ...minimalAnswers, name: "demo-app" }, dir);

    mockSpawnSync.mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === "local") {
        return { error: null, status: null, signal: "SIGINT" };
      }
      return { error: null, status: 0 };
    });

    const result = await runProgram(["run", "--port", "4000"], { cwd: root });

    expect(result.status).toBe(0);
    const calls = callArgs();
    expect(calls).toContain("--version");
    expect(calls).toContain("build");
    expect(calls).toContain("local start-api --port 4000");
    expect(cliLogs.infos.join("\n")).toMatch(/one local API/);
    removeDir(dir);
  });

  it("skips sam build with --no-build", async () => {
    const dir = createTempDir("sless-run-nobuild-");
    const root = await scaffoldProject({ ...minimalAnswers, name: "demo-app" }, dir);

    mockSpawnSync.mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === "local") {
        return { error: null, status: null, signal: "SIGINT" };
      }
      return { error: null, status: 0 };
    });

    const result = await runProgram(["run", "--no-build"], { cwd: root });

    expect(result.status).toBe(0);
    expect(callArgs()).not.toContain("build");
    removeDir(dir);
  });
});
