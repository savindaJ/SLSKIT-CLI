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

const AWS_ENV_KEYS = [
  "AWS_PROFILE",
  "AWS_REGION",
  "AWS_DEFAULT_REGION",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "AWS_CONFIG_FILE",
];

let savedEnv: Record<string, string | undefined> = {};

const infoText = (): string => cliLogs.infos.join("\n");
const errorText = (): string => cliLogs.errors.join("\n");

function samCalls(): string[] {
  return mockSpawnSync.mock.calls
    .filter(([cmd]) => cmd === "sam")
    .map(([, args]) => (args as string[]).join(" "));
}

function identity(): string {
  return JSON.stringify({
    Account: "123456789012",
    Arn: "arn:aws:iam::123456789012:user/dev",
  });
}

function mockAws(options: { identityOk?: boolean; outputs?: unknown } = {}): void {
  const { identityOk = true, outputs = [] } = options;

  mockSpawnSync.mockImplementation((cmd: string, args: string[]) => {
    if (cmd === "aws") {
      if (args[0] === "sts") {
        return identityOk
          ? { error: null, status: 0, stdout: identity() }
          : { error: null, status: 255, stderr: "ExpiredToken" };
      }
      if (args[0] === "cloudformation") {
        return { error: null, status: 0, stdout: JSON.stringify(outputs) };
      }
      return { error: null, status: 0, stdout: "" };
    }
    return { error: null, status: 0, stdout: "" };
  });
}

async function project(prefix: string): Promise<{ dir: string; root: string }> {
  const dir = createTempDir(prefix);
  const root = await scaffoldProject({ ...minimalAnswers, name: "shop" }, dir);
  return { dir, root };
}

async function configureDev(root: string): Promise<void> {
  await runProgram(
    ["configure", "--profile", "work", "--region", "us-east-1", "--skip-verify"],
    { cwd: root }
  );
}

describe("slskit deploy command", () => {
  beforeEach(() => {
    cliLogs.errors.length = 0;
    cliLogs.infos.length = 0;
    mockSpawnSync.mockReset();
    mockAws();

    savedEnv = {};
    for (const key of AWS_ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    process.env.AWS_CONFIG_FILE = path.join(createTempDir("slskit-dep-aws-"), "config");
  });

  afterEach(() => {
    for (const key of AWS_ENV_KEYS) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
  });

  it("refuses to deploy an environment with no region configured", async () => {
    const { dir, root } = await project("slskit-dep-noregion-");
    const result = await runProgram(["deploy", "--yes"], { cwd: root });

    expect(result.status).not.toBe(0);
    expect(errorText()).toMatch(/has no AWS region yet/);
    expect(samCalls().join("\n")).not.toMatch(/deploy/);
    removeDir(dir);
  });

  it("refuses an environment that does not exist", async () => {
    const { dir, root } = await project("slskit-dep-missing-");
    const result = await runProgram(["deploy", "production", "--yes"], { cwd: root });

    expect(result.status).not.toBe(0);
    expect(errorText()).toMatch(/Environment "production" was not found/);
    removeDir(dir);
  });

  it("needs --yes to deploy non-interactively", async () => {
    const { dir, root } = await project("slskit-dep-confirm-");
    await configureDev(root);
    mockSpawnSync.mockClear();

    const result = await runProgram(["deploy"], { cwd: root });

    expect(result.status).not.toBe(0);
    expect(errorText()).toMatch(/Re-run with --yes/);
    expect(samCalls().join("\n")).not.toMatch(/deploy/);
    removeDir(dir);
  });

  it("will not deploy when the credentials do not verify", async () => {
    const { dir, root } = await project("slskit-dep-badcreds-");
    await configureDev(root);
    mockAws({ identityOk: false });
    mockSpawnSync.mockClear();

    const result = await runProgram(["deploy", "--yes"], { cwd: root });

    expect(result.status).not.toBe(0);
    expect(errorText()).toMatch(/Could not verify AWS credentials/);
    expect(errorText()).toMatch(/--set-credentials/);
    expect(samCalls().join("\n")).not.toMatch(/deploy/);
    removeDir(dir);
  });

  it("deploys with the environment's stack, region and profile", async () => {
    const { dir, root } = await project("slskit-dep-ok-");
    await configureDev(root);
    mockSpawnSync.mockClear();

    const result = await runProgram(["deploy", "--yes"], { cwd: root });

    expect(result.status).toBe(0);
    const deploy = samCalls().find((call) => call.startsWith("deploy"))!;
    expect(deploy).toMatch(/--stack-name shop-dev/);
    expect(deploy).toMatch(/--region us-east-1/);
    expect(deploy).toMatch(/--profile work/);
    expect(deploy).toMatch(/AppEnvironment=dev/);
    removeDir(dir);
  });

  it("grants CAPABILITY_AUTO_EXPAND so the nested stacks can expand", async () => {
    const { dir, root } = await project("slskit-dep-caps-");
    await configureDev(root);
    mockSpawnSync.mockClear();

    await runProgram(["deploy", "--yes"], { cwd: root });

    const deploy = samCalls().find((call) => call.startsWith("deploy"))!;
    expect(deploy).toMatch(/CAPABILITY_IAM/);
    expect(deploy).toMatch(/CAPABILITY_AUTO_EXPAND/);
    removeDir(dir);
  });

  it("deploys the environment named as a positional argument", async () => {
    const { dir, root } = await project("slskit-dep-positional-");
    await runProgram(
      ["env", "add", "production", "--profile", "prod", "--region", "eu-west-2", "--skip-verify"],
      { cwd: root }
    );
    mockSpawnSync.mockClear();

    await runProgram(["deploy", "production", "--yes"], { cwd: root });

    const deploy = samCalls().find((call) => call.startsWith("deploy"))!;
    expect(deploy).toMatch(/--stack-name shop-production/);
    expect(deploy).toMatch(/--region eu-west-2/);
    expect(deploy).toMatch(/AppEnvironment=production/);
    removeDir(dir);
  });

  it("carries the environment's variables into the deploy", async () => {
    const { dir, root } = await project("slskit-dep-vars-");
    await configureDev(root);
    await runProgram(["env", "set", "LOG_LEVEL=warn"], { cwd: root });
    mockSpawnSync.mockClear();

    await runProgram(["deploy", "--yes"], { cwd: root });

    expect(samCalls().find((call) => call.startsWith("deploy"))!).toMatch(
      /EnvLogLevel=warn/
    );
    removeDir(dir);
  });

  it("stops before deploying when a declared secret is missing", async () => {
    const { dir, root } = await project("slskit-dep-secret-");
    await configureDev(root);
    await runProgram(["env", "set", "API_KEY=temp", "--secret"], { cwd: root });
    fs.writeFileSync(path.join(root, ".env.dev"), "APP_ENVIRONMENT=dev\n");
    mockSpawnSync.mockClear();

    const result = await runProgram(["deploy", "--yes"], { cwd: root });

    expect(result.status).not.toBe(0);
    expect(errorText()).toMatch(/marked secret .* but is missing/);
    expect(samCalls().join("\n")).not.toMatch(/deploy/);
    removeDir(dir);
  });

  it("never prints override values, only how many there are", async () => {
    const { dir, root } = await project("slskit-dep-mask-");
    await configureDev(root);
    await runProgram(["env", "set", "API_KEY=sk-live-secret", "--secret"], { cwd: root });
    mockSpawnSync.mockClear();
    cliLogs.infos.length = 0;

    await runProgram(["deploy", "--yes"], { cwd: root });

    expect(infoText()).not.toMatch(/sk-live-secret/);
    expect(infoText()).toMatch(/--parameter-overrides \(2 values\)/);
    removeDir(dir);
  });

  it("skips sam build with --no-build", async () => {
    const { dir, root } = await project("slskit-dep-nobuild-");
    await configureDev(root);
    mockSpawnSync.mockClear();

    await runProgram(["deploy", "--yes", "--no-build"], { cwd: root });

    expect(samCalls()).not.toContain("build");
    expect(samCalls().some((call) => call.startsWith("deploy"))).toBe(true);
    removeDir(dir);
  });

  it("reports the stack outputs after deploying", async () => {
    const { dir, root } = await project("slskit-dep-outputs-");
    await configureDev(root);
    mockAws({
      outputs: [
        {
          OutputKey: "AuthApiUrl",
          OutputValue: "https://abc.execute-api.us-east-1.amazonaws.com",
        },
      ],
    });
    mockSpawnSync.mockClear();
    cliLogs.infos.length = 0;

    await runProgram(["deploy", "--yes"], { cwd: root });

    expect(infoText()).toMatch(/AuthApiUrl/);
    expect(infoText()).toMatch(/execute-api\.us-east-1/);
    removeDir(dir);
  });
});
