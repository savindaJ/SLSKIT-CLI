export interface DeployOptions {
  /** Deploy every function in one service. */
  service?: string;
  /** Deploy one function on its own. */
  function?: string;
  /** Skip the scope prompt and deploy the whole project. */
  all?: boolean;
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
