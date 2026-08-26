import { parseEnvironmentName } from "../../src/core/environments";
import {
  defaultStackName,
  parseRegion,
  parseStackName,
} from "../../src/commands/configure/prompts";

describe("parseEnvironmentName", () => {
  it("returns undefined when unset or blank", () => {
    expect(parseEnvironmentName(undefined)).toBeUndefined();
    expect(parseEnvironmentName("   ")).toBeUndefined();
  });

  it("lowercases and trims", () => {
    expect(parseEnvironmentName("  Prod ")).toBe("prod");
  });

  it("accepts the environment names the CLI advertises", () => {
    expect(parseEnvironmentName("dev")).toBe("dev");
    expect(parseEnvironmentName("staging")).toBe("staging");
    expect(parseEnvironmentName("production")).toBe("production");
    expect(parseEnvironmentName("stage-1")).toBe("stage-1");
  });

  it("rejects names that do not start with a letter", () => {
    expect(() => parseEnvironmentName("1dev")).toThrow(/Invalid environment name/);
    expect(() => parseEnvironmentName("-dev")).toThrow(/Invalid environment name/);
  });

  it("rejects underscores and spaces", () => {
    expect(() => parseEnvironmentName("my_stage")).toThrow(/Invalid environment name/);
  });
});

describe("parseRegion", () => {
  it("accepts the standard partitions", () => {
    expect(parseRegion("us-east-1")).toBe("us-east-1");
    expect(parseRegion("eu-west-2")).toBe("eu-west-2");
    expect(parseRegion("ap-southeast-3")).toBe("ap-southeast-3");
    expect(parseRegion("us-gov-west-1")).toBe("us-gov-west-1");
    expect(parseRegion("cn-north-1")).toBe("cn-north-1");
  });

  it("normalizes case and whitespace", () => {
    expect(parseRegion(" US-EAST-1 ")).toBe("us-east-1");
  });

  it("rejects anything that is not region-shaped", () => {
    expect(() => parseRegion("useast1")).toThrow(/Invalid AWS region/);
    expect(() => parseRegion("us-east")).toThrow(/Invalid AWS region/);
  });
});

describe("parseStackName", () => {
  it("accepts letters, digits and hyphens", () => {
    expect(parseStackName("my-app-dev")).toBe("my-app-dev");
  });

  it("rejects a leading digit or hyphen", () => {
    expect(() => parseStackName("1app")).toThrow(/Invalid stack name/);
    expect(() => parseStackName("-app")).toThrow(/Invalid stack name/);
  });

  it("rejects underscores", () => {
    expect(() => parseStackName("my_app")).toThrow(/Invalid stack name/);
  });

  it("rejects names longer than 128 characters", () => {
    expect(() => parseStackName(`a${"b".repeat(128)}`)).toThrow(/Invalid stack name/);
  });
});

describe("defaultStackName", () => {
  it("joins the project name and stage", () => {
    expect(defaultStackName("my-app", "dev")).toBe("my-app-dev");
  });

  it("replaces characters CloudFormation rejects", () => {
    expect(defaultStackName("my_app.v2", "prod")).toBe("my-app-v2-prod");
  });

  it("prefixes names that do not start with a letter", () => {
    expect(defaultStackName("2fast", "dev")).toBe("app-2fast-dev");
  });

  it("produces a name parseStackName accepts", () => {
    expect(parseStackName(defaultStackName("my_app.v2", "prod"))).toBe("my-app-v2-prod");
  });
});
