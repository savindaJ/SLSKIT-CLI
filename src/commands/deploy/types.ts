export interface DeployOptions {
  env?: string;
  build?: boolean;
  yes?: boolean;
  skipVerify?: boolean;
  guided?: boolean;
}

export interface StackOutput {
  key: string;
  value: string;
  description?: string;
}
