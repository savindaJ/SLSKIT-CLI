jest.mock("node:child_process", () => ({
  ...jest.requireActual("node:child_process"),
  spawnSync: jest.fn(),
  spawn: jest.fn(),
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
import { spawn, spawnSync } from "node:child_process";
import { scaffoldProject } from "../../src/commands/init/scaffold";
import { minimalAnswers } from "../helpers/fixtures";
import { createTempDir, removeDir, runProgram } from "../helpers/cli";
import { fakeChild } from "../helpers/child";

const mockSpawnSync = spawnSync as unknown as jest.Mock;
const mockSpawn = spawn as unknown as jest.Mock;

// "sam local start-api" is spawned rather than run to completion, so both mocks have
// to be read together to see everything the command asked sam to do.
const allCalls = (): [string, string[]][] => [
  ...(mockSpawnSync.mock.calls as [string, string[]][]),
  ...(mockSpawn.mock.calls as [string, string[]][]),
];

const samArgs = (): string =>
  allCalls()
    .filter(([cmd]) => cmd === "sam")
    .map(([, args]) => args.join(" "))
    .join("\n");

async function project(prefix: string): Promise<{ dir: string; root: string }> {
  const dir = createTempDir(prefix);
  const root = await scaffoldProject({ ...minimalAnswers, name: "shop" }, dir);
  return { dir, root };
}

function appendToDotenv(root: string, environment: string, line: string): void {
  const file = path.join(root, `.env.${environment}`);
  fs.appendFileSync(file, `${line}\n`);
}

// A variable someone typed into .env.<stage> by hand has to reach the running
// functions exactly like one added through "slskit env set" -- otherwise it silently
// arrives as undefined at runtime.
describe("variables added straight to a .env file", () => {
  beforeEach(() => {
    cliLogs.errors.length = 0;
    cliLogs.infos.length = 0;
    mockSpawnSync.mockReset();
    mockSpawnSync.mockReturnValue({ error: null, status: 0 });
    mockSpawn.mockReset();
    mockSpawn.mockImplementation(() => fakeChild());
  });

  it("becomes a template parameter and reaches every function", async () => {
    const { dir, root } = await project("slskit-dyn-run-");
    appendToDotenv(root, "dev", "SOME_API_KEY=abc123");

    const result = await runProgram(["run"], { cwd: root });

    expect(result.status).toBe(0);
    expect(samArgs()).toMatch(/ParameterKey=EnvSomeApiKey,ParameterValue="abc123"/);

    const rootTemplate = fs.readFileSync(path.join(root, "template.yaml"), "utf8");
    expect(rootTemplate).toMatch(/EnvSomeApiKey:/);

    const service = fs.readFileSync(
      path.join(root, "templates/auth.yaml"),
      "utf8"
    );
    expect(service).toMatch(/SOME_API_KEY: !Ref EnvSomeApiKey/);
    removeDir(dir);
  });

  it("leaves the templates alone when nothing changed", async () => {
    const { dir, root } = await project("slskit-dyn-stable-");
    await runProgram(["run"], { cwd: root });
    const before = fs.readFileSync(path.join(root, "template.yaml"), "utf8");

    cliLogs.infos.length = 0;
    await runProgram(["run"], { cwd: root });

    expect(fs.readFileSync(path.join(root, "template.yaml"), "utf8")).toBe(before);
    expect(cliLogs.infos.join("\n")).not.toMatch(/Updated \d+ template/);
    removeDir(dir);
  });

  it("keeps each stage's own value for the same variable", async () => {
    const { dir, root } = await project("slskit-dyn-stages-");
    await runProgram(
      ["env", "add", "production", "--profile", "p", "--region", "eu-west-2", "--skip-verify"],
      { cwd: root }
    );
    appendToDotenv(root, "dev", "TIER=free");
    appendToDotenv(root, "production", "TIER=paid");

    mockSpawnSync.mockClear();
    mockSpawn.mockClear();
    await runProgram(["run", "dev"], { cwd: root });
    expect(samArgs()).toMatch(/ParameterKey=EnvTier,ParameterValue="free"/);

    mockSpawnSync.mockClear();
    mockSpawn.mockClear();
    await runProgram(["run", "production"], { cwd: root });
    expect(samArgs()).toMatch(/ParameterKey=EnvTier,ParameterValue="paid"/);
    removeDir(dir);
  });

  it("still deploys a stage that does not set a variable another stage does", async () => {
    const { dir, root } = await project("slskit-dyn-partial-");
    await runProgram(
      ["env", "add", "production", "--profile", "p", "--region", "eu-west-2", "--skip-verify"],
      { cwd: root }
    );
    appendToDotenv(root, "dev", "DEV_ONLY=yes");

    mockSpawnSync.mockClear();
    mockSpawn.mockClear();
    const result = await runProgram(["run", "production"], { cwd: root });

    expect(result.status).toBe(0);
    // Declared in the template so production can use it, simply not overridden.
    expect(fs.readFileSync(path.join(root, "template.yaml"), "utf8")).toMatch(
      /EnvDevOnly:/
    );
    expect(samArgs()).not.toMatch(/ParameterKey=EnvDevOnly/);
    removeDir(dir);
  });

  it("shows up in slskit env vars", async () => {
    const { dir, root } = await project("slskit-dyn-vars-");
    appendToDotenv(root, "dev", "SOME_API_KEY=abc123");

    cliLogs.infos.length = 0;
    await runProgram(["env", "vars", "--show-secrets"], { cwd: root });

    expect(cliLogs.infos.join("\n")).toMatch(/SOME_API_KEY=abc123/);
    removeDir(dir);
  });
});
