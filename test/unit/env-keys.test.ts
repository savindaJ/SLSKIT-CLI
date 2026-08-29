import fs from "node:fs";
import path from "node:path";
import {
  environmentEnvKeys,
  isVariableName,
  projectEnvKeys,
} from "../../src/commands/env/keys";
import type { ProjectManifest } from "../../src/core/environments";
import { createTempDir, removeDir } from "../helpers/cli";

function manifest(): ProjectManifest {
  return {
    name: "shop",
    environments: {
      default: "dev",
      list: {
        dev: { stackName: "shop-dev", variables: { LOG_LEVEL: { value: "debug" } } },
        production: { stackName: "shop-production", variables: { API_KEY: { secret: true } } },
      },
    },
  };
}

function writeEnvFile(dir: string, environment: string, body: string): void {
  fs.writeFileSync(path.join(dir, `.env.${environment}`), body);
}

describe("isVariableName", () => {
  it("accepts ordinary variable names", () => {
    expect(isVariableName("API_KEY")).toBe(true);
    expect(isVariableName("_private")).toBe(true);
  });

  it("rejects APP_ENVIRONMENT and anything unusable as a variable name", () => {
    expect(isVariableName("APP_ENVIRONMENT")).toBe(false);
    expect(isVariableName("1BAD")).toBe(false);
    expect(isVariableName("with-dash")).toBe(false);
    expect(isVariableName("")).toBe(false);
  });
});

describe("projectEnvKeys", () => {
  it("unions declared variables across every environment", () => {
    const dir = createTempDir("slskit-keys-declared-");

    expect(projectEnvKeys(dir, manifest())).toEqual(["API_KEY", "LOG_LEVEL"]);
    removeDir(dir);
  });

  it("picks up a key typed straight into a .env file", () => {
    const dir = createTempDir("slskit-keys-file-");
    writeEnvFile(dir, "dev", "APP_ENVIRONMENT=dev\nSOME_API_KEY=abc123\n");

    expect(projectEnvKeys(dir, manifest())).toEqual([
      "API_KEY",
      "LOG_LEVEL",
      "SOME_API_KEY",
    ]);
    removeDir(dir);
  });

  it("collects keys from every environment's file, not just the default", () => {
    const dir = createTempDir("slskit-keys-all-");
    writeEnvFile(dir, "dev", "DEV_ONLY=1\n");
    writeEnvFile(dir, "production", "PROD_ONLY=2\n");

    const keys = projectEnvKeys(dir, manifest());

    expect(keys).toContain("DEV_ONLY");
    expect(keys).toContain("PROD_ONLY");
    removeDir(dir);
  });

  it("never turns APP_ENVIRONMENT or a malformed line into a variable", () => {
    const dir = createTempDir("slskit-keys-skip-");
    writeEnvFile(dir, "dev", "APP_ENVIRONMENT=dev\nnot a variable\n9LIVES=cat\n");

    const keys = projectEnvKeys(dir, manifest());

    expect(keys).not.toContain("APP_ENVIRONMENT");
    expect(keys).not.toContain("9LIVES");
    removeDir(dir);
  });
});

describe("environmentEnvKeys", () => {
  it("returns only what one environment supplies", () => {
    const dir = createTempDir("slskit-keys-one-");
    writeEnvFile(dir, "dev", "DEV_ONLY=1\n");
    writeEnvFile(dir, "production", "PROD_ONLY=2\n");

    expect(environmentEnvKeys(dir, manifest(), "dev")).toEqual(["DEV_ONLY", "LOG_LEVEL"]);
    expect(environmentEnvKeys(dir, manifest(), "production")).toEqual([
      "API_KEY",
      "PROD_ONLY",
    ]);
    removeDir(dir);
  });
});
