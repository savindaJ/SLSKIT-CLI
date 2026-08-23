import { collectAnswers } from "../../src/commands/init/prompts";
import { CliError } from "../../src/core/errors";

const FULL_OPTIONS = {
  name: "my-app",
  runtime: "typescript",
  framework: "sam",
  database: "none",
  apiGateway: "yes",
  layer: "no",
  memory: "256",
};

describe("collectAnswers", () => {
  it("returns all answers when every flag is provided", async () => {
    const answers = await collectAnswers(FULL_OPTIONS);

    expect(answers).toMatchObject({
      name: "my-app",
      runtime: "typescript",
      framework: "sam",
      database: "none",
      apiGateway: true,
      layer: false,
      memorySize: 256,
      force: false,
    });
  });

  it("parses runtime aliases", async () => {
    const aliases = ["ts", "js", "py", "nodejs", "python3"];
    const expected = ["typescript", "javascript", "python", "javascript", "python"];

    for (let i = 0; i < aliases.length; i++) {
      const answers = await collectAnswers({ ...FULL_OPTIONS, runtime: aliases[i] });
      expect(answers.runtime).toBe(expected[i]);
    }
  });

  it("parses framework aliases", async () => {
    for (const [alias, expected] of [
      ["sls", "serverless"],
      ["aws-sam", "sam"],
    ] as const) {
      const answers = await collectAnswers({ ...FULL_OPTIONS, framework: alias });
      expect(answers.framework).toBe(expected);
    }
  });

  it("parses database aliases", async () => {
    for (const [alias, expected] of [
      ["mongo", "mongoose"],
      ["dynamo", "dynamodb"],
      ["skip", "none"],
    ] as const) {
      const answers = await collectAnswers({ ...FULL_OPTIONS, database: alias });
      expect(answers.database).toBe(expected);
    }
  });

  it("parses api-gateway and layer yes/no variants", async () => {
    for (const value of ["yes", "y", "true", "1"]) {
      const answers = await collectAnswers({ ...FULL_OPTIONS, apiGateway: value });
      expect(answers.apiGateway).toBe(true);
    }

    for (const value of ["no", "n", "false", "0"]) {
      const answers = await collectAnswers({ ...FULL_OPTIONS, layer: value });
      expect(answers.layer).toBe(false);
    }
  });

  it("parses memory with and without MB suffix", async () => {
    const withSuffix = await collectAnswers({ ...FULL_OPTIONS, memory: "512MB" });
    expect(withSuffix.memorySize).toBe(512);

    for (const size of [128, 256, 512, 1024, 2048, 3008, 4096, 10240]) {
      const answers = await collectAnswers({ ...FULL_OPTIONS, memory: String(size) });
      expect(answers.memorySize).toBe(size);
    }
  });

  it("throws for unknown runtime", async () => {
    await expect(collectAnswers({ ...FULL_OPTIONS, runtime: "ruby" })).rejects.toThrow(CliError);
    await expect(collectAnswers({ ...FULL_OPTIONS, runtime: "ruby" })).rejects.toThrow(
      /Unknown runtime/
    );
  });

  it("throws for unknown framework", async () => {
    await expect(collectAnswers({ ...FULL_OPTIONS, framework: "terraform" })).rejects.toThrow(
      /Unknown framework/
    );
  });

  it("throws for unknown database", async () => {
    await expect(collectAnswers({ ...FULL_OPTIONS, database: "postgres" })).rejects.toThrow(
      /Unknown database/
    );
  });

  it("throws for invalid memory size", async () => {
    await expect(collectAnswers({ ...FULL_OPTIONS, memory: "999" })).rejects.toThrow(
      /Unknown memory size/
    );
  });

  it("throws for invalid yes/no values", async () => {
    await expect(collectAnswers({ ...FULL_OPTIONS, apiGateway: "maybe" })).rejects.toThrow(
      /must be yes or no/
    );
  });

  it("throws in non-interactive mode when options are missing", async () => {
    await expect(collectAnswers({ name: "only-name" })).rejects.toThrow(
      /Non-interactive init needs/
    );
  });

  it("throws when project name is blank in non-interactive mode", async () => {
    await expect(collectAnswers({ ...FULL_OPTIONS, name: "   " })).rejects.toThrow(
      /Non-interactive init needs/
    );
  });

  it("respects force flag", async () => {
    const answers = await collectAnswers({ ...FULL_OPTIONS, force: true });
    expect(answers.force).toBe(true);
  });
});
