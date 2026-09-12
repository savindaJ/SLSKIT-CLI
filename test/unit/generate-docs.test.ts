import { generateFlagsMarkdown } from "../../src/core/flags-docs";
import { createProgram } from "../../src/program";

describe("generateFlagsMarkdown", () => {
  const markdown = generateFlagsMarkdown(createProgram());

  it("lists global flags once", () => {
    expect(markdown).toMatch(/## Global flags/);
    expect(markdown).toMatch(/`--cwd <path>`/);
    expect(markdown).toMatch(/`--debug`/);
  });

  it("lists every top-level command", () => {
    for (const command of ["init", "run", "function", "rm", "configure", "env", "deploy"]) {
      expect(markdown).toMatch(new RegExp(`## \`${command}`));
    }
  });

  it("includes deploy --profile", () => {
    expect(markdown).toMatch(/deploy[\s\S]*`--profile <name>`/);
  });
});
