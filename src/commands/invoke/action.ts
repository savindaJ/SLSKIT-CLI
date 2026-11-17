import { resolveAwsProfile } from "../../core/credentials.js";
import { CliError } from "../../core/errors.js";
import { logger } from "../../core/logger.js";
import {
  APP_ENVIRONMENT_KEY,
  functionNameFor,
  readManifest,
  requireEnvironment,
  resolveEnvironmentName,
} from "../../core/environments.js";
import { parameterOverrides, toCliArguments } from "../env/parameters.js";
import { syncTemplates } from "../env/templates.js";
import { isAwsCliAvailable } from "../configure/aws-cli.js";
import { readManifest as readSamManifest } from "../run/manifest.js";
import {
  LOCAL_BUILD_DIR,
  localBuiltTemplate,
  writeLocalTemplate,
} from "../run/local-template.js";
import { resourceIdFor } from "../run/resources.js";
import { ensureSamCliInstalled, samBuild } from "../run/sam-cli.js";
import { resolveEventPath } from "./event.js";
import { samLocalInvoke } from "./local.js";
import { awsLambdaInvoke } from "./remote.js";
import { resolveInvokeScope } from "./scope.js";
import type { ProjectManifest } from "../../core/environments.js";
import type { InvokeOptions } from "./types.js";

function sharedApi(manifest: ProjectManifest): boolean {
  const api = manifest.apiGateway as
    | { enabled?: boolean; perService?: boolean }
    | undefined;
  return Boolean(api?.enabled) && api?.perService === false;
}

export async function invokeAction(options: InvokeOptions & { name?: string }): Promise<void> {
  const cwd = process.cwd();
  readSamManifest(cwd);
  const manifest = readManifest(cwd, "slskit invoke");
  const project = manifest;
  const environment = resolveEnvironmentName(project, options.env);

  const scope = await resolveInvokeScope(project, options);
  if (scope.kind !== "function") {
    throw new CliError("Only a single function can be invoked.");
  }

  const eventPath = resolveEventPath(cwd, options.event);

  const rewritten = syncTemplates(cwd, project);
  if (rewritten.length > 0) {
    logger.info(`Updated ${rewritten.length} template(s) for the current variables.`);
  }

  const overrides = toCliArguments(parameterOverrides(cwd, project, environment));
  const resourceId = resourceIdFor(scope.service, scope.functionName, sharedApi(project));

  if (options.remote) {
    const config = requireEnvironment(project, environment);
    if (!config.region) {
      throw new CliError(
        `Environment "${environment}" has no AWS region yet.\nRun: slskit configure --env ${environment}`
      );
    }

    if (!isAwsCliAvailable()) {
      throw new CliError(
        "The AWS CLI is required to invoke a deployed function.\nInstall it, then re-run."
      );
    }

    const { profile } = resolveAwsProfile({
      flag: options.profile,
      stored: config.profile,
    });

    const physical = functionNameFor(project.name, environment, scope.functionName);
    logger.info(
      `\nInvoking ${scope.label} in "${project.name}" (${environment}) on AWS.\n  ${APP_ENVIRONMENT_KEY}: ${environment}\n  function:  ${physical}\n  region:    ${config.region}`
    );

    awsLambdaInvoke(
      physical,
      { stackName: config.stackName, region: config.region, profile },
      { eventPath, outFile: options.out }
    );
    return;
  }

  await ensureSamCliInstalled();

  const sourceTemplate = writeLocalTemplate(cwd, project, scope);

  if (options.build !== false) {
    samBuild(cwd, { template: sourceTemplate, buildDir: LOCAL_BUILD_DIR });
  }

  logger.info(
    `\nInvoking ${scope.label} of "${project.name}" locally.\n  ${APP_ENVIRONMENT_KEY}: ${environment}\n  resource:  ${resourceId}`
  );

  samLocalInvoke(cwd, resourceId, {
    template: localBuiltTemplate(),
    buildDir: LOCAL_BUILD_DIR,
    parameterOverrides: overrides,
    eventPath,
  });
}