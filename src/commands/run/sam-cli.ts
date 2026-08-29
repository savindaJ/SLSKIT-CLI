import { spawn, spawnSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { CliError } from "../../core/errors.js";
import { logger } from "../../core/logger.js";

const USE_SHELL = process.platform === "win32";

const GUIDE_URLS: Partial<Record<NodeJS.Platform, string>> = {
  darwin:
    "https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli-mac.html",
  linux:
    "https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli-linux.html",
  win32:
    "https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli-windows.html",
};

const GENERAL_GUIDE_URL =
  "https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html";

function platformGuideUrl(): string {
  return GUIDE_URLS[process.platform] ?? GENERAL_GUIDE_URL;
}

function printManualGuide(): void {
  logger.info(
    `\nInstall AWS SAM CLI manually, then re-run "slskit run":\n  ${platformGuideUrl()}\n\nVerify the install with: sam --version\n`
  );
}

function commandExists(command: string): boolean {
  const result = spawnSync(command, ["--version"], {
    stdio: "ignore",
    shell: USE_SHELL,
  });
  return !result.error;
}

function isSamCliAvailable(): boolean {
  const result = spawnSync("sam", ["--version"], {
    stdio: "ignore",
    shell: USE_SHELL,
  });
  return !result.error && result.status === 0;
}

function installViaBrew(): boolean {
  if (!commandExists("brew")) {
    logger.info("Homebrew was not found (https://brew.sh). Falling back to a manual install.");
    return false;
  }

  logger.info("\n> brew install aws/tap/aws-sam-cli");
  const result = spawnSync("brew", ["install", "aws/tap/aws-sam-cli"], {
    stdio: "inherit",
  });

  return !result.error && result.status === 0;
}

function installViaSnap(): boolean {
  if (!commandExists("snap")) {
    logger.info("snap was not found. Falling back to a manual install.");
    return false;
  }

  logger.info("\n> sudo snap install aws-sam-cli --classic");
  const result = spawnSync("sudo", ["snap", "install", "aws-sam-cli", "--classic"], {
    stdio: "inherit",
  });

  return !result.error && result.status === 0;
}

function attemptInstall(): boolean {
  if (process.platform === "darwin") {
    return installViaBrew();
  }

  if (process.platform === "linux") {
    return installViaSnap();
  }

  logger.info(`Automatic install isn't available on "${process.platform}".`);
  return false;
}

export async function ensureSamCliInstalled(): Promise<void> {
  if (isSamCliAvailable()) {
    return;
  }

  logger.info("AWS SAM CLI was not found on your PATH.");

  if (!process.stdin.isTTY) {
    printManualGuide();
    throw new CliError("AWS SAM CLI is required to run this project locally.");
  }

  const { confirm } = await import("@inquirer/prompts");
  const shouldInstall = await confirm({
    message: "Install AWS SAM CLI now?",
    default: true,
  });

  if (!shouldInstall) {
    printManualGuide();
    throw new CliError("AWS SAM CLI is required to run this project locally.");
  }

  const installed = attemptInstall() && isSamCliAvailable();

  if (!installed) {
    printManualGuide();
    throw new CliError("AWS SAM CLI installation did not complete.");
  }

  logger.info("\nAWS SAM CLI installed.\n");
}

export function samBuild(cwd: string): void {
  logger.info("\n> sam build");
  const result = spawnSync("sam", ["build"], {
    cwd,
    stdio: "inherit",
    shell: USE_SHELL,
  });

  if (result.error) {
    throw new CliError(`Failed to run sam build: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new CliError(`sam build exited with code ${result.status ?? 1}`);
  }
}

const PARTIAL_BUILD_DIR = path.join(".aws-sam", "slskit-partial");

// "sam build <ResourceId>" empties the whole build directory and puts back only the
// resource it was asked for, which would leave every other function unservable. So
// the scoped build goes to a scratch directory and just that one artifact is moved
// into place -- the running local API picks it up on the next request.
export function samBuildResource(cwd: string, resourceId: string): boolean {
  const scratch = path.join(cwd, PARTIAL_BUILD_DIR);
  fs.rmSync(scratch, { recursive: true, force: true });

  const result = spawnSync(
    "sam",
    ["build", resourceId, "--build-dir", PARTIAL_BUILD_DIR],
    { cwd, stdio: "inherit", shell: USE_SHELL }
  );

  if (result.error || result.status !== 0) {
    fs.rmSync(scratch, { recursive: true, force: true });
    return false;
  }

  const built = path.join(scratch, resourceId);
  const target = path.join(cwd, ".aws-sam", "build", resourceId);

  if (!fs.existsSync(built)) {
    fs.rmSync(scratch, { recursive: true, force: true });
    return false;
  }

  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.renameSync(built, target);
  fs.rmSync(scratch, { recursive: true, force: true });

  return true;
}

// Unlike samBuild this never throws: a syntax error in a handler must not tear down
// a watch session that the next save would fix.
export function samRebuild(cwd: string): boolean {
  const result = spawnSync("sam", ["build"], {
    cwd,
    stdio: "inherit",
    shell: USE_SHELL,
  });

  return !result.error && result.status === 0;
}

export function startLocalApi(
  cwd: string,
  port: number,
  parameterOverrides: string[] = []
): ChildProcess {
  const overrideArgs =
    parameterOverrides.length > 0
      ? ["--parameter-overrides", ...parameterOverrides]
      : [];

  // Values are deliberately not logged: overrides carry secrets.
  const overrideNote =
    parameterOverrides.length > 0
      ? ` --parameter-overrides (${parameterOverrides.length} value${parameterOverrides.length === 1 ? "" : "s"})`
      : "";

  logger.info(`\n> sam local start-api --port ${port}${overrideNote}`);

  const child = spawn(
    "sam",
    ["local", "start-api", "--port", String(port), ...overrideArgs],
    { cwd, stdio: "inherit", shell: USE_SHELL }
  );

  child.on("error", (error) => {
    logger.error(`Failed to run sam local start-api: ${error.message}`);
  });

  return child;
}
