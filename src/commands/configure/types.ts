export type {
  DeploymentConfig,
  EnvVarDef,
  EnvVarSource,
  ProjectManifest as ConfigurableManifest,
  StageConfig,
} from "../../core/manifest.js";

export { MANIFEST_FILE } from "../../core/manifest.js";

export interface ConfigureOptions {
  stage?: string;
  profile?: string;
  region?: string;
  stackName?: string;
  skipVerify?: boolean;
}

export interface ConfigureAnswers {
  stage: string;
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

export const DEFAULT_STAGE = "dev";
