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

let originalExit: typeof process.exit;

beforeAll(() => {
  originalExit = process.exit;
  process.exit = ((code?: number) => {
    process.exitCode = code ?? 0;
  }) as typeof process.exit;
});

afterAll(() => {
  process.exit = originalExit;
});

import fs from "node:fs";
import { createProgram } from "../../src/program";
import {
  BASE_INIT_FLAGS,
  createTempDir,
  listFiles,
  removeDir,
  runProgram,
} from "../helpers/cli";

function stderrText(result: { stderr: string }): string {
  return `${result.stderr}${cliLogs.errors.join("\n")}`;
}

describe("slskit CLI program", () => {
  beforeEach(() => {
    cliLogs.errors.length = 0;
    cliLogs.infos.length = 0;
  });

  it("prints help when invoked with no arguments", async () => {
    const result = await runProgram([]);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/Usage: slskit/);
    expect(result.stdout).toMatch(/init/);
  });

  it("prints help with --help", async () => {
    const result = await runProgram(["--help"]);
    expect(result.stdout).toMatch(/Scaffold and incrementally grow/);
    expect(result.stdout).toMatch(/init/);
  });

  it("prints help with help command", async () => {
    const result = await runProgram(["help"]);
    expect(result.stdout).toMatch(/Commands:/);
  });

  it("prints the published version with --version", async () => {
    // Read from package.json rather than hardcoded, so a release bump cannot make
    // this test fail -- and so it actually catches the two drifting apart.
    const { version } = require("../../package.json") as { version: string };
    const result = await runProgram(["--version"]);

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(version);
  });

  it("prints init help with help init", async () => {
    const program = createProgram();
    const init = program.commands.find((command) => command.name() === "init");
    const help = init?.helpInformation() ?? "";

    expect(help).toMatch(/Scaffold a multi-service AWS SAM project/);
    expect(help).toMatch(/--runtime/);
    expect(help).toMatch(/--memory/);
  });

  it("prints init help with init --help", async () => {
    const program = createProgram();
    const init = program.commands.find((command) => command.name() === "init");
    const help = init?.helpInformation() ?? "";

    expect(help).toMatch(/--api-gateway/);
    expect(help).toMatch(/--layer/);
  });

  it("errors on unknown command", async () => {
    const result = await runProgram(["unknown-command"]);
    expect(result.status).not.toBe(0);
    expect(stderrText(result)).toMatch(/unknown command|error/i);
  });
});

describe("slskit init command", () => {
  beforeEach(() => {
    cliLogs.errors.length = 0;
    cliLogs.infos.length = 0;
  });

  it("requires all flags in non-interactive mode", async () => {
    const dir = createTempDir("slskit-cli-missing-");
    const result = await runProgram(["init", "only-name"], { cwd: dir });
    expect(result.status).not.toBe(0);
    expect(stderrText(result)).toMatch(/Non-interactive init needs/);
    removeDir(dir);
  });

  it("scaffolds a project with all required flags", async () => {
    const dir = createTempDir("slskit-cli-init-");
    const result = await runProgram(["init", "demo-app", ...BASE_INIT_FLAGS], { cwd: dir });

    expect(result.status).toBe(0);
    const files = listFiles(`${dir}/demo-app`);
    expect(files).toContain("slskit.json");
    expect(files).toContain("template.yaml");
    expect(files).toContain("src/services/product/getProducts.js");
    removeDir(dir);
  });

  it("accepts runtime and database aliases", async () => {
    const dir = createTempDir("slskit-cli-alias-");
    const result = await runProgram(
      [
        "init",
        "alias-app",
        "--runtime",
        "ts",
        "--database",
        "mongo",
        "--api-gateway",
        "yes",
        "--shared-api",
        "no",
        "--layer",
        "yes",
        "--memory",
        "512",
      ],
      { cwd: dir }
    );

    expect(result.status).toBe(0);
    const files = listFiles(`${dir}/alias-app`);
    expect(files).toContain("template.yaml");
    expect(files).toContain("templates/auth.yaml");
    expect(files.filter((file) => file.endsWith(".yml"))).toEqual([]);
    removeDir(dir);
  });

  it("rejects invalid runtime", async () => {
    const dir = createTempDir("slskit-cli-bad-runtime-");
    const result = await runProgram(
      ["init", "bad-app", "--runtime", "ruby", ...BASE_INIT_FLAGS.slice(2)],
      { cwd: dir }
    );
    expect(result.status).not.toBe(0);
    expect(stderrText(result)).toMatch(/Unknown runtime/);
    removeDir(dir);
  });

  it("rejects invalid memory size", async () => {
    const dir = createTempDir("slskit-cli-bad-memory-");
    const result = await runProgram(
      [
        "init",
        "bad-app",
        "--runtime",
        "javascript",
        "--database",
        "none",
        "--api-gateway",
        "no",
        "--layer",
        "no",
        "--memory",
        "999",
      ],
      { cwd: dir }
    );
    expect(result.status).not.toBe(0);
    expect(stderrText(result)).toMatch(/Unknown memory size/);
    removeDir(dir);
  });

  it("rejects invalid api-gateway value", async () => {
    const dir = createTempDir("slskit-cli-bad-gateway-");
    const result = await runProgram(
      [
        "init",
        "bad-app",
        "--runtime",
        "javascript",
        "--database",
        "none",
        "--api-gateway",
        "maybe",
        "--layer",
        "no",
        "--memory",
        "256",
      ],
      { cwd: dir }
    );
    expect(result.status).not.toBe(0);
    expect(stderrText(result)).toMatch(/must be yes or no/);
    removeDir(dir);
  });

  it("fails when target directory is not empty", async () => {
    const dir = createTempDir("slskit-cli-nonempty-");
    fs.mkdirSync(`${dir}/existing`, { recursive: true });
    fs.writeFileSync(`${dir}/existing/readme.txt`, "keep");

    const result = await runProgram(["init", "existing", ...BASE_INIT_FLAGS], { cwd: dir });
    expect(result.status).not.toBe(0);
    expect(stderrText(result)).toMatch(/Directory already exists/);
    removeDir(dir);
  });

  it("overwrites generated files with --force", async () => {
    const dir = createTempDir("slskit-cli-force-");
    fs.mkdirSync(`${dir}/forced`, { recursive: true });
    fs.writeFileSync(`${dir}/forced/old.txt`, "old");

    const result = await runProgram(["init", "forced", ...BASE_INIT_FLAGS, "--force"], {
      cwd: dir,
    });
    expect(result.status).toBe(0);
    expect(fs.existsSync(`${dir}/forced/slskit.json`)).toBe(true);
    removeDir(dir);
  });

  it("writes memory size into generated templates", async () => {
    const dir = createTempDir("slskit-cli-memory-");
    const result = await runProgram(
      [
        "init",
        "mem-app",
        "--runtime",
        "javascript",
        "--database",
        "none",
        "--api-gateway",
        "no",
        "--layer",
        "no",
        "--memory",
        "1024",
      ],
      { cwd: dir }
    );

    expect(result.status).toBe(0);
    const template = fs.readFileSync(
      `${dir}/mem-app/templates/auth.yaml`,
      "utf8"
    );
    expect(template).toMatch(/MemorySize: 1024/);
    removeDir(dir);
  });

  it("gives each service its own HTTP API when api-gateway is yes", async () => {
    const dir = createTempDir("slskit-cli-gateway-");
    const result = await runProgram(
      [
        "init",
        "gw-app",
        "--runtime",
        "javascript",
        "--database",
        "none",
        "--api-gateway",
        "yes",
        "--shared-api",
        "no",
        "--layer",
        "no",
        "--memory",
        "256",
      ],
      { cwd: dir }
    );

    expect(result.status).toBe(0);
    expect(fs.existsSync(`${dir}/gw-app/gateway`)).toBe(false);

    const root = fs.readFileSync(`${dir}/gw-app/template.yaml`, "utf8");
    expect(root).toMatch(/Location: templates\/auth\.yaml/);

    const service = fs.readFileSync(
      `${dir}/gw-app/templates/auth.yaml`,
      "utf8"
    );
    expect(service).toMatch(/AWS::Serverless::HttpApi/);
    removeDir(dir);
  });

  it("generates complete slskit.json manifest", async () => {
    const dir = createTempDir("slskit-cli-manifest-");
    const result = await runProgram(
      [
        "init",
        "manifest-app",
        "--runtime",
        "javascript",
        "--database",
        "dynamodb",
        "--api-gateway",
        "yes",
        "--shared-api",
        "no",
        "--layer",
        "yes",
        "--memory",
        "512",
      ],
      { cwd: dir }
    );

    expect(result.status).toBe(0);
    const manifest = JSON.parse(
      fs.readFileSync(`${dir}/manifest-app/slskit.json`, "utf8")
    ) as {
      apiGateway: { enabled: boolean; routes: unknown[] };
      layer: { enabled: boolean };
      applications: unknown[];
    };

    expect(manifest.apiGateway.enabled).toBe(true);
    expect(manifest.apiGateway.routes).toHaveLength(4);
    expect(manifest.layer.enabled).toBe(true);
    expect(manifest.applications).toHaveLength(2);
    removeDir(dir);
  });
});
