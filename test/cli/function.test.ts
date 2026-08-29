jest.mock("node:child_process", () => ({
  ...jest.requireActual("node:child_process"),
  spawnSync: jest.fn(() => ({ status: 0, error: null, stdout: "", stderr: "" })),
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
import { BASE_INIT_FLAGS, createTempDir, removeDir, runProgram } from "../helpers/cli";

function stderrText(result: { stderr: string }): string {
  return `${result.stderr}${cliLogs.errors.join("\n")}`;
}

function infoText(): string {
  return cliLogs.infos.join("\n");
}

describe("slskit function command", () => {
  let dir: string;
  let projectDir: string;

  beforeEach(async () => {
    cliLogs.errors.length = 0;
    cliLogs.infos.length = 0;
    dir = createTempDir("slskit-fn-cli-");
    projectDir = `${dir}/demo-app`;

    const init = await runProgram(
      [
        "init",
        "demo-app",
        "--runtime",
        "typescript",
        "--database",
        "dynamodb",
        "--api-gateway",
        "yes",
        "--shared-api",
        "no",
        "--layer",
        "yes",
        "--memory",
        "256",
      ],
      { cwd: dir }
    );
    expect(init.status).toBe(0);
  });

  afterEach(() => {
    removeDir(dir);
  });

  it("errors when slskit.json is missing", async () => {
    const emptyDir = createTempDir("slskit-fn-empty-");
    const result = await runProgram(["function", "foo", "--app", "auth", "--method", "GET", "--memory", "256", "--runtime", "javascript"], {
      cwd: emptyDir,
    });
    expect(result.status).not.toBe(0);
    expect(stderrText(result)).toMatch(/No slskit\.json found/);
    removeDir(emptyDir);
  });

  it("attaches a same-runtime function to an existing app", async () => {
    const result = await runProgram(
      [
        "function",
        "resetPassword",
        "--app",
        "auth",
        "--method",
        "POST",
        "--memory",
        "512",
        "--runtime",
        "typescript",
      ],
      { cwd: projectDir }
    );

    expect(result.status).toBe(0);
    expect(fs.existsSync(`${projectDir}/src/functions/auth/resetPassword/handler.ts`)).toBe(true);
    expect(fs.existsSync(`${projectDir}/src/services/auth/resetPassword.ts`)).toBe(true);

    const template = fs.readFileSync(`${projectDir}/templates/auth.yaml`, "utf8");
    expect(template).toMatch(/ResetPasswordFunction/);
    expect(template).toMatch(/MemorySize: 512/);

    const manifest = JSON.parse(fs.readFileSync(`${projectDir}/slskit.json`, "utf8")) as {
      applications: Array<{ name: string; functions: Array<{ name: string }> }>;
    };
    const auth = manifest.applications.find((app) => app.name === "auth");
    expect(auth?.functions.map((fn) => fn.name)).toContain("resetPassword");
  });

  it("creates a new application and updates the root SAM template", async () => {
    const result = await runProgram(
      [
        "function",
        "healthCheck",
        "--new-app",
        "ops",
        "--method",
        "GET",
        "--memory",
        "128",
        "--runtime",
        "python",
      ],
      { cwd: projectDir }
    );

    expect(result.status).toBe(0);
    expect(fs.existsSync(`${projectDir}/src/functions/ops/healthCheck/handler.py`)).toBe(true);

    const root = fs.readFileSync(`${projectDir}/template.yaml`, "utf8");
    expect(root).toMatch(/OpsStack/);

    expect(infoText()).toMatch(/standalone/);
  });

  // A duplicate used to be accepted silently: the second function replaced the first
  // in the template, and sam validate and sam build both reported success.
  it("rejects a function name already used by a different application", async () => {
    const add = (app: string) =>
      runProgram(
        ["function", "list", "--new-app", app, "--method", "GET",
         "--memory", "128", "--runtime", "typescript"],
        { cwd: projectDir }
      );

    expect((await add("category")).status).toBe(0);

    const second = await add("billing");

    expect(second.status).not.toBe(0);
    expect(stderrText(second)).toMatch(/already exists in application "category"/);

    const template = fs.readFileSync(`${projectDir}/templates/category.yaml`, "utf8");
    expect(template.match(/^ {2}ListFunction:$/gm) ?? []).toHaveLength(1);
    expect(fs.existsSync(`${projectDir}/src/functions/billing`)).toBe(false);
  });

  // Adding a function rebuilds slskit.json. It used to rebuild the environments too,
  // wiping every deploy target except dev -- their region, profile and variables.
  it("leaves the project's environments untouched", async () => {
    await runProgram(
      ["env", "add", "production", "--profile", "prod-admin", "--region", "eu-west-2",
       "--skip-verify"],
      { cwd: projectDir }
    );
    await runProgram(["env", "set", "LOG_LEVEL=debug", "--env", "production"], {
      cwd: projectDir,
    });

    const read = () =>
      JSON.parse(fs.readFileSync(`${projectDir}/slskit.json`, "utf8")) as {
        environments: { list: Record<string, unknown> };
      };
    const before = read().environments;

    const added = await runProgram(
      ["function", "report", "--new-app", "billing", "--method", "GET",
       "--memory", "128", "--runtime", "typescript"],
      { cwd: projectDir }
    );

    expect(added.status).toBe(0);
    expect(read().environments).toEqual(before);
    expect(Object.keys(read().environments.list)).toContain("production");
  });

  it("rejects a function name that already exists in the target app", async () => {
    const result = await runProgram(
      ["function", "login", "--app", "auth", "--method", "POST", "--memory", "256", "--runtime", "typescript"],
      { cwd: projectDir }
    );

    expect(result.status).not.toBe(0);
    expect(stderrText(result)).toMatch(/already exists/);
  });

  it("rejects an unknown application", async () => {
    const result = await runProgram(
      ["function", "foo", "--app", "missing", "--method", "GET", "--memory", "256", "--runtime", "javascript"],
      { cwd: projectDir }
    );

    expect(result.status).not.toBe(0);
    expect(stderrText(result)).toMatch(/was not found/);
  });

  it("rejects passing both --app and --new-app", async () => {
    const result = await runProgram(
      [
        "function",
        "foo",
        "--app",
        "auth",
        "--new-app",
        "ops",
        "--method",
        "GET",
        "--memory",
        "256",
        "--runtime",
        "javascript",
      ],
      { cwd: projectDir }
    );

    expect(result.status).not.toBe(0);
    expect(stderrText(result)).toMatch(/either "--app" or "--new-app"/);
  });

  it("adds tooling for a cross-family node function in a python project", async () => {
    const dir2 = createTempDir("slskit-fn-py-");
    const pyProject = `${dir2}/py-app`;
    const init = await runProgram(
      [
        "init",
        "py-app",
        "--runtime",
        "python",
        "--database",
        "none",
        "--api-gateway",
        "yes",
        "--shared-api",
        "no",
        "--layer",
        "no",
        "--memory",
        "128",
      ],
      { cwd: dir2 }
    );
    expect(init.status).toBe(0);

    const result = await runProgram(
      [
        "function",
        "webhook",
        "--new-app",
        "ingest",
        "--method",
        "POST",
        "--memory",
        "128",
        "--runtime",
        "typescript",
      ],
      { cwd: pyProject }
    );

    expect(result.status).toBe(0);
    const pkg = JSON.parse(fs.readFileSync(`${pyProject}/package.json`, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(pkg.dependencies?.esbuild ?? pkg.devDependencies?.esbuild).toBeDefined();
    expect(pkg.devDependencies?.typescript).toBeDefined();
    expect(fs.existsSync(`${pyProject}/tsconfig.json`)).toBe(true);

    removeDir(dir2);
  });
});
