import { spawnSync } from "node:child_process";
import { AWS_INSTALL_URL } from "../configure/aws-cli.js";
import type { CheckResult } from "./types.js";

const USE_SHELL = process.platform === "win32";

// A probe must never be the reason the command hangs: a wedged Docker daemon can
// leave "docker info" waiting indefinitely.
const PROBE_TIMEOUT_MS = 10_000;

const FALLBACK_NODE_MAJOR = 18;

const SAM_INSTALL_URL =
  "https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html";

const DOCKER_INSTALL_URL = "https://docs.docker.com/get-docker/";

interface Probe {
  /** The binary ran and exited 0. */
  ok: boolean;
  /** True when the binary is not on PATH at all, as opposed to erroring. */
  missing: boolean;
  stdout: string;
  stderr: string;
}

function probe(command: string, args: string[]): Probe {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: USE_SHELL,
    timeout: PROBE_TIMEOUT_MS,
  });

  const missing =
    Boolean(result.error) &&
    (result.error as NodeJS.ErrnoException).code === "ENOENT";

  return {
    ok: !result.error && result.status === 0,
    // A shell reports a missing binary as exit 127 rather than an ENOENT error.
    missing: missing || result.status === 127,
    stdout: result.stdout?.trim() ?? "",
    stderr: result.stderr?.trim() ?? "",
  };
}

function firstVersion(text: string, fallback: string): string {
  return /\d+\.\d+(\.\d+)?/.exec(text)?.[0] ?? fallback;
}

// Read at runtime from the same package.json that declares the engine range, so the
// version this command demands can never drift from the one npm enforces.
export function requiredNodeMajor(): number {
  try {
    const pkg = require("../../../package.json") as { engines?: { node?: string } };
    const major = /\d+/.exec(pkg.engines?.node ?? "")?.[0];
    return major ? Number(major) : FALLBACK_NODE_MAJOR;
  } catch {
    return FALLBACK_NODE_MAJOR;
  }
}

export function checkNode(
  version: string = process.versions.node,
  required: number = requiredNodeMajor()
): CheckResult {
  const major = Number(/^\d+/.exec(version)?.[0] ?? 0);

  if (major >= required) {
    return { id: "node", title: "Node.js", status: "ok", detail: `v${version}` };
  }

  return {
    id: "node",
    title: "Node.js",
    status: "fail",
    detail: `v${version}, but slskit needs ${required} or newer`,
    fix: `Install Node ${required}+ — https://nodejs.org (nvm: nvm install ${required})`,
  };
}

export function checkSamCli(): CheckResult {
  const result = probe("sam", ["--version"]);

  if (result.ok) {
    return {
      id: "sam-cli",
      title: "AWS SAM CLI",
      status: "ok",
      // "SAM CLI, version 1.120.0" — the number is the only part worth showing.
      detail: firstVersion(`${result.stdout} ${result.stderr}`, "installed"),
    };
  }

  return {
    id: "sam-cli",
    title: "AWS SAM CLI",
    status: "fail",
    detail: result.missing ? "not found on your PATH" : result.stderr || "could not be run",
    fix: `Install it — ${SAM_INSTALL_URL}   ("slskit run" also offers to install it)`,
  };
}

export function checkAwsCli(): CheckResult {
  const result = probe("aws", ["--version"]);

  if (result.ok) {
    return {
      id: "aws-cli",
      title: "AWS CLI",
      status: "ok",
      // "aws-cli/2.15.30 Python/3.11.8 Darwin/23.4.0" — take the aws-cli number.
      detail: firstVersion(`${result.stdout} ${result.stderr}`, "installed"),
    };
  }

  return {
    id: "aws-cli",
    title: "AWS CLI",
    status: "fail",
    detail: result.missing ? "not found on your PATH" : result.stderr || "could not be run",
    fix: `Install it — ${AWS_INSTALL_URL}`,
  };
}

// Docker is a warning rather than a failure because only "slskit run" needs it:
// "sam local" runs functions in Lambda-like containers, but a deploy uploads a zip
// and never touches Docker. Failing here would block a CI deploy for no reason.
export function checkDocker(): CheckResult {
  const installed = probe("docker", ["--version"]);

  if (installed.missing) {
    return {
      id: "docker",
      title: "Docker",
      status: "warn",
      detail: "not found on your PATH",
      fix: `Install it — ${DOCKER_INSTALL_URL}   (needed by "slskit run", not by "slskit deploy")`,
    };
  }

  // Installed is not the same as usable: the daemon is a separate process, and a
  // stopped one is the failure people actually hit, halfway through "sam local".
  const daemon = probe("docker", ["info", "--format", "{{.ServerVersion}}"]);

  if (!daemon.ok) {
    return {
      id: "docker",
      title: "Docker",
      status: "warn",
      detail: "installed, but the daemon is not responding",
      fix: 'Start Docker Desktop (or "sudo systemctl start docker"), then re-run "slskit doctor".',
    };
  }

  const version = firstVersion(installed.stdout, "");
  const server = daemon.stdout;

  return {
    id: "docker",
    title: "Docker",
    status: "ok",
    detail: version ? `${version}, daemon running (engine ${server})` : "daemon running",
  };
}
