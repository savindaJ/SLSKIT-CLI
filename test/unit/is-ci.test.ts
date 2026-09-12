import { isCI, isInteractive } from "../../src/core/is-ci";

describe("isCI", () => {
  it("treats CI=true and CI=1 as CI", () => {
    expect(isCI({ CI: "true" })).toBe(true);
    expect(isCI({ CI: "1" })).toBe(true);
  });

  it("treats GitHub Actions as CI", () => {
    expect(isCI({ GITHUB_ACTIONS: "true" })).toBe(true);
  });

  it("is false in a normal shell", () => {
    expect(isCI({})).toBe(false);
    expect(isCI({ CI: "false" })).toBe(false);
  });
});

describe("isInteractive", () => {
  it("requires a TTY and a non-CI environment", () => {
    expect(isInteractive({ isTTY: true }, {})).toBe(true);
    expect(isInteractive({ isTTY: false }, {})).toBe(false);
    expect(isInteractive({ isTTY: true }, { CI: "true" })).toBe(false);
  });
});
