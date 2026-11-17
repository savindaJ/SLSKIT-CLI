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

function samCalls(): string[] {
  return mockSpawnSync.mock.calls
    .filter(([cmd]) => cmd === "sam")
    .map(([, args]) => (args as string[]).join(" "));
}

function awsCalls(): string[] {
  return mockSpawnSync.mock.calls
    .filter(([cmd]) => cmd === "aws")
    .map(([, args]) => (args as string[]).join(" "));
}

describe("slskit invoke command", () => {
  beforeEach(() => {
    cliLogs.errors.length = 0;
    cliLogs.infos.length = 0;
    mockSpawnSync.mockReset();
    mockSpawnSync.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "sam" && args[0] === "--version") {
        return { error: null, status: 0 };
      }
      if (cmd === "aws" && args[0] === "--version") {
        return { error: null, status: 0 };
      }
      if (cmd === "aws" && args[0] === "lambda") {
        return {
          error: null,
          status: 0,
          stdout: JSON.stringify({ StatusCode: 200 }),
          stderr: "",
        };
      }
      return { error: null, status: 0 };
    });
  });

  it("errors when slskit.json is missing", async () => {
    const dir = createTempDir("slskit-invoke-missing-");
    const result = await runProgram(["invoke", "login"], { cwd: dir });
    expect(result.status).not.toBe(0);
    expect(cliLogs.errors.join("\n")).toMatch(/No slskit\.json found/);
    removeDir(dir);
  });

  it("requires a function name in non-interactive mode", async () => {
    const dir = createTempDir("slskit-invoke-nottty-");
    const root = await scaffoldProject({ ...minimalAnswers, name: "demo-app" }, dir);
    const result = await runProgram(["invoke"], { cwd: root });
    expect(result.status).not.toBe(0);
    expect(cliLogs.errors.join("\n")).toMatch(/Pass a function name/);
    removeDir(dir);
  });

  it("rejects a missing event file", async () => {
    const dir = createTempDir("slskit-invoke-event-");
    const root = await scaffoldProject({ ...minimalAnswers, name: "demo-app" }, dir);
    const result = await runProgram(
      ["invoke", "login", "--event", "events/missing.json"],
      { cwd: root }
    );
    expect(result.status).not.toBe(0);
    expect(cliLogs.errors.join("\n")).toMatch(/Event file not found/);
    removeDir(dir);
  });

  it("runs sam build and sam local invoke with an event file", async () => {
    const dir = createTempDir("slskit-invoke-local-");
    const root = await scaffoldProject({ ...minimalAnswers, name: "demo-app" }, dir);
    const eventsDir = path.join(root, "events");
    fs.mkdirSync(eventsDir, { recursive: true });
    fs.writeFileSync(
      path.join(eventsDir, "login.json"),
      JSON.stringify({ body: JSON.stringify({ user: "test@example.com" }) })
    );

    const result = await runProgram(
      ["invoke", "login", "--event", "events/login.json"],
      { cwd: root }
    );

    expect(result.status).toBe(0);
    const calls = samCalls().join("\n");
    expect(calls).toMatch(/build -t \.slskit-local\.yaml/);
    expect(calls).toMatch(/local invoke AuthStack\/LoginFunction/);
    expect(calls).toMatch(/events\/login\.json/);
    removeDir(dir);
  });

  it("invokes a deployed function with --remote", async () => {
    const dir = createTempDir("slskit-invoke-remote-");
    const root = await scaffoldProject({ ...minimalAnswers, name: "shop" }, dir);
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "slskit.json"), "utf8")) as {
      environments: { list: Record<string, { region: string; stackName: string }> };
    };
    manifest.environments.list.dev.region = "us-east-1";
    manifest.environments.list.dev.stackName = "shop-dev";
    fs.writeFileSync(path.join(root, "slskit.json"), JSON.stringify(manifest, null, 2));

    const result = await runProgram(
      ["invoke", "login", "--remote", "--env", "dev", "--event", "events/login.json"],
      { cwd: root }
    );

    expect(result.status).not.toBe(0);
    expect(cliLogs.errors.join("\n")).toMatch(/Event file not found/);

    const eventsDir = path.join(root, "events");
    fs.mkdirSync(eventsDir, { recursive: true });
    fs.writeFileSync(path.join(eventsDir, "login.json"), "{}");

    const ok = await runProgram(
      ["invoke", "login", "--remote", "--env", "dev", "--event", "events/login.json"],
      { cwd: root }
    );

    expect(ok.status).toBe(0);
    const call = awsCalls().join(" ");
    expect(call).toMatch(/lambda invoke/);
    expect(call).toMatch(/shop-dev-login/);
    expect(call).toMatch(/us-east-1/);
    removeDir(dir);
  });
});