import fs from "node:fs";
import path from "node:path";
import {
  ensureDotenvIgnored,
  readDotenv,
  setDotenvValue,
  unsetDotenvValue,
  writeDotenv,
} from "../../src/commands/env/dotenv";
import { createTempDir, removeDir } from "../helpers/cli";

describe("readDotenv", () => {
  it("returns an empty object when the file is absent", () => {
    const dir = createTempDir("slskit-dotenv-none-");
    expect(readDotenv(dir, "dev")).toEqual({});
    removeDir(dir);
  });

  it("skips comments and blank lines", () => {
    const dir = createTempDir("slskit-dotenv-parse-");
    fs.writeFileSync(path.join(dir, ".env.dev"), "# note\n\nA=1\nB=2\n");
    expect(readDotenv(dir, "dev")).toEqual({ A: "1", B: "2" });
    removeDir(dir);
  });

  it("strips surrounding quotes", () => {
    const dir = createTempDir("slskit-dotenv-quotes-");
    fs.writeFileSync(path.join(dir, ".env.dev"), 'A="hello world"\nB=\'x\'\n');
    expect(readDotenv(dir, "dev")).toEqual({ A: "hello world", B: "x" });
    removeDir(dir);
  });
});

describe("writeDotenv", () => {
  it("round-trips values that contain spaces and hashes", () => {
    const dir = createTempDir("slskit-dotenv-round-");
    writeDotenv(dir, "dev", { A: "a b # c", B: "plain" });
    expect(readDotenv(dir, "dev")).toEqual({ A: "a b # c", B: "plain" });
    removeDir(dir);
  });

  it("warns in the file header that it must not be committed", () => {
    const dir = createTempDir("slskit-dotenv-header-");
    writeDotenv(dir, "prod", { A: "1" });
    const raw = fs.readFileSync(path.join(dir, ".env.prod"), "utf8");
    expect(raw).toMatch(/Never commit this file/);
    removeDir(dir);
  });
});

describe("setDotenvValue / unsetDotenvValue", () => {
  it("adds, overwrites and removes a single key", () => {
    const dir = createTempDir("slskit-dotenv-mutate-");
    setDotenvValue(dir, "dev", "A", "1");
    setDotenvValue(dir, "dev", "B", "2");
    setDotenvValue(dir, "dev", "A", "3");
    expect(readDotenv(dir, "dev")).toEqual({ A: "3", B: "2" });

    unsetDotenvValue(dir, "dev", "A");
    expect(readDotenv(dir, "dev")).toEqual({ B: "2" });

    unsetDotenvValue(dir, "dev", "MISSING");
    expect(readDotenv(dir, "dev")).toEqual({ B: "2" });
    removeDir(dir);
  });
});

describe("ensureDotenvIgnored", () => {
  it("adds the rule when .gitignore does not cover .env.*", () => {
    const dir = createTempDir("slskit-dotenv-ignore-");
    fs.writeFileSync(path.join(dir, ".gitignore"), "node_modules/\n.env\n");

    expect(ensureDotenvIgnored(dir)).toBe(true);
    const raw = fs.readFileSync(path.join(dir, ".gitignore"), "utf8");
    expect(raw).toMatch(/^\.env\.\*$/m);
    expect(raw).toMatch(/^!\.env\.example$/m);
    removeDir(dir);
  });

  it("is a no-op when the rule is already present", () => {
    const dir = createTempDir("slskit-dotenv-ignore-noop-");
    fs.writeFileSync(path.join(dir, ".gitignore"), ".env.*\n");
    expect(ensureDotenvIgnored(dir)).toBe(false);
    removeDir(dir);
  });

  it("creates .gitignore when the project has none", () => {
    const dir = createTempDir("slskit-dotenv-ignore-new-");
    expect(ensureDotenvIgnored(dir)).toBe(true);
    expect(fs.readFileSync(path.join(dir, ".gitignore"), "utf8")).toMatch(/\.env\.\*/);
    removeDir(dir);
  });
});
