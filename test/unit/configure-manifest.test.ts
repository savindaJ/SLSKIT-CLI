import fs from "node:fs";
import path from "node:path";
import {
  readConfigurableManifest,
  writeStageConfig,
} from "../../src/commands/configure/manifest";
import { createTempDir, removeDir } from "../helpers/cli";

function writeManifest(dir: string, manifest: unknown): void {
  fs.writeFileSync(path.join(dir, "sless.json"), JSON.stringify(manifest, null, 2));
}

function readManifest(dir: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(dir, "sless.json"), "utf8"));
}

describe("readConfigurableManifest", () => {
  it("errors when sless.json is missing", () => {
    const dir = createTempDir("slskit-cfg-missing-");
    expect(() => readConfigurableManifest(dir)).toThrow(/No sless\.json found/);
    removeDir(dir);
  });

  it("errors on malformed JSON", () => {
    const dir = createTempDir("slskit-cfg-bad-json-");
    fs.writeFileSync(path.join(dir, "sless.json"), "{ not json");
    expect(() => readConfigurableManifest(dir)).toThrow(/not valid JSON/);
    removeDir(dir);
  });

  it("errors when the project name is missing", () => {
    const dir = createTempDir("slskit-cfg-noname-");
    writeManifest(dir, { version: "0.1.0" });
    expect(() => readConfigurableManifest(dir)).toThrow(/missing a project "name"/);
    removeDir(dir);
  });

  it("reads a valid manifest", () => {
    const dir = createTempDir("slskit-cfg-ok-");
    writeManifest(dir, { name: "demo", framework: { id: "sam" } });
    expect(readConfigurableManifest(dir).name).toBe("demo");
    removeDir(dir);
  });
});

describe("writeStageConfig", () => {
  it("adds a deployment block and makes the first stage the default", () => {
    const dir = createTempDir("slskit-cfg-write-");
    writeManifest(dir, { name: "demo", framework: { id: "sam" } });

    const manifest = readConfigurableManifest(dir);
    writeStageConfig(dir, manifest, "dev", {
      region: "us-east-1",
      profile: "work",
      stackName: "demo-dev",
    });

    expect(readManifest(dir).deployment).toEqual({
      defaultStage: "dev",
      stages: {
        dev: { region: "us-east-1", profile: "work", stackName: "demo-dev" },
      },
    });
    removeDir(dir);
  });

  it("preserves unrelated manifest keys", () => {
    const dir = createTempDir("slskit-cfg-preserve-");
    writeManifest(dir, {
      name: "demo",
      framework: { id: "sam" },
      applications: [{ name: "auth", functions: [] }],
      structure: { files: ["sless.json"] },
    });

    const manifest = readConfigurableManifest(dir);
    writeStageConfig(dir, manifest, "dev", {
      region: "us-east-1",
      stackName: "demo-dev",
    });

    const written = readManifest(dir);
    expect(written.applications).toEqual([{ name: "auth", functions: [] }]);
    expect(written.structure).toEqual({ files: ["sless.json"] });
    removeDir(dir);
  });

  it("adds a second stage without changing the default or the first stage", () => {
    const dir = createTempDir("slskit-cfg-second-");
    writeManifest(dir, {
      name: "demo",
      deployment: {
        defaultStage: "dev",
        stages: { dev: { region: "us-east-1", profile: "work", stackName: "demo-dev" } },
      },
    });

    const manifest = readConfigurableManifest(dir);
    writeStageConfig(dir, manifest, "prod", {
      region: "eu-west-1",
      profile: "prod-admin",
      stackName: "demo-prod",
    });

    expect(readManifest(dir).deployment).toEqual({
      defaultStage: "dev",
      stages: {
        dev: { region: "us-east-1", profile: "work", stackName: "demo-dev" },
        prod: { region: "eu-west-1", profile: "prod-admin", stackName: "demo-prod" },
      },
    });
    removeDir(dir);
  });

  it("overwrites a stage that was configured before", () => {
    const dir = createTempDir("slskit-cfg-overwrite-");
    writeManifest(dir, {
      name: "demo",
      deployment: {
        defaultStage: "dev",
        stages: { dev: { region: "us-east-1", profile: "old", stackName: "demo-dev" } },
      },
    });

    const manifest = readConfigurableManifest(dir);
    writeStageConfig(dir, manifest, "dev", {
      region: "ap-south-1",
      stackName: "demo-dev",
    });

    expect((readManifest(dir).deployment as Record<string, unknown>).stages).toEqual({
      dev: { region: "ap-south-1", stackName: "demo-dev" },
    });
    removeDir(dir);
  });

  it("ends the file with a trailing newline", () => {
    const dir = createTempDir("slskit-cfg-newline-");
    writeManifest(dir, { name: "demo" });

    const manifest = readConfigurableManifest(dir);
    writeStageConfig(dir, manifest, "dev", { region: "us-east-1", stackName: "demo-dev" });

    expect(fs.readFileSync(path.join(dir, "sless.json"), "utf8").endsWith("}\n")).toBe(true);
    removeDir(dir);
  });
});
