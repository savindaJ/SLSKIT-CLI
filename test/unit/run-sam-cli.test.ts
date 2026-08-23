jest.mock("node:child_process", () => ({
  spawnSync: jest.fn(),
}));

jest.mock("../../src/core/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn() },
}));

jest.mock("@inquirer/prompts", () => ({
  confirm: jest.fn(),
}));

import { spawnSync } from "node:child_process";
import { confirm } from "@inquirer/prompts";
import {
  ensureSamCliInstalled,
  samBuild,
  samLocalStartApi,
} from "../../src/commands/run/sam-cli";

const mockSpawnSync = spawnSync as unknown as jest.Mock;
const mockConfirm = confirm as unknown as jest.Mock;

beforeEach(() => {
  mockSpawnSync.mockReset();
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

describe("samLocalStartApi", () => {
  it("does not throw when stopped by a signal (Ctrl+C)", () => {
    mockSpawnSync.mockReturnValue({ error: null, status: null, signal: "SIGINT" });
    expect(() => samLocalStartApi("/tmp/project", 3000)).not.toThrow();
  });

  it("throws when the process exits with a non-zero code", () => {
    mockSpawnSync.mockReturnValue({ error: null, status: 1, signal: null });
    expect(() => samLocalStartApi("/tmp/project", 3000)).toThrow(
      /sam local start-api exited with code 1/
    );
  });
});
