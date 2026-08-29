jest.mock("node:child_process", () => ({
  spawnSync: jest.fn(),
  spawn: jest.fn(),
}));

jest.mock("../../src/core/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn() },
}));

jest.mock("@inquirer/prompts", () => ({
  confirm: jest.fn(),
}));

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { confirm } from "@inquirer/prompts";
import {
  ensureSamCliInstalled,
  samBuild,
  samBuildResource,
  samRebuild,
  startLocalApi,
} from "../../src/commands/run/sam-cli";

const mockSpawnSync = spawnSync as unknown as jest.Mock;
const mockSpawn = spawn as unknown as jest.Mock;
const mockConfirm = confirm as unknown as jest.Mock;

beforeEach(() => {
  mockSpawnSync.mockReset();
  mockSpawn.mockReset();
  mockConfirm.mockReset();
});

describe("ensureSamCliInstalled (non-interactive, stdin is not a TTY)", () => {
  it("throws with an install guide when sam is not found", async () => {
    mockSpawnSync.mockReturnValue({ error: new Error("ENOENT"), status: null });
    await expect(ensureSamCliInstalled()).rejects.toThrow(/AWS SAM CLI is required/);
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it("throws when sam --version exits non-zero", async () => {
    mockSpawnSync.mockReturnValue({ error: null, status: 1 });
    await expect(ensureSamCliInstalled()).rejects.toThrow(/AWS SAM CLI is required/);
  });

  it("passes when sam --version succeeds", async () => {
    mockSpawnSync.mockReturnValue({ error: null, status: 0 });
    await expect(ensureSamCliInstalled()).resolves.toBeUndefined();
  });
});

describe("ensureSamCliInstalled (interactive install)", () => {
  let originalIsTTY: PropertyDescriptor | undefined;
  let originalPlatform: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalIsTTY = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
    originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });
  });

  afterEach(() => {
    if (originalIsTTY) {
      Object.defineProperty(process.stdin, "isTTY", originalIsTTY);
    }
    if (originalPlatform) {
      Object.defineProperty(process, "platform", originalPlatform);
    }
  });

  it("throws without installing when the user declines", async () => {
    mockSpawnSync.mockReturnValue({ error: new Error("ENOENT"), status: null });
    mockConfirm.mockResolvedValue(false);

    await expect(ensureSamCliInstalled()).rejects.toThrow(/AWS SAM CLI is required/);
    const installAttempts = mockSpawnSync.mock.calls.filter(
      ([cmd]) => cmd === "brew" || cmd === "snap" || cmd === "sudo"
    );
    expect(installAttempts).toHaveLength(0);
  });

  it("installs via Homebrew on macOS when the user confirms", async () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    mockConfirm.mockResolvedValue(true);

    let samChecked = false;
    mockSpawnSync.mockImplementation((cmd: string) => {
      if (cmd === "sam") {
        const wasChecked = samChecked;
        samChecked = true;
        return wasChecked
          ? { error: null, status: 0 }
          : { error: new Error("ENOENT"), status: null };
      }
      return { error: null, status: 0 };
    });

    await expect(ensureSamCliInstalled()).resolves.toBeUndefined();

    const brewInstallCall = mockSpawnSync.mock.calls.find(
      ([cmd, args]) => cmd === "brew" && (args as string[])[0] === "install"
    );
    expect(brewInstallCall?.[1]).toEqual(["install", "aws/tap/aws-sam-cli"]);
  });

  it("installs via snap on Linux when the user confirms", async () => {
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    mockConfirm.mockResolvedValue(true);

    let samChecked = false;
    mockSpawnSync.mockImplementation((cmd: string) => {
      if (cmd === "sam") {
        const wasChecked = samChecked;
        samChecked = true;
        return wasChecked
          ? { error: null, status: 0 }
          : { error: new Error("ENOENT"), status: null };
      }
      return { error: null, status: 0 };
    });

    await expect(ensureSamCliInstalled()).resolves.toBeUndefined();

    const snapInstallCall = mockSpawnSync.mock.calls.find(([cmd]) => cmd === "sudo");
    expect(snapInstallCall?.[1]).toEqual(["snap", "install", "aws-sam-cli", "--classic"]);
  });

  it("does not attempt an automatic install on Windows", async () => {
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    mockConfirm.mockResolvedValue(true);
    mockSpawnSync.mockReturnValue({ error: new Error("ENOENT"), status: null });

    await expect(ensureSamCliInstalled()).rejects.toThrow(
      /AWS SAM CLI installation did not complete/
    );

    const installAttempts = mockSpawnSync.mock.calls.filter(
      ([cmd]) => cmd === "brew" || cmd === "snap" || cmd === "sudo"
    );
    expect(installAttempts).toHaveLength(0);
  });
});

describe("samBuild", () => {
  it("throws when sam build fails", () => {
    mockSpawnSync.mockReturnValue({ error: null, status: 1 });
    expect(() => samBuild("/tmp/project")).toThrow(/sam build exited with code 1/);
  });

  it("succeeds when sam build exits 0", () => {
    mockSpawnSync.mockReturnValue({ error: null, status: 0 });
    expect(() => samBuild("/tmp/project")).not.toThrow();
  });
});

describe("startLocalApi", () => {
  it("spawns sam with the port and the parameter overrides", () => {
    mockSpawn.mockReturnValue({ on: jest.fn() });
    startLocalApi("/tmp/project", 4000, ["AppEnvironment=dev"]);

    const [command, args] = mockSpawn.mock.calls[0] as [string, string[]];
    expect(command).toBe("sam");
    expect(args.join(" ")).toMatch(/local start-api --port 4000/);
    expect(args.join(" ")).toMatch(/--parameter-overrides AppEnvironment=dev/);
  });
});

function project(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slskit-partial-"));
  fs.mkdirSync(path.join(dir, ".aws-sam/build/AuthStack/LoginFunction"), {
    recursive: true,
  });
  fs.mkdirSync(path.join(dir, ".aws-sam/build/ProductStack/GetProductsFunction"), {
    recursive: true,
  });
  fs.writeFileSync(dir + "/.aws-sam/build/AuthStack/LoginFunction/handler.js", "old");
  fs.writeFileSync(
    dir + "/.aws-sam/build/ProductStack/GetProductsFunction/handler.js",
    "keep"
  );
  return dir;
}

const read = (file: string): string => fs.readFileSync(file, "utf8");

// "sam build <ResourceId>" empties the build directory and restores only the named
// resource, so building straight into it would leave every other function unservable
// until the next full build. The scoped build has to go somewhere else and be moved in.
describe("samBuildResource", () => {
  it("swaps in the rebuilt function and leaves its siblings untouched", () => {
    const dir = project();

    mockSpawnSync.mockImplementation((_cmd: string, args: string[]) => {
      const buildDir = args[args.indexOf("--build-dir") + 1];
      const out = path.join(dir, buildDir, "AuthStack/LoginFunction");
      fs.mkdirSync(out, { recursive: true });
      fs.writeFileSync(path.join(out, "handler.js"), "new");
      return { error: null, status: 0 };
    });

    expect(samBuildResource(dir, "AuthStack/LoginFunction")).toBe(true);
    expect(read(dir + "/.aws-sam/build/AuthStack/LoginFunction/handler.js")).toBe("new");
    expect(read(dir + "/.aws-sam/build/ProductStack/GetProductsFunction/handler.js")).toBe(
      "keep"
    );
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("builds into a scratch directory and does not leave it behind", () => {
    const dir = project();

    mockSpawnSync.mockImplementation((_cmd: string, args: string[]) => {
      const buildDir = args[args.indexOf("--build-dir") + 1];
      expect(buildDir).not.toBe(path.join(".aws-sam", "build"));
      fs.mkdirSync(path.join(dir, buildDir, "AuthStack/LoginFunction"), {
        recursive: true,
      });
      return { error: null, status: 0 };
    });

    samBuildResource(dir, "AuthStack/LoginFunction");

    expect(fs.readdirSync(path.join(dir, ".aws-sam"))).toEqual(["build"]);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("keeps the previous build when sam fails, and reports it", () => {
    const dir = project();
    mockSpawnSync.mockReturnValue({ error: null, status: 1 });

    expect(samBuildResource(dir, "AuthStack/LoginFunction")).toBe(false);
    expect(read(dir + "/.aws-sam/build/AuthStack/LoginFunction/handler.js")).toBe("old");
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("samRebuild", () => {
  it("reports failure instead of throwing, so a watch session survives it", () => {
    mockSpawnSync.mockReturnValue({ error: null, status: 1 });
    expect(samRebuild("/tmp/project")).toBe(false);
  });

  it("reports success", () => {
    mockSpawnSync.mockReturnValue({ error: null, status: 0 });
    expect(samRebuild("/tmp/project")).toBe(true);
  });
});
