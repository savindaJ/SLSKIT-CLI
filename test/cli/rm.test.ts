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
import path from "node:path";
import { createTempDir, removeDir, runProgram } from "../helpers/cli";

function stderrText(result: { stderr: string }): string {
  return `${result.stderr}${cliLogs.errors.join("\n")}`;
}

function infoText(): string {
  return cliLogs.infos.join("\n");
}

describe("slskit rm command", () => {
  let dir: string;
  let projectDir: string;

  function read(relative: string): string {
    return fs.readFileSync(path.join(projectDir, relative), "utf8");
  }

  function manifest(): {
    applications: { name: string; functions: { name: string }[] }[];
    services: { application: string }[];
    apiGateway: { routes?: { function: string }[]; templates?: string[] };
    framework: { files: { applications: string[] } };
    layer: { attachedTo?: string[]; templates?: string[] };
    structure: { files: string[]; directories: string[] };
    environments: { default: string; list: Record<string, unknown> };
  } {
    return JSON.parse(read("slskit.json"));
  }

  function exists(relative: string): boolean {
    return fs.existsSync(path.join(projectDir, relative));
  }

  beforeEach(async () => {
    cliLogs.errors.length = 0;
    cliLogs.infos.length = 0;
    dir = createTempDir("slskit-rm-cli-");
    projectDir = path.join(dir, "demo-app");

    const init = await runProgram(
      [
        "init",
        "demo-app",
        "--runtime",
        "typescript",
        "--database",
        "none",
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
    cliLogs.infos.length = 0;
  });

  afterEach(() => {
    removeDir(dir);
  });

  it("errors when slskit.json is missing", async () => {
    const emptyDir = createTempDir("slskit-rm-empty-");
    const result = await runProgram(["rm", "login", "--yes"], { cwd: emptyDir });

    expect(result.status).toBe(1);
    expect(stderrText(result)).toContain("slskit rm");
    removeDir(emptyDir);
  });

  it("removes a function by bare name and every reference to it", async () => {
    const result = await runProgram(["rm", "login", "--yes"], { cwd: projectDir });

    expect(result.status).toBe(0);
    expect(exists("src/functions/auth/login")).toBe(false);
    expect(exists("src/services/auth/login.ts")).toBe(false);
    // its application and siblings survive
    expect(exists("src/functions/auth/register")).toBe(true);
    expect(exists("templates/auth.yaml")).toBe(true);

    const after = manifest();
    expect(after.applications.find((app) => app.name === "auth")?.functions.map((fn) => fn.name)).toEqual([
      "register",
    ]);
    expect(after.apiGateway.routes?.some((route) => route.function === "auth.login")).toBe(false);
    expect(after.layer.attachedTo).not.toContain("auth.login");
    expect(after.structure.files.some((file) => file.includes("/login"))).toBe(false);
    expect(after.structure.directories).not.toContain("src/functions/auth/login");

    expect(read("templates/auth.yaml")).not.toContain("LoginFunction");
    expect(read("templates/auth.yaml")).toContain("RegisterFunction");
  });

  it("removes an application, its template and its nesting in the root stack", async () => {
    const result = await runProgram(["rm", "--service", "auth", "--yes"], { cwd: projectDir });

    expect(result.status).toBe(0);
    expect(exists("src/functions/auth")).toBe(false);
    expect(exists("src/services/auth")).toBe(false);
    expect(exists("templates/auth.yaml")).toBe(false);
    expect(exists("templates/product.yaml")).toBe(true);

    const after = manifest();
    expect(after.applications.map((app) => app.name)).toEqual(["product"]);
    expect(after.services.map((service) => service.application)).toEqual(["product"]);
    expect(after.framework.files.applications).toEqual(["templates/product.yaml"]);
    expect(after.apiGateway.templates).toEqual(["templates/product.yaml"]);
    expect(after.layer.templates).toEqual(["templates/product.yaml"]);

    const root = read("template.yaml");
    expect(root).not.toContain("AuthStack");
    expect(root).not.toContain("templates/auth.yaml");
    expect(root).toContain("ProductStack");
  });

  it("accepts --app as a synonym for --service", async () => {
    const result = await runProgram(["rm", "--app", "auth", "--yes"], { cwd: projectDir });

    expect(result.status).toBe(0);
    expect(manifest().applications.map((app) => app.name)).toEqual(["product"]);
  });

  it("removes the application when its last function goes", async () => {
    expect((await runProgram(["rm", "login", "--yes"], { cwd: projectDir })).status).toBe(0);
    const result = await runProgram(["rm", "register", "--yes"], { cwd: projectDir });

    expect(result.status).toBe(0);
    expect(infoText()).toContain("last function");
    expect(exists("src/functions/auth")).toBe(false);
    expect(exists("templates/auth.yaml")).toBe(false);
    expect(manifest().applications.map((app) => app.name)).toEqual(["product"]);
    expect(read("template.yaml")).not.toContain("AuthStack");
  });

  it("keeps environments and their variables through the rebuild", async () => {
    expect(
      (await runProgram(["env", "set", "LOG_LEVEL=debug"], { cwd: projectDir })).status
    ).toBe(0);

    const before = manifest().environments;
    expect((await runProgram(["rm", "login", "--yes"], { cwd: projectDir })).status).toBe(0);

    expect(manifest().environments).toEqual(before);
    expect(read("templates/auth.yaml")).toContain("EnvLogLevel");
  });

  it("refuses to leave the project with no functions", async () => {
    for (const name of ["login", "register", "getProducts"]) {
      expect((await runProgram(["rm", name, "--yes"], { cwd: projectDir })).status).toBe(0);
    }

    const result = await runProgram(["rm", "createProduct", "--yes"], { cwd: projectDir });

    expect(result.status).toBe(1);
    expect(stderrText(result)).toContain("cannot be deployed");
    expect(exists("src/functions/product/createProduct")).toBe(true);
  });

  it("needs --yes without a TTY, and changes nothing until it gets one", async () => {
    const result = await runProgram(["rm", "login"], { cwd: projectDir });

    expect(result.status).toBe(1);
    expect(stderrText(result)).toContain("--yes");
    expect(exists("src/functions/auth/login")).toBe(true);
  });

  it("names what exists when the target is unknown", async () => {
    const result = await runProgram(["rm", "nope", "--yes"], { cwd: projectDir });

    expect(result.status).toBe(1);
    expect(stderrText(result)).toContain("login");
    expect(stderrText(result)).toContain("auth");
  });

  it("rejects --function together with --service", async () => {
    const result = await runProgram(
      ["rm", "--function", "login", "--service", "auth", "--yes"],
      { cwd: projectDir }
    );

    expect(result.status).toBe(1);
    expect(stderrText(result)).toContain("not both");
  });

  it("is also reachable as slskit remove", async () => {
    const result = await runProgram(["remove", "login", "--yes"], { cwd: projectDir });

    expect(result.status).toBe(0);
    expect(exists("src/functions/auth/login")).toBe(false);
  });
});
