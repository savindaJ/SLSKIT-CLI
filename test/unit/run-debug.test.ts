import { applyGlobalOptions, resetContext } from "../../src/core/context";
import { CliError } from "../../src/core/errors";
import { runCommand } from "../../src/core/run";

const errors: string[] = [];

jest.mock("../../src/core/logger", () => ({
  logger: {
    info: jest.fn(),
    error: (message: string) => {
      errors.push(message);
    },
  },
}));

describe("runCommand --debug", () => {
  afterEach(() => {
    errors.length = 0;
    resetContext();
    process.exitCode = undefined;
  });

  it("prints a stack trace when debug is on", async () => {
    applyGlobalOptions({ debug: true });
    await runCommand(() => {
      throw new CliError("expected");
    });
    expect(errors[0]).toBe("expected");
    expect(errors.some((line) => line.includes("CliError"))).toBe(true);
  });

  it("does not print a stack trace by default", async () => {
    await runCommand(() => {
      throw new CliError("expected");
    });
    expect(errors).toEqual(["expected"]);
  });
});
