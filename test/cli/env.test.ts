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
import { fullStackAnswers } from "../helpers/fixtures";
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

function manifestOf(root: string): Record<string, any> {
  return JSON.parse(fs.readFileSync(path.join(root, "sless.json"), "utf8"));
}

function read(root: string, file: string): string {
  return fs.readFileSync(path.join(root, file), "utf8");
}

async function scaffold(prefix: string): Promise<{ dir: string; root: string }> {
  const dir = createTempDir(prefix);
  const root = await scaffoldProject({ ...fullStackAnswers, name: "shop" }, dir);
  return { dir, root };
}

async function addProduction(root: string): Promise<void> {
  await runProgram(
    ["env", "add", "production", "--profile", "prod", "--region", "eu-west-2", "--skip-verify"],
    { cwd: root }
  );
}

describe("slskit env command", () => {
  beforeEach(() => {
    cliLogs.errors.length = 0;
    cliLogs.infos.length = 0;
    mockSpawnSync.mockReset();
    mockSpawnSync.mockReturnValue({ error: null, status: 0, stdout: "" });

    savedEnv = {};
    for (const key of AWS_ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    process.env.AWS_CONFIG_FILE = path.join(createTempDir("slskit-env-aws-"), "config");
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

  it("starts with a dev environment created by init", async () => {
    const { dir, root } = await scaffold("slskit-env-init-");

    expect(manifestOf(root).environments).toEqual({
      default: "dev",
      list: { dev: { stackName: "shop-dev" } },
    });
    expect(read(root, ".env.dev")).toMatch(/^APP_ENVIRONMENT=dev$/m);

    const result = await runProgram(["env", "list"], { cwd: root });
    expect(result.status).toBe(0);
    expect(infoText()).toMatch(/\* dev/);
    expect(infoText()).toMatch(/APP_ENVIRONMENT: dev/);
    removeDir(dir);
  });

  it("adds an environment with its own stack and dotenv", async () => {
    const { dir, root } = await scaffold("slskit-env-add-");
    await addProduction(root);

    expect(manifestOf(root).environments.list.production).toEqual({
      region: "eu-west-2",
      profile: "prod",
      stackName: "shop-production",
    });
    expect(read(root, ".env.production")).toMatch(/^APP_ENVIRONMENT=production$/m);
    removeDir(dir);
  });

  it("refuses to add an environment that already exists", async () => {
    const { dir, root } = await scaffold("slskit-env-dupe-");
    const result = await runProgram(
      ["env", "add", "dev", "--profile", "p", "--region", "us-east-1", "--skip-verify"],
      { cwd: root }
    );

    expect(result.status).not.toBe(0);
    expect(errorText()).toMatch(/already exists/);
    removeDir(dir);
  });

  it("rejects an environment name AWS would not accept", async () => {
    const { dir, root } = await scaffold("slskit-env-badname-");
    const result = await runProgram(
      ["env", "add", "My_Env", "--profile", "p", "--region", "us-east-1", "--skip-verify"],
      { cwd: root }
    );

    expect(result.status).not.toBe(0);
    expect(errorText()).toMatch(/Invalid environment name/);
    removeDir(dir);
  });

  it("rejects an environment that would overflow Lambda's name limit", async () => {
    const { dir, root } = await scaffold("slskit-env-toolong-");
    const result = await runProgram(
      [
        "env", "add", "a-very-long-environment-name-for-testing-limits",
        "--profile", "p", "--region", "us-east-1", "--skip-verify",
      ],
      { cwd: root }
    );

    expect(result.status).not.toBe(0);
    expect(errorText()).toMatch(/over the 64 character limit/);
    removeDir(dir);
  });

  it("stores a plain value in sless.json and adds a template parameter", async () => {
    const { dir, root } = await scaffold("slskit-env-set-");
    const result = await runProgram(["env", "set", "LOG_LEVEL=debug"], { cwd: root });

    expect(result.status).toBe(0);
    expect(manifestOf(root).environments.list.dev.variables).toEqual({
      LOG_LEVEL: { value: "debug" },
    });
    expect(read(root, "src/functions/auth/template.yaml")).toMatch(/EnvLogLevel:/);
    expect(read(root, "src/functions/auth/template.yaml")).toMatch(
      /LOG_LEVEL: !Ref EnvLogLevel/
    );
    removeDir(dir);
  });

  it("keeps a secret out of sless.json", async () => {
    const { dir, root } = await scaffold("slskit-env-secret-");
    const result = await runProgram(
      ["env", "set", "API_KEY=sk-live-abc", "--secret"],
      { cwd: root }
    );

    expect(result.status).toBe(0);
    expect(read(root, "sless.json")).not.toMatch(/sk-live-abc/);
    expect(read(root, ".env.dev")).toMatch(/API_KEY=sk-live-abc/);
    expect(manifestOf(root).environments.list.dev.variables).toEqual({
      API_KEY: { secret: true },
    });
    removeDir(dir);
  });

  it("records an SSM path without reading the value", async () => {
    const { dir, root } = await scaffold("slskit-env-ssm-");
    const result = await runProgram(
      ["env", "set", "DB_PASSWORD", "--ssm", "/shop/dev/db"],
      { cwd: root }
    );

    expect(result.status).toBe(0);
    expect(manifestOf(root).environments.list.dev.variables).toEqual({
      DB_PASSWORD: { ssm: "/shop/dev/db" },
    });
    removeDir(dir);
  });

  it("refuses --secret together with --ssm", async () => {
    const { dir, root } = await scaffold("slskit-env-both-");
    const result = await runProgram(
      ["env", "set", "X=1", "--secret", "--ssm", "/a/b"],
      { cwd: root }
    );

    expect(result.status).not.toBe(0);
    expect(errorText()).toMatch(/not both/);
    removeDir(dir);
  });

  it("refuses to let APP_ENVIRONMENT be set by hand", async () => {
    const { dir, root } = await scaffold("slskit-env-reserved-");
    const result = await runProgram(["env", "set", "APP_ENVIRONMENT=hacked"], {
      cwd: root,
    });

    expect(result.status).not.toBe(0);
    expect(errorText()).toMatch(/managed by slskit/);
    removeDir(dir);
  });

  it("targets another environment with --env", async () => {
    const { dir, root } = await scaffold("slskit-env-target-");
    await addProduction(root);
    await runProgram(["env", "set", "LOG_LEVEL=warn", "--env", "production"], {
      cwd: root,
    });

    const environments = manifestOf(root).environments.list;
    expect(environments.production.variables).toEqual({ LOG_LEVEL: { value: "warn" } });
    expect(environments.dev.variables).toBeUndefined();
    removeDir(dir);
  });

  it("masks secrets in env vars unless asked", async () => {
    const { dir, root } = await scaffold("slskit-env-vars-");
    await runProgram(["env", "set", "API_KEY=sk-live-abc", "--secret"], { cwd: root });

    cliLogs.infos.length = 0;
    await runProgram(["env", "vars"], { cwd: root });
    expect(infoText()).toMatch(/API_KEY=\*{8}/);
    expect(infoText()).not.toMatch(/sk-live-abc/);

    cliLogs.infos.length = 0;
    await runProgram(["env", "vars", "--show-secrets"], { cwd: root });
    expect(infoText()).toMatch(/sk-live-abc/);
    removeDir(dir);
  });

  it("removes a variable from the manifest and the dotenv file", async () => {
    const { dir, root } = await scaffold("slskit-env-unset-");
    await runProgram(["env", "set", "API_KEY=sk-live-abc", "--secret"], { cwd: root });
    const result = await runProgram(["env", "unset", "API_KEY"], { cwd: root });

    expect(result.status).toBe(0);
    expect(manifestOf(root).environments.list.dev.variables).toEqual({});
    expect(read(root, ".env.dev")).not.toMatch(/API_KEY/);
    removeDir(dir);
  });

  it("switches the default environment", async () => {
    const { dir, root } = await scaffold("slskit-env-use-");
    await addProduction(root);
    const result = await runProgram(["env", "use", "production"], { cwd: root });

    expect(result.status).toBe(0);
    expect(manifestOf(root).environments.default).toBe("production");
    removeDir(dir);
  });

  it("will not switch to an environment that does not exist", async () => {
    const { dir, root } = await scaffold("slskit-env-usemissing-");
    const result = await runProgram(["env", "use", "staging"], { cwd: root });

    expect(result.status).not.toBe(0);
    expect(errorText()).toMatch(/was not found/);
    removeDir(dir);
  });

  it("needs --yes to remove an environment non-interactively", async () => {
    const { dir, root } = await scaffold("slskit-env-rm-guard-");
    await addProduction(root);
    const result = await runProgram(["env", "remove", "production"], { cwd: root });

    expect(result.status).not.toBe(0);
    expect(errorText()).toMatch(/--yes/);
    expect(manifestOf(root).environments.list.production).toBeDefined();
    removeDir(dir);
  });

  it("removes an environment and hands the default back", async () => {
    const { dir, root } = await scaffold("slskit-env-rm-");
    await addProduction(root);
    await runProgram(["env", "use", "production"], { cwd: root });
    const result = await runProgram(["env", "remove", "production", "--yes"], {
      cwd: root,
    });

    expect(result.status).toBe(0);
    expect(manifestOf(root).environments.list.production).toBeUndefined();
    expect(manifestOf(root).environments.default).toBe("dev");
    removeDir(dir);
  });
});
