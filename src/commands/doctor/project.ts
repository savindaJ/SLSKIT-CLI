import fs from "node:fs";
import path from "node:path";
import { CliError } from "../../core/errors.js";
import { resolveAwsProfile } from "../../core/credentials.js";
import {
  LEGACY_MANIFEST_FILE,
  MANIFEST_FILE,
  environmentNames,
  manifestPathFor,
  parseEnvironmentName,
  resolveEnvironmentName,
} from "../../core/environments.js";
import type { ProjectManifest } from "../../core/environments.js";
import { applicationsOf } from "../../core/scope.js";
import { getCallerIdentity } from "../configure/aws-cli.js";
import { parameterOverrides } from "../env/parameters.js";
import type { CheckResult } from "./types.js";

export interface DeployTarget {
  environment: string;
  region: string;
  stackName: string;
  profile?: string;
}

function count(value: number, noun: string): string {
  return `${value} ${noun}${value === 1 ? "" : "s"}`;
}

// Outside a project this is a skip rather than a failure: the toolchain checks above
// are still worth running from anywhere, which is the whole point of being able to
// type "slskit doctor" before you have a project at all.
export function checkProject(cwd: string): {
  result: CheckResult;
  manifest?: ProjectManifest;
} {
  const manifestPath = manifestPathFor(cwd);

  if (!manifestPath) {
    return {
      result: {
        id: "project",
        title: "Project",
        status: "skip",
        detail: `no ${MANIFEST_FILE} in ${cwd}`,
        fix: `Run "slskit init" to create a project, or re-run this from your project root (--cwd <path>).`,
      },
    };
  }

  const file = path.basename(manifestPath);
  let manifest: ProjectManifest;

  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as ProjectManifest;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      result: {
        id: "project",
        title: "Project",
        status: "fail",
        detail: `${file} is not valid JSON: ${message}`,
        fix: `Fix the syntax in ${manifestPath}, or restore it from version control.`,
      },
    };
  }

  if (!manifest?.name) {
    return {
      result: {
        id: "project",
        title: "Project",
        status: "fail",
        detail: `${file} has no project "name"`,
        fix: `Add a "name" to ${file}. Every resource name is built from it.`,
      },
    };
  }

  // Every command that builds or deploys refuses a non-SAM project, so a doctor run
  // that stayed quiet about it would be reporting on a project nothing can use.
  if (manifest.framework?.id && manifest.framework.id !== "sam") {
    return {
      result: {
        id: "project",
        title: "Project",
        status: "fail",
        detail: `"${manifest.name}" declares framework "${manifest.framework.id}"; slskit supports AWS SAM only`,
        fix: `Set "framework": { "id": "sam" } in ${file}, or start a new project with "slskit init".`,
      },
      manifest,
    };
  }

  const services = applicationsOf(manifest);
  const functions = services.reduce((total, app) => total + (app.functions ?? []).length, 0);

  if (functions === 0) {
    return {
      result: {
        id: "project",
        title: "Project",
        status: "warn",
        detail: `"${manifest.name}" has no functions`,
        fix: 'Add one with "slskit function <name>". A stack with no resources cannot be deployed.',
      },
      manifest,
    };
  }

  const legacy = file === LEGACY_MANIFEST_FILE ? `, still named ${LEGACY_MANIFEST_FILE}` : "";

  return {
    result: {
      id: "project",
      title: "Project",
      status: "ok",
      detail: `"${manifest.name}" — ${count(services.length, "service")}, ${count(functions, "function")} (${file}${legacy})`,
    },
    manifest,
  };
}

export function checkEnvironment(
  manifest: ProjectManifest,
  requested: string | undefined
): { result: CheckResult; target?: DeployTarget } {
  // An unparseable --env is the user's typo, not a broken project, so it is reported
  // in place rather than thrown out of the command.
  let environment: string;
  try {
    environment = resolveEnvironmentName(manifest, requested);
  } catch (error) {
    return {
      result: {
        id: "environment",
        title: "Environment",
        status: "fail",
        detail: error instanceof CliError ? error.message : String(error),
      },
    };
  }

  const config = manifest.environments?.list?.[environment];
  const title = `Environment "${environment}"`;

  if (!config) {
    const known = environmentNames(manifest).join(", ") || "(none)";
    return {
      result: {
        id: "environment",
        title,
        status: "fail",
        detail: `not found in ${MANIFEST_FILE}. This project has: ${known}`,
        fix: `slskit env add ${environment}`,
      },
    };
  }

  if (!config.region) {
    return {
      result: {
        id: "environment",
        title,
        status: "fail",
        detail: "no AWS region, so nothing can be deployed to it",
        fix: `slskit configure --env ${environment}`,
      },
    };
  }

  const { profile } = resolveAwsProfile({ stored: config.profile });
  const where = profile ? `profile "${profile}"` : "credentials from the environment";

  return {
    result: {
      id: "environment",
      title,
      status: "ok",
      detail: `stack ${config.stackName} in ${config.region}, ${where}`,
    },
    target: {
      environment,
      region: config.region,
      stackName: config.stackName,
      profile,
    },
  };
}

// The same resolution a deploy does, run for its errors only: a secret declared in
// slskit.json but absent from .env.<environment> is the classic late failure, and it
// costs nothing to find here.
export function checkVariables(
  cwd: string,
  manifest: ProjectManifest,
  environment: string
): CheckResult {
  try {
    const overrides = parameterOverrides(cwd, manifest, environment);
    // APP_ENVIRONMENT is always the first override and is generated, not configured.
    const configured = Math.max(overrides.length - 1, 0);

    return {
      id: "variables",
      title: "Variables",
      status: "ok",
      detail:
        configured === 0
          ? "none declared beyond APP_ENVIRONMENT"
          : `${count(configured, "value")} resolved for "${environment}"`,
    };
  } catch (error) {
    const message = error instanceof CliError ? error.message : String(error);
    // The CliError already carries the exact "slskit env set" line that fixes it.
    const [detail, ...rest] = message.split("\n");

    return {
      id: "variables",
      title: "Variables",
      status: "fail",
      detail,
      fix: rest.join(" ").trim() || undefined,
    };
  }
}

export function checkCredentials(
  target: DeployTarget,
  awsCliAvailable: boolean
): CheckResult {
  const title = "AWS credentials";

  if (!awsCliAvailable) {
    return {
      id: "credentials",
      title,
      status: "skip",
      detail: "the AWS CLI is needed to verify them",
    };
  }

  const { identity, error } = getCallerIdentity(target.profile, target.region);

  if (!identity) {
    return {
      id: "credentials",
      title,
      status: "fail",
      detail: `${
        target.profile ? `profile "${target.profile}"` : "the environment"
      } was rejected in ${target.region}: ${error ?? "sts get-caller-identity failed."}`,
      fix: `slskit configure --env ${target.environment} --set-credentials`,
    };
  }

  return {
    id: "credentials",
    title,
    status: "ok",
    detail: `account ${identity.account} — ${identity.arn}`,
  };
}
