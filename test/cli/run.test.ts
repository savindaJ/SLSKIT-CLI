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
import { scaffoldProject } from "../../src/commands/init/scaffold";
import { minimalAnswers } from "../helpers/fixtures";
import { createTempDir, removeDir, runProgram } from "../helpers/cli";

const mockSpawnSync = spawnSync as unknown as jest.Mock;

function callArgs(): string[] {
  return mockSpawnSync.mock.calls.map(([, args]) => (args as string[]).join(" "));
}

describe("slskit run command", () => {
  beforeEach(() => {
    cliLogs.errors.length = 0;
    cliLogs.infos.length = 0;
    mockSpawnSync.mockReset();
    mockSpawnSync.mockReturnValue({ error: null, status: 0 });
  });

  it("errors when sless.json is missing", async () => {
    const dir = createTempDir("slskit-run-missing-");
    const result = await runProgram(["run"], { cwd: dir });

    expect(result.status).not.toBe(0);
    expect(cliLogs.errors.join("\n")).toMatch(/No sless\.json found/);
    removeDir(dir);
  });

  it("rejects a project that is not AWS SAM", async () => {
    const dir = createTempDir("slskit-run-notsam-");
    fs.writeFileSync(
      path.join(dir, "sless.json"),
      JSON.stringify({ name: "demo-app", framework: { id: "serverless" } })
    );

    const result = await runProgram(["run"], { cwd: dir });

    expect(result.status).not.toBe(0);
    expect(cliLogs.errors.join("\n")).toMatch(/supports AWS SAM projects only/);
    removeDir(dir);
  });

  it("shows an install guide and errors when sam cli is missing", async () => {
    const dir = createTempDir("slskit-run-nosam-");
    const root = await scaffoldProject({ ...minimalAnswers, name: "demo-app" }, dir);
    mockSpawnSync.mockReturnValue({ error: new Error("ENOENT"), status: null });

    const result = await runProgram(["run"], { cwd: root });

    expect(result.status).not.toBe(0);
    expect(cliLogs.infos.join("\n")).toMatch(/AWS SAM CLI was not found/);
    expect(cliLogs.errors.join("\n")).toMatch(/AWS SAM CLI is required/);
    removeDir(dir);
  });

  it("runs sam build then sam local start-api on the given port", async () => {
    const dir = createTempDir("slskit-run-ok-");
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
    expect(calls.join("\n")).toMatch(/local start-api --port 4000/);
    expect(cliLogs.infos.join("\n")).toMatch(/one local API/);
    removeDir(dir);
  });

  it("skips sam build with --no-build", async () => {
    const dir = createTempDir("slskit-run-nobuild-");
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

  it("passes the default environment to sam as a parameter override", async () => {
    const dir = createTempDir("slskit-run-env-default-");
    const root = await scaffoldProject({ ...minimalAnswers, name: "demo-app" }, dir);

    await runProgram(["run"], { cwd: root });

    expect(callArgs().join("\n")).toMatch(/--parameter-overrides AppEnvironment=dev/);
    expect(cliLogs.infos.join("\n")).toMatch(/APP_ENVIRONMENT=dev/);
    removeDir(dir);
  });

  it("runs with the environment named as a positional argument", async () => {
    const dir = createTempDir("slskit-run-env-positional-");
    const root = await scaffoldProject({ ...minimalAnswers, name: "demo-app" }, dir);
    await runProgram(
      ["env", "add", "staging", "--profile", "p", "--region", "eu-west-1", "--skip-verify"],
      { cwd: root }
    );

    mockSpawnSync.mockClear();
    await runProgram(["run", "staging"], { cwd: root });

    expect(callArgs().join("\n")).toMatch(/AppEnvironment=staging/);
    expect(cliLogs.infos.join("\n")).toMatch(/APP_ENVIRONMENT=staging/);
    removeDir(dir);
  });

  it("accepts --env as well as the positional form", async () => {
    const dir = createTempDir("slskit-run-env-flag-");
    const root = await scaffoldProject({ ...minimalAnswers, name: "demo-app" }, dir);
    await runProgram(
      ["env", "add", "staging", "--profile", "p", "--region", "eu-west-1", "--skip-verify"],
      { cwd: root }
    );

    mockSpawnSync.mockClear();
    await runProgram(["run", "--env", "staging"], { cwd: root });

    expect(callArgs().join("\n")).toMatch(/AppEnvironment=staging/);
    removeDir(dir);
  });

  it("carries an environment's variables into the local run", async () => {
    const dir = createTempDir("slskit-run-env-vars-");
    const root = await scaffoldProject({ ...minimalAnswers, name: "demo-app" }, dir);
    await runProgram(["env", "set", "LOG_LEVEL=debug"], { cwd: root });

    mockSpawnSync.mockClear();
    await runProgram(["run"], { cwd: root });

    expect(callArgs().join("\n")).toMatch(/EnvLogLevel=debug/);
    removeDir(dir);
  });

  it("refuses an environment that does not exist", async () => {
    const dir = createTempDir("slskit-run-env-missing-");
    const root = await scaffoldProject({ ...minimalAnswers, name: "demo-app" }, dir);

    const result = await runProgram(["run", "production"], { cwd: root });

    expect(result.status).not.toBe(0);
    expect(cliLogs.errors.join("\n")).toMatch(/Environment "production" was not found/);
    removeDir(dir);
  });

  it("refuses to start when a declared secret is missing from the dotenv file", async () => {
    const dir = createTempDir("slskit-run-env-secret-");
    const root = await scaffoldProject({ ...minimalAnswers, name: "demo-app" }, dir);
    await runProgram(["env", "set", "API_KEY=temp", "--secret"], { cwd: root });
    fs.writeFileSync(path.join(root, ".env.dev"), "APP_ENVIRONMENT=dev\n");

    mockSpawnSync.mockClear();
    const result = await runProgram(["run"], { cwd: root });

    expect(result.status).not.toBe(0);
    expect(cliLogs.errors.join("\n")).toMatch(/marked secret .* but is missing/);
    removeDir(dir);
  });
});
