import fs from "node:fs";
import path from "node:path";
import {
  dotenvFileName,
  ensureDotenvIgnored,
  readDotenv,
  setDotenvValue,
  unsetDotenvValue,
  writeDotenv,
} from "../../src/commands/env/dotenv";
import { createTempDir, removeDir } from "../helpers/cli";

describe("dotenvFileName", () => {
  it("is named after the environment", () => {
    expect(dotenvFileName("production")).toBe(".env.production");
  });
});

describe("read/write round trip", () => {
  it("always writes APP_ENVIRONMENT first and equal to the environment", () => {
    const dir = createTempDir("slskit-dotenv-");
    writeDotenv(dir, "production", { LOG_LEVEL: "debug" });

    const body = fs.readFileSync(path.join(dir, ".env.production"), "utf8");
    const lines = body.split("\n").filter((line) => line && !line.startsWith("#"));

    expect(lines[0]).toBe("APP_ENVIRONMENT=production");
    expect(lines).toContain("LOG_LEVEL=debug");
    removeDir(dir);
  });

  it("refuses to let a stale APP_ENVIRONMENT survive", () => {
    const dir = createTempDir("slskit-dotenv-stale-");
    writeDotenv(dir, "production", { APP_ENVIRONMENT: "dev", A: "1" });

    expect(readDotenv(dir, "production").APP_ENVIRONMENT).toBe("production");
    removeDir(dir);
  });

  it("returns an empty object when the file is absent", () => {
    const dir = createTempDir("slskit-dotenv-missing-");
    expect(readDotenv(dir, "dev")).toEqual({});
    removeDir(dir);
  });

  it("survives values containing spaces, quotes, hashes and backslashes", () => {
    const dir = createTempDir("slskit-dotenv-quote-");
    for (const value of ['a b # c "d"', 'back\\slash', 'both \\ and "']) {
      setDotenvValue(dir, "dev", "TRICKY", value);
      expect(readDotenv(dir, "dev").TRICKY).toBe(value);
    }
    removeDir(dir);
  });

  it("ignores comments and blank lines", () => {
    const dir = createTempDir("slskit-dotenv-comments-");
    fs.writeFileSync(
      path.join(dir, ".env.dev"),
      "# comment\n\nA=1\n  # indented comment\nB=2\n"
    );

    expect(readDotenv(dir, "dev")).toEqual({ A: "1", B: "2" });
    removeDir(dir);
  });

  it("updates one key without disturbing the others", () => {
    const dir = createTempDir("slskit-dotenv-update-");
    setDotenvValue(dir, "dev", "A", "1");
    setDotenvValue(dir, "dev", "B", "2");
    setDotenvValue(dir, "dev", "A", "3");

    expect(readDotenv(dir, "dev")).toEqual({
      APP_ENVIRONMENT: "dev",
      A: "3",
      B: "2",
    });
    removeDir(dir);
  });

  it("removes a key and leaves the rest", () => {
    const dir = createTempDir("slskit-dotenv-unset-");
    setDotenvValue(dir, "dev", "A", "1");
    setDotenvValue(dir, "dev", "B", "2");
    unsetDotenvValue(dir, "dev", "A");

    expect(readDotenv(dir, "dev")).toEqual({ APP_ENVIRONMENT: "dev", B: "2" });
    removeDir(dir);
  });
});

describe("ensureDotenvIgnored", () => {
  it("adds the ignore rule when it is missing", () => {
    const dir = createTempDir("slskit-ignore-add-");
    fs.writeFileSync(path.join(dir, ".gitignore"), "node_modules/\n");

    expect(ensureDotenvIgnored(dir)).toBe(true);
    const body = fs.readFileSync(path.join(dir, ".gitignore"), "utf8");
    expect(body).toMatch(/^\.env\.\*$/m);
    expect(body).toMatch(/^!\.env\.example$/m);
    removeDir(dir);
  });

  it("is a no-op when the rule is already present", () => {
    const dir = createTempDir("slskit-ignore-noop-");
    fs.writeFileSync(path.join(dir, ".gitignore"), "node_modules/\n.env.*\n");

    expect(ensureDotenvIgnored(dir)).toBe(false);
    removeDir(dir);
  });

  it("creates .gitignore when the project has none", () => {
    const dir = createTempDir("slskit-ignore-new-");
    expect(ensureDotenvIgnored(dir)).toBe(true);
    expect(fs.existsSync(path.join(dir, ".gitignore"))).toBe(true);
    removeDir(dir);
  });
});
