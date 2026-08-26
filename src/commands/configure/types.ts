export type {
  EnvVarDef,
  EnvVarSource,
  EnvironmentConfig,
  ProjectManifest as ConfigurableManifest,
} from "../../core/environments.js";

export {
  DEFAULT_ENVIRONMENT,
  MANIFEST_FILE,
} from "../../core/environments.js";

export interface ConfigureOptions {
  env?: string;
  profile?: string;
  region?: string;
  stackName?: string;
  skipVerify?: boolean;
  setCredentials?: boolean;
}

export interface ConfigureAnswers {
  environment: string;
  region: string;
  profile?: string;
  stackName: string;
}

export interface AwsIdentity {
  account: string;
  arn: string;
}

export interface IdentityResult {
  identity?: AwsIdentity;
  error?: string;
}
