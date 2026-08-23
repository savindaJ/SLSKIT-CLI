import { spawnSync } from "node:child_process";
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
    `\nInstall AWS SAM CLI manually, then re-run "sless run":\n  ${platformGuideUrl()}\n\nVerify the install with: sam --version\n`
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

export function samLocalStartApi(cwd: string, port: number): void {
  logger.info(`\n> sam local start-api --port ${port}`);
  logger.info(
    `Every application's routes are served from one local API at http://127.0.0.1:${port}`
  );
  logger.info("Press Ctrl+C to stop.\n");

  const result = spawnSync(
    "sam",
    ["local", "start-api", "--port", String(port)],
    { cwd, stdio: "inherit", shell: USE_SHELL }
  );

  if (result.error) {
    throw new CliError(`Failed to run sam local start-api: ${result.error.message}`);
  }

  if (result.signal) {
    return;
  }

  if (result.status !== 0) {
    throw new CliError(`sam local start-api exited with code ${result.status ?? 1}`);
  }
}
