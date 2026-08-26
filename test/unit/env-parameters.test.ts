import { parameterOverrides, toCliArguments } from "../../src/commands/env/parameters";
import { setDotenvValue } from "../../src/commands/env/dotenv";
import type { ProjectManifest } from "../../src/core/environments";
import { createTempDir, removeDir } from "../helpers/cli";

function manifest(variables: ProjectManifest["environments"] extends infer _ ? any : never = {}): ProjectManifest {
  return {
    name: "shop",
    environments: {
      default: "dev",
      list: {
        production: { region: "eu-west-2", stackName: "shop-production", variables },
      },
    },
  };
}

describe("parameterOverrides", () => {
  it("always puts AppEnvironment first", () => {
    const dir = createTempDir("slskit-params-");
    const overrides = parameterOverrides(dir, manifest(), "production");

    expect(overrides[0]).toEqual({ name: "AppEnvironment", value: "production" });
    removeDir(dir);
  });

  it("passes an inline value straight through", () => {
    const dir = createTempDir("slskit-params-value-");
    const overrides = parameterOverrides(
      dir,
      manifest({ LOG_LEVEL: { value: "debug" } }),
      "production"
    );

    expect(overrides).toContainEqual({ name: "EnvLogLevel", value: "debug" });
    removeDir(dir);
  });

  it("reads a secret from the environment's dotenv file", () => {
    const dir = createTempDir("slskit-params-secret-");
    setDotenvValue(dir, "production", "API_KEY", "sk-live-123");

    const overrides = parameterOverrides(
      dir,
      manifest({ API_KEY: { secret: true } }),
      "production"
    );

    expect(overrides).toContainEqual({ name: "EnvApiKey", value: "sk-live-123" });
    removeDir(dir);
  });

  it("fails loudly when a secret is declared but missing", () => {
    const dir = createTempDir("slskit-params-missing-");

    expect(() =>
      parameterOverrides(dir, manifest({ API_KEY: { secret: true } }), "production")
    ).toThrow(/marked secret .* but is missing from \.env\.production/);
    removeDir(dir);
  });

  it("emits a CloudFormation dynamic reference for an SSM variable", () => {
    const dir = createTempDir("slskit-params-ssm-");
    const overrides = parameterOverrides(
      dir,
      manifest({ DB_PASSWORD: { ssm: "/shop/prod/db" } }),
      "production"
    );

    expect(overrides).toContainEqual({
      name: "EnvDbPassword",
      value: "{{resolve:ssm:/shop/prod/db}}",
    });
    removeDir(dir);
  });

  it("never reads a secret value out of the manifest itself", () => {
    const dir = createTempDir("slskit-params-nosecret-");
    setDotenvValue(dir, "production", "API_KEY", "from-dotenv");

    const overrides = parameterOverrides(
      dir,
      manifest({ API_KEY: { secret: true, value: "from-manifest" } }),
      "production"
    );

    expect(overrides).toContainEqual({ name: "EnvApiKey", value: "from-dotenv" });
    removeDir(dir);
  });
});

describe("toCliArguments", () => {
  it("formats overrides as Key=Value pairs", () => {
    expect(
      toCliArguments([
        { name: "AppEnvironment", value: "dev" },
        { name: "EnvLogLevel", value: "debug" },
      ])
    ).toEqual(["AppEnvironment=dev", "EnvLogLevel=debug"]);
  });
});
