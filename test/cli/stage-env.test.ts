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
import { readDotenv } from "../../src/commands/env/dotenv";
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

let root = "";
let dir = "";

function manifest(): any {
  return JSON.parse(fs.readFileSync(path.join(root, "sless.json"), "utf8"));
}
function template(relative: string): string {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

async function cli(...args: string[]) {
  return runProgram(args, { cwd: root });
}

describe("slskit stage and env commands", () => {
  beforeEach(async () => {
    cliLogs.errors.length = 0;
    cliLogs.infos.length = 0;
    mockSpawnSync.mockReset();
    mockSpawnSync.mockReturnValue({ error: null, status: 0, stdout: "" });

    savedEnv = {};
    for (const key of AWS_ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    process.env.AWS_CONFIG_FILE = path.join(createTempDir("slskit-se-aws-"), "config");

    dir = createTempDir("slskit-stage-env-");
    root = await scaffoldProject({ ...minimalAnswers, name: "demo" }, dir);
    await cli("configure", "--profile", "work", "--region", "us-east-1", "--skip-verify");
    cliLogs.infos.length = 0;
  });

  afterEach(() => {
    for (const key of AWS_ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
    removeDir(dir);
  });

  // ---------- stage ----------

  it("lists stages and marks the default", async () => {
    await cli("stage", "list");
    expect(infoText()).toMatch(/\* dev/);
    expect(infoText()).toMatch(/demo-dev/);
  });

  it("adds a second stage with its own target", async () => {
    const result = await cli(
      "stage", "add", "production",
      "--profile", "prod-admin", "--region", "eu-west-2", "--skip-verify"
    );

    expect(result.status).toBe(0);
    expect(manifest().deployment.stages.production).toEqual({
      region: "eu-west-2",
      profile: "prod-admin",
      stackName: "demo-production",
    });
    // adding a stage must not steal the default
    expect(manifest().deployment.defaultStage).toBe("dev");
  });

  it("refuses to add a stage that already exists", async () => {
    const result = await cli("stage", "add", "dev", "--profile", "w", "--region", "us-east-1", "--skip-verify");
    expect(result.status).not.toBe(0);
    expect(errorText()).toMatch(/already exists/);
  });

  it("switches the default stage with stage use", async () => {
    await cli("stage", "add", "production", "--profile", "p", "--region", "eu-west-2", "--skip-verify");
    await cli("stage", "use", "production");
    expect(manifest().deployment.defaultStage).toBe("production");
  });

  it("rejects stage use for an unknown stage", async () => {
    const result = await cli("stage", "use", "nope");
    expect(result.status).not.toBe(0);
    expect(errorText()).toMatch(/Stage "nope" was not found/);
  });

  it("needs --yes to remove a stage non-interactively", async () => {
    await cli("stage", "add", "production", "--profile", "p", "--region", "eu-west-2", "--skip-verify");
    const result = await cli("stage", "remove", "production");
    expect(result.status).not.toBe(0);
    expect(errorText()).toMatch(/--yes/);
    expect(manifest().deployment.stages.production).toBeDefined();
  });

  it("removes a stage and reassigns the default", async () => {
    await cli("stage", "add", "production", "--profile", "p", "--region", "eu-west-2", "--skip-verify");
    await cli("stage", "use", "production");
    await cli("stage", "remove", "production", "--yes");

    expect(manifest().deployment.stages.production).toBeUndefined();
    expect(manifest().deployment.defaultStage).toBe("dev");
  });

  // ---------- env ----------

  it("sets an inline value and wires it into every template", async () => {
    const result = await cli("env", "set", "LOG_LEVEL=debug");

    expect(result.status).toBe(0);
    expect(manifest().deployment.stages.dev.env).toEqual({
      LOG_LEVEL: { value: "debug" },
    });

    for (const file of [
      "template.yaml",
      "src/functions/auth/template.yaml",
      "src/functions/product/template.yaml",
    ]) {
      expect(template(file)).toMatch(/EnvLogLevel/);
    }
    expect(template("src/functions/auth/template.yaml")).toMatch(
      /LOG_LEVEL: !Ref EnvLogLevel/
    );
  });

  it("passes stage parameters down to each nested stack", async () => {
    await cli("env", "set", "LOG_LEVEL=debug");
    expect(template("template.yaml")).toMatch(/EnvLogLevel: !Ref EnvLogLevel/);
  });

  it("keeps a secret out of sless.json and in a gitignored .env file", async () => {
    await cli("env", "set", "DATABASE_URL=postgres://secret/db", "--secret");

    expect(manifest().deployment.stages.dev.env.DATABASE_URL).toEqual({ secret: true });
    expect(fs.readFileSync(path.join(root, "sless.json"), "utf8")).not.toMatch(
      /postgres:\/\/secret\/db/
    );
    expect(readDotenv(root, "dev")).toEqual({ DATABASE_URL: "postgres://secret/db" });
    expect(fs.readFileSync(path.join(root, ".gitignore"), "utf8")).toMatch(/\.env\.\*/);
  });

  it("records an ssm reference without touching .env", async () => {
    await cli("env", "set", "API_KEY", "--ssm", "/demo/dev/api-key");

    expect(manifest().deployment.stages.dev.env.API_KEY).toEqual({
      ssm: "/demo/dev/api-key",
    });
    expect(readDotenv(root, "dev")).toEqual({});
  });

  it("declares the union of variables across stages so one template serves both", async () => {
    await cli("env", "set", "LOG_LEVEL=debug");
    await cli("stage", "add", "production", "--profile", "p", "--region", "eu-west-2", "--skip-verify");
    await cli("env", "set", "SENTRY_DSN=https://x", "--stage", "production");

    const auth = template("src/functions/auth/template.yaml");
    expect(auth).toMatch(/EnvLogLevel/);
    expect(auth).toMatch(/EnvSentryDsn/);
    // a stage that does not set a variable still deploys: the parameter defaults to ""
    expect(auth).toMatch(/Default: ""/);
  });

  it("masks secrets in env list unless --show-secrets is passed", async () => {
    await cli("env", "set", "DATABASE_URL=postgres://secret/db", "--secret");

    cliLogs.infos.length = 0;
    await cli("env", "list");
    expect(infoText()).toMatch(/\*{8}/);
    expect(infoText()).not.toMatch(/postgres:\/\/secret\/db/);

    cliLogs.infos.length = 0;
    await cli("env", "list", "--show-secrets");
    expect(infoText()).toMatch(/postgres:\/\/secret\/db/);
  });

  it("rejects two keys that collapse to the same CloudFormation parameter", async () => {
    await cli("env", "set", "LOG_LEVEL=debug");
    const result = await cli("env", "set", "LOG__LEVEL=other");

    expect(result.status).not.toBe(0);
    expect(errorText()).toMatch(/both map to the CloudFormation parameter EnvLogLevel/);
  });

  it("rejects an invalid variable name", async () => {
    const result = await cli("env", "set", "9BAD=x");
    expect(result.status).not.toBe(0);
    expect(errorText()).toMatch(/Invalid variable name/);
  });

  it("requires a value unless --secret or --ssm is used", async () => {
    const result = await cli("env", "set", "LOG_LEVEL");
    expect(result.status).not.toBe(0);
    expect(errorText()).toMatch(/Pass a value/);
  });

  it("rejects --secret together with --ssm", async () => {
    const result = await cli("env", "set", "X=1", "--secret", "--ssm", "/a/b");
    expect(result.status).not.toBe(0);
    expect(errorText()).toMatch(/not both/);
  });

  it("unsets a variable and strips it from the templates", async () => {
    await cli("env", "set", "LOG_LEVEL=debug");
    await cli("env", "set", "DATABASE_URL=postgres://secret/db", "--secret");

    await cli("env", "unset", "DATABASE_URL");

    expect(manifest().deployment.stages.dev.env).toEqual({
      LOG_LEVEL: { value: "debug" },
    });
    expect(readDotenv(root, "dev")).toEqual({});
    expect(template("src/functions/auth/template.yaml")).not.toMatch(/EnvDatabaseUrl/);
  });

  it("errors when unsetting a variable the stage does not have", async () => {
    const result = await cli("env", "unset", "NOPE");
    expect(result.status).not.toBe(0);
    expect(errorText()).toMatch(/no variable named "NOPE"/);
  });

  it("targets the default stage when --stage is omitted", async () => {
    await cli("stage", "add", "production", "--profile", "p", "--region", "eu-west-2", "--skip-verify");
    await cli("stage", "use", "production");
    await cli("env", "set", "ONLY_PROD=1");

    expect(manifest().deployment.stages.production.env).toEqual({
      ONLY_PROD: { value: "1" },
    });
    expect(manifest().deployment.stages.dev.env).toBeUndefined();
  });

  it("keeps stage variables when configure is re-run for that stage", async () => {
    await cli("env", "set", "LOG_LEVEL=debug");
    await cli("configure", "--profile", "other", "--region", "eu-west-1", "--skip-verify");

    expect(manifest().deployment.stages.dev.profile).toBe("other");
    expect(manifest().deployment.stages.dev.env).toEqual({
      LOG_LEVEL: { value: "debug" },
    });
  });
});
