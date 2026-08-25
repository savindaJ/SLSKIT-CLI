export interface EnvSetOptions {
  stage?: string;
  secret?: boolean;
  ssm?: string;
}

export interface EnvListOptions {
  stage?: string;
  showSecrets?: boolean;
}

export interface EnvUnsetOptions {
  stage?: string;
}
