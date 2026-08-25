jest.mock("node:child_process", () => ({
  ...jest.requireActual("node:child_process"),
  spawnSync: jest.fn(() => ({ status: 0, error: null, stdout: "", stderr: "" })),
}));

import fs from "node:fs";
import path from "node:path";
import {
  ensureProjectRoot,
  resolveProjectRoot,
  scaffoldProject,
} from "../../src/commands/init/scaffold";
import { CliError } from "../../src/core/errors";
import { minimalAnswers } from "../helpers/fixtures";
import { createTempDir, listFiles, removeDir } from "../helpers/cli";

describe("resolveProjectRoot", () => {
  it("joins cwd and project name", () => {
    const { root, folderName } = resolveProjectRoot("/tmp/work", "my-app");
    expect(root).toBe(path.join("/tmp/work", "my-app"));
    expect(folderName).toBe("my-app");
  });

  it('uses cwd when name is "."', () => {
    const { root, folderName } = resolveProjectRoot("/tmp/work", ".");
    expect(root).toBe("/tmp/work");
    expect(folderName).toBe("work");
  });
});

describe("ensureProjectRoot", () => {
  it("creates a missing directory", () => {
    const dir = createTempDir("slskit-ensure-");
    const target = path.join(dir, "nested", "project");

    ensureProjectRoot(target, false);
    expect(fs.existsSync(target)).toBe(true);
    removeDir(dir);
  });

  it("allows empty existing directory", () => {
    const dir = createTempDir("slskit-empty-");
    expect(() => ensureProjectRoot(dir, false)).not.toThrow();
    removeDir(dir);
  });

  it("throws for non-empty directory without force", () => {
    const dir = createTempDir("slskit-nonempty-");
    fs.writeFileSync(path.join(dir, "existing.txt"), "data");

    expect(() => ensureProjectRoot(dir, false)).toThrow(CliError);
    expect(() => ensureProjectRoot(dir, false)).toThrow(/Directory already exists/);
    removeDir(dir);
  });

  it("allows non-empty directory with force", () => {
    const dir = createTempDir("slskit-force-");
    fs.writeFileSync(path.join(dir, "existing.txt"), "data");
    expect(() => ensureProjectRoot(dir, true)).not.toThrow();
    removeDir(dir);
  });
});

describe("scaffoldProject", () => {
  it("writes generated files for a SAM project", async () => {
    const dir = createTempDir("slskit-scaffold-");

    const root = await scaffoldProject({ ...minimalAnswers, name: "demo-app" }, dir);

    expect(root).toBe(path.join(dir, "demo-app"));
    const files = listFiles(root);
    expect(files).toContain("sless.json");
    expect(files).toContain("template.yaml");
    expect(files).toContain("src/services/auth/login.js");
    removeDir(dir);
  });

  it("supports init in current directory with name '.'", async () => {
    const dir = createTempDir("slskit-dot-");

    const root = await scaffoldProject({ ...minimalAnswers, name: "." }, dir);

    expect(root).toBe(dir);
    expect(fs.existsSync(path.join(dir, "sless.json"))).toBe(true);
    removeDir(dir);
  });
});

describe("writeFiles credential safety", () => {
  it("never overwrites an existing .env on --force", async () => {
    const dir = createTempDir("slskit-env-");
    const root = path.join(dir, "env-app");
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, ".env"), 'DATABASE_URL="postgresql://real:secret@prod/db"\n');

    await scaffoldProject(
      { ...minimalAnswers, name: "env-app", database: "prisma", runtime: "typescript", force: true },
      dir
    );

    expect(fs.readFileSync(path.join(root, ".env"), "utf8")).toMatch(/real:secret@prod/);
    expect(fs.readFileSync(path.join(root, ".env.example"), "utf8")).toMatch(/user:password/);
    removeDir(dir);
  });
});
