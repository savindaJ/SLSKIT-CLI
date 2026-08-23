import { CliError } from "../../src/core/errors";
import { runCommand } from "../../src/core/run";

describe("CliError", () => {
  it("stores message and exit code", () => {
    const error = new CliError("Something failed", 2);
    expect(error.message).toBe("Something failed");
    expect(error.exitCode).toBe(2);
    expect(error.name).toBe("CliError");
  });

  it("defaults exit code to 1", () => {
    const error = new CliError("fail");
    expect(error.exitCode).toBe(1);
  });
});

describe("runCommand", () => {
  it("runs successful actions", async () => {
    let ran = false;
    await runCommand(async () => {
      ran = true;
    });
    expect(ran).toBe(true);
    expect(process.exitCode).toBeUndefined();
  });

  it("handles CliError with custom exit code", async () => {
    await runCommand(async () => {
      throw new CliError("expected", 3);
    });
    expect(process.exitCode).toBe(3);
  });

  it("handles generic errors with exit code 1", async () => {
    await runCommand(async () => {
      throw new Error("boom");
    });
    expect(process.exitCode).toBe(1);
  });
});
