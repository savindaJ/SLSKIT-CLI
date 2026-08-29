import fs from "node:fs";
import path from "node:path";
import {
  APP_ENVIRONMENT_KEY,
  allEnvKeys,
  assertFunctionNameFits,
  defaultEnvironment,
  envVarSource,
  environmentNames,
  functionNameFor,
  parseEnvironmentName,
  readManifest,
  requireEnvironment,
  resolveEnvironmentName,
  stackNameFor,
  writeEnvironment,
} from "../../src/core/environments";
import type { ProjectManifest } from "../../src/core/environments";
import { createTempDir, removeDir } from "../helpers/cli";

function sample(): ProjectManifest {
  return {
    name: "shop",
    environments: {
      default: "dev",
      list: {
        dev: { region: "us-east-1", stackName: "shop-dev" },
        production: {
          region: "eu-west-2",
          stackName: "shop-production",
          variables: { LOG_LEVEL: { value: "info" }, API_KEY: { secret: true } },
        },
      },
    },
  };
}

describe("parseEnvironmentName", () => {
  it("returns undefined when unset or blank", () => {
    expect(parseEnvironmentName(undefined)).toBeUndefined();
    expect(parseEnvironmentName("   ")).toBeUndefined();
  });

  it("accepts the names the CLI advertises", () => {
    expect(parseEnvironmentName("dev")).toBe("dev");
    expect(parseEnvironmentName("staging")).toBe("staging");
    expect(parseEnvironmentName("production")).toBe("production");
    expect(parseEnvironmentName("stage-1")).toBe("stage-1");
  });

  it("lowercases and trims", () => {
    expect(parseEnvironmentName("  PRODUCTION ")).toBe("production");
  });

  it("rejects names that do not start with a letter", () => {
    expect(() => parseEnvironmentName("1dev")).toThrow(/Invalid environment name/);
    expect(() => parseEnvironmentName("-dev")).toThrow(/Invalid environment name/);
  });

  it("rejects underscores", () => {
    expect(() => parseEnvironmentName("my_env")).toThrow(/Invalid environment name/);
  });
});

describe("resource naming", () => {
  it("builds stack names from project and environment", () => {
    expect(stackNameFor("shop", "dev")).toBe("shop-dev");
    expect(stackNameFor("shop", "production")).toBe("shop-production");
  });

  it("builds function names from project, environment and function", () => {
    expect(functionNameFor("shop", "dev", "login")).toBe("shop-dev-login");
    expect(functionNameFor("shop", "stage-1", "getProducts")).toBe(
      "shop-stage-1-getProducts"
    );
  });

  it("sanitizes characters AWS rejects", () => {
    expect(stackNameFor("my_app.v2", "dev")).toBe("my-app-v2-dev");
  });

  it("prefixes names that would not start with a letter", () => {
    expect(stackNameFor("2fast", "dev")).toBe("app-2fast-dev");
  });

  it("accepts a function name inside Lambda's 64 character limit", () => {
    expect(() => assertFunctionNameFits("shop", "dev", "login")).not.toThrow();
  });

  it("rejects a function name over Lambda's 64 character limit", () => {
    expect(() =>
      assertFunctionNameFits("shop", "a-very-long-environment-name-for-testing-limits", "createProduct")
    ).toThrow(/over the 64 character limit/);
  });
});

describe("environment lookup", () => {
  it("lists environments sorted", () => {
    expect(environmentNames(sample())).toEqual(["dev", "production"]);
  });

  it("falls back to the manifest default", () => {
    expect(resolveEnvironmentName(sample())).toBe("dev");
    expect(resolveEnvironmentName(sample(), "production")).toBe("production");
  });

  it("falls back to dev when the manifest names no default", () => {
    expect(defaultEnvironment({ name: "shop" })).toBe("dev");
  });

  it("throws with the known names when an environment is missing", () => {
    expect(() => requireEnvironment(sample(), "staging")).toThrow(
      /Existing environments: dev, production/
    );
  });
});

describe("variables", () => {
  it("classifies each variable source", () => {
    expect(envVarSource({ value: "x" })).toBe("value");
    expect(envVarSource({ secret: true })).toBe("secret");
    expect(envVarSource({ ssm: "/a/b" })).toBe("ssm");
  });

  it("collects the union of names across environments", () => {
    expect(allEnvKeys(sample())).toEqual(["API_KEY", "LOG_LEVEL"]);
  });

  it("never reports APP_ENVIRONMENT as a stored variable", () => {
    const manifest = sample();
    manifest.environments!.list.dev.variables = {
      [APP_ENVIRONMENT_KEY]: { value: "dev" },
      OTHER: { value: "1" },
    };
    expect(allEnvKeys(manifest)).toEqual(["API_KEY", "LOG_LEVEL", "OTHER"]);
  });
});

describe("writeEnvironment", () => {
  it("preserves unrelated manifest keys and keeps the first default", () => {
    const dir = createTempDir("slskit-envcore-");
    fs.writeFileSync(
      path.join(dir, "slskit.json"),
      JSON.stringify({ name: "shop", applications: [{ name: "auth" }] })
    );

    const manifest = readManifest(dir);
    writeEnvironment(dir, manifest, "dev", { stackName: "shop-dev" });

    const afterFirst = readManifest(dir);
    writeEnvironment(dir, afterFirst, "production", { stackName: "shop-production" });

    const written = readManifest(dir);
    expect(written.applications).toEqual([{ name: "auth" }]);
    expect(written.environments!.default).toBe("dev");
    expect(environmentNames(written)).toEqual(["dev", "production"]);
    removeDir(dir);
  });
});
