const cliLogs = { errors: [] as string[], infos: [] as string[] };

jest.mock("../../src/core/logger", () => ({
  logger: {
    info: (message: string) => {
      cliLogs.infos.push(message);
    },
    error: (message: string) => {
      cliLogs.errors.push(message);
    },
  },
}));

import { createProgram } from "../../src/program";
import { createTempDir, removeDir, runProgram } from "../helpers/cli";

function stderrText(result: { stderr: string }): string {
  return `${result.stderr}${cliLogs.errors.join("\n")}`;
}

describe("global flags", () => {
  beforeEach(() => {
    cliLogs.errors.length = 0;
    cliLogs.infos.length = 0;
  });

  it("documents cwd, debug, silent and json on the root help", async () => {
    const result = await runProgram(["--help"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/--cwd/);
    expect(result.stdout).toMatch(/--debug/);
    expect(result.stdout).toMatch(/--silent/);
    expect(result.stdout).toMatch(/--json/);
  });

  it("documents the same flags on a subcommand", () => {
    const program = createProgram();
    const init = program.commands.find((command) => command.name() === "init");
    const help = init?.helpInformation() ?? "";
    expect(help).toMatch(/--cwd/);
    expect(help).toMatch(/--debug/);
  });

  it("uses --cwd as the project root", async () => {
    const dir = createTempDir("slskit-global-cwd-");
    const result = await runProgram(["--cwd", dir, "env", "list"]);
    expect(result.status).not.toBe(0);
    expect(stderrText(result)).toMatch(/No slskit\.json found/);
    removeDir(dir);
  });

  it("rejects a missing --cwd", async () => {
    const result = await runProgram(["--cwd", "/this/path/does/not/exist", "env", "list"]);
    expect(result.status).not.toBe(0);
    expect(stderrText(result)).toMatch(/Working directory/);
  });
});
