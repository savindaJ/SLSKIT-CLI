export interface EnvAddOptions {
  profile?: string;
  region?: string;
  stackName?: string;
  skipVerify?: boolean;
}

export interface EnvRemoveOptions {
  yes?: boolean;
}

export interface EnvSetOptions {
  env?: string;
  secret?: boolean;
  ssm?: string;
}

export interface EnvUnsetOptions {
  env?: string;
}

export interface EnvVarsOptions {
  env?: string;
  showSecrets?: boolean;
}
