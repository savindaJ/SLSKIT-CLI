import fs from "node:fs";
import path from "node:path";
import {
  allEnvKeys,
  envVarSource,
  readManifest,
  requireStage,
  resolveStageName,
  stageNames,
  writeManifest,
} from "../../src/core/manifest";
import type { ProjectManifest } from "../../src/core/manifest";
import { createTempDir, removeDir } from "../helpers/cli";

const sample: ProjectManifest = {
  name: "demo",
  deployment: {
    defaultStage: "dev",
    stages: {
      dev: {
        region: "us-east-1",
        profile: "work",
        stackName: "demo-dev",
        env: { LOG_LEVEL: { value: "debug" } },
      },
      production: {
        region: "eu-west-2",
        stackName: "demo-production",
        env: { LOG_LEVEL: { value: "info" }, DATABASE_URL: { secret: true } },
      },
    },
  },
};

describe("stageNames", () => {
  it("lists stages sorted", () => {
    expect(stageNames(sample)).toEqual(["dev", "production"]);
  });

  it("returns an empty list when there is no deployment block", () => {
    expect(stageNames({ name: "demo" })).toEqual([]);
  });
});

describe("resolveStageName", () => {
  it("prefers the requested stage", () => {
    expect(resolveStageName(sample, "production")).toBe("production");
  });

  it("falls back to the default stage", () => {
    expect(resolveStageName(sample)).toBe("dev");
  });

  it("throws when the project has no stages", () => {
    expect(() => resolveStageName({ name: "demo" })).toThrow(/no stages yet/);
  });
});

describe("requireStage", () => {
  it("returns the stage config", () => {
    expect(requireStage(sample, "dev").stackName).toBe("demo-dev");
  });

  it("lists the known stages when one is missing", () => {
    expect(() => requireStage(sample, "nope")).toThrow(
      /Existing stages: dev, production/
    );
  });
});

describe("envVarSource", () => {
  it("classifies each source", () => {
    expect(envVarSource({ value: "x" })).toBe("value");
    expect(envVarSource({ secret: true })).toBe("secret");
    expect(envVarSource({ ssm: "/a/b" })).toBe("ssm");
  });

  it("prefers ssm when both are somehow set", () => {
    expect(envVarSource({ secret: true, ssm: "/a/b" })).toBe("ssm");
  });
});

describe("allEnvKeys", () => {
  it("returns the sorted union across every stage", () => {
    expect(allEnvKeys(sample)).toEqual(["DATABASE_URL", "LOG_LEVEL"]);
  });

  it("is empty when no stage sets a variable", () => {
    expect(allEnvKeys({ name: "demo" })).toEqual([]);
  });
});

describe("readManifest / writeManifest", () => {
  it("round-trips and keeps a trailing newline", () => {
    const dir = createTempDir("slskit-core-manifest-");
    writeManifest(dir, sample);

    const raw = fs.readFileSync(path.join(dir, "sless.json"), "utf8");
    expect(raw.endsWith("}\n")).toBe(true);
    expect(readManifest(dir)).toEqual(sample);
    removeDir(dir);
  });

  it("names the command in the missing-manifest error", () => {
    const dir = createTempDir("slskit-core-manifest-missing-");
    expect(() => readManifest(dir, "slskit env list")).toThrow(/slskit env list/);
    removeDir(dir);
  });
});
