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

  it("passes a key that only exists in the dotenv file", () => {
    const dir = createTempDir("slskit-params-undeclared-");
    setDotenvValue(dir, "production", "SOME_API_KEY", "abc123");

    const overrides = parameterOverrides(dir, manifest(), "production");

    expect(overrides).toContainEqual({ name: "EnvSomeApiKey", value: "abc123" });
    removeDir(dir);
  });

  it("leaves an undeclared key out for a stage whose file omits it", () => {
    const dir = createTempDir("slskit-params-otherstage-");
    // Declared nowhere, present only in another environment's file.
    setDotenvValue(dir, "dev", "DEV_ONLY", "yes");

    const overrides = parameterOverrides(dir, manifest(), "production");

    expect(overrides.map((each) => each.name)).not.toContain("EnvDevOnly");
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
  it("formats overrides in the explicit ParameterKey form", () => {
    expect(
      toCliArguments([
        { name: "AppEnvironment", value: "dev" },
        { name: "EnvLogLevel", value: "debug" },
      ])
    ).toEqual([
      'ParameterKey=AppEnvironment,ParameterValue="dev"',
      'ParameterKey=EnvLogLevel,ParameterValue="debug"',
    ]);
  });

  // The shorthand "Key=Value" form splits on whitespace, so "hello world" used to
  // reach the function as "hello" with no warning of any kind.
  it("keeps a value that contains spaces, commas or equals signs intact", () => {
    expect(toCliArguments([{ name: "EnvGreeting", value: "a=b, hello world" }])).toEqual([
      'ParameterKey=EnvGreeting,ParameterValue="a=b, hello world"',
    ]);
  });

  it("escapes a double quote inside a value, and leaves backslashes alone", () => {
    expect(toCliArguments([{ name: "EnvQuote", value: 'say "hi"' }])).toEqual([
      'ParameterKey=EnvQuote,ParameterValue="say \\"hi\\""',
    ]);
    expect(toCliArguments([{ name: "EnvPath", value: "back\\slash" }])).toEqual([
      'ParameterKey=EnvPath,ParameterValue="back\\slash"',
    ]);
  });

  it("keeps an empty value as an explicit empty string", () => {
    expect(toCliArguments([{ name: "EnvEmpty", value: "" }])).toEqual([
      'ParameterKey=EnvEmpty,ParameterValue=""',
    ]);
  });
});
