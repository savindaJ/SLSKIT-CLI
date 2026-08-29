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

function infoText(): string {
  return cliLogs.infos.join("\n");
}

function errorText(): string {
  return cliLogs.errors.join("\n");
}

function readManifest(root: string): Record<string, any> {
  return JSON.parse(fs.readFileSync(path.join(root, "slskit.json"), "utf8"));
}

// Dispatches on the aws subcommand so each test can describe the CLI's behaviour
// without caring how many times it is probed.
function mockAws(options: {
  available?: boolean;
  region?: string;
  identity?: { Account: string; Arn: string };
  identityError?: string;
}): void {
  const { available = true, region, identity, identityError } = options;

  mockSpawnSync.mockImplementation((_cmd: string, args: string[]) => {
    if (!available) {
      return { error: new Error("ENOENT"), status: null };
    }
    if (args[0] === "--version") {
      return { error: null, status: 0 };
    }
    if (args[0] === "configure") {
      return { error: null, status: 0, stdout: region ? `${region}\n` : "" };
    }
    if (args[0] === "sts") {
      if (identityError) {
        return { error: null, status: 255, stderr: identityError };
      }
      return { error: null, status: 0, stdout: JSON.stringify(identity ?? {}) };
    }
    return { error: null, status: 0, stdout: "" };
  });
}

async function scaffold(prefix: string): Promise<{ dir: string; root: string }> {
  const dir = createTempDir(prefix);
  const root = await scaffoldProject({ ...minimalAnswers, name: "demo-app" }, dir);
  return { dir, root };
}

describe("slskit configure command", () => {
  beforeEach(() => {
    cliLogs.errors.length = 0;
    cliLogs.infos.length = 0;
    mockSpawnSync.mockReset();

    savedEnv = {};
    for (const key of AWS_ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    // Point profile discovery at a directory that does not exist, so the machine's
    // real ~/.aws never leaks into the assertions.
    process.env.AWS_CONFIG_FILE = path.join(createTempDir("slskit-cfg-aws-"), "config");

    mockAws({ identity: { Account: "123456789012", Arn: "arn:aws:iam::123456789012:user/dev" } });
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

  it("errors when slskit.json is missing", async () => {
    const dir = createTempDir("slskit-cfg-cli-missing-");
    const result = await runProgram(["configure", "--profile", "work", "--region", "us-east-1"], {
      cwd: dir,
    });

    expect(result.status).not.toBe(0);
    expect(errorText()).toMatch(/No slskit\.json found/);
    removeDir(dir);
  });

  it("needs a profile or environment credentials in a non-interactive shell", async () => {
    const { dir, root } = await scaffold("slskit-cfg-cli-noprofile-");
    const result = await runProgram(["configure", "--region", "us-east-1"], { cwd: root });

    expect(result.status).not.toBe(0);
    expect(errorText()).toMatch(/needs "--profile <name>"/);
    removeDir(dir);
  });

  it("needs a region when nothing in the environment supplies one", async () => {
    const { dir, root } = await scaffold("slskit-cfg-cli-noregion-");
    const result = await runProgram(["configure", "--profile", "work"], { cwd: root });

    expect(result.status).not.toBe(0);
    expect(errorText()).toMatch(/needs "--region <region>"/);
    removeDir(dir);
  });

  it("rejects a malformed region", async () => {
    const { dir, root } = await scaffold("slskit-cfg-cli-badregion-");
    const result = await runProgram(
      ["configure", "--profile", "work", "--region", "useast1"],
      { cwd: root }
    );

    expect(result.status).not.toBe(0);
    expect(errorText()).toMatch(/Invalid AWS region/);
    removeDir(dir);
  });

  it("verifies credentials and writes the deployment block", async () => {
    const { dir, root } = await scaffold("slskit-cfg-cli-ok-");
    const result = await runProgram(
      ["configure", "--profile", "work", "--region", "us-east-1"],
      { cwd: root }
    );

    expect(result.status).toBe(0);
    expect(infoText()).toMatch(/Verified AWS credentials/);
    expect(infoText()).toMatch(/123456789012/);

    expect(readManifest(root).environments).toEqual({
      default: "dev",
      list: {
        dev: { region: "us-east-1", profile: "work", stackName: "demo-app-dev" },
      },
    });
    removeDir(dir);
  });

  it("fails without writing when the credentials do not work", async () => {
    const { dir, root } = await scaffold("slskit-cfg-cli-badcreds-");
    mockAws({ identityError: "ExpiredToken: The security token included in the request is expired" });

    const result = await runProgram(
      ["configure", "--profile", "work", "--region", "us-east-1"],
      { cwd: root }
    );

    expect(result.status).not.toBe(0);
    expect(errorText()).toMatch(/Could not verify AWS credentials/);
    expect(errorText()).toMatch(/ExpiredToken/);
    // init seeds "dev", so the guarantee is that a failed verify adds nothing to it.
    expect(readManifest(root).environments.list.dev).toEqual({
      stackName: "demo-app-dev",
    });
    removeDir(dir);
  });

  it("skips verification with --skip-verify", async () => {
    const { dir, root } = await scaffold("slskit-cfg-cli-skip-");
    mockAws({ identityError: "ExpiredToken" });

    const result = await runProgram(
      ["configure", "--profile", "work", "--region", "us-east-1", "--skip-verify"],
      { cwd: root }
    );

    expect(result.status).toBe(0);
    expect(infoText()).toMatch(/Skipped the credential check/);
    expect(readManifest(root).environments.list.dev.profile).toBe("work");
    removeDir(dir);
  });

  it("saves without a profile when credentials come from the environment", async () => {
    const { dir, root } = await scaffold("slskit-cfg-cli-env-");
    process.env.AWS_ACCESS_KEY_ID = "AKIAEXAMPLE";
    process.env.AWS_REGION = "eu-west-1";

    const result = await runProgram(["configure"], { cwd: root });

    expect(result.status).toBe(0);
    expect(infoText()).toMatch(/credentials: the environment/);
    expect(readManifest(root).environments.list.dev).toEqual({
      region: "eu-west-1",
      stackName: "demo-app-dev",
    });
    removeDir(dir);
  });

  it("configures a named environment with its own stack name", async () => {
    const { dir, root } = await scaffold("slskit-cfg-cli-env-name-");
    const result = await runProgram(
      ["configure", "--env", "production", "--profile", "prod-admin", "--region", "eu-west-2"],
      { cwd: root }
    );

    expect(result.status).toBe(0);
    expect(readManifest(root).environments.list.production).toEqual({
      region: "eu-west-2",
      profile: "prod-admin",
      stackName: "demo-app-production",
    });
    removeDir(dir);
  });

  it("still saves when the AWS CLI is not installed", async () => {
    const { dir, root } = await scaffold("slskit-cfg-cli-noaws-");
    mockAws({ available: false });

    const result = await runProgram(
      ["configure", "--profile", "work", "--region", "us-east-1"],
      { cwd: root }
    );

    expect(result.status).toBe(0);
    expect(infoText()).toMatch(/AWS CLI was not found/);
    expect(readManifest(root).environments.list.dev.region).toBe("us-east-1");
    removeDir(dir);
  });

  it("never writes credential material to the manifest", async () => {
    const { dir, root } = await scaffold("slskit-cfg-cli-secrets-");
    process.env.AWS_ACCESS_KEY_ID = "AKIASECRETVALUE";
    process.env.AWS_SECRET_ACCESS_KEY = "supersecret";
    process.env.AWS_REGION = "us-east-1";

    await runProgram(["configure"], { cwd: root });

    const raw = fs.readFileSync(path.join(root, "slskit.json"), "utf8");
    expect(raw).not.toMatch(/AKIASECRETVALUE/);
    expect(raw).not.toMatch(/supersecret/);
    removeDir(dir);
  });
});
