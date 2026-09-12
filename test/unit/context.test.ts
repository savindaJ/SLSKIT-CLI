import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { applyGlobalOptions, getContext, resetContext } from "../../src/core/context";
import { CliError } from "../../src/core/errors";

describe("applyGlobalOptions", () => {
  const previousCwd = process.cwd();

  afterEach(() => {
    process.chdir(previousCwd);
    resetContext();
  });

  it("records debug, silent and json", () => {
    applyGlobalOptions({ debug: true, silent: true, json: true });
    expect(getContext()).toMatchObject({ debug: true, silent: true, json: true });
  });

  it("changes into --cwd when the directory exists", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slskit-cwd-"));
    applyGlobalOptions({ cwd: dir });
    expect(fs.realpathSync(process.cwd())).toBe(fs.realpathSync(dir));
    expect(fs.realpathSync(getContext().cwd)).toBe(fs.realpathSync(dir));
    process.chdir(previousCwd);
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  });

  it("rejects a missing --cwd", () => {
    expect(() => applyGlobalOptions({ cwd: path.join(os.tmpdir(), "slskit-missing-cwd") })).toThrow(
      CliError
    );
  });
});
