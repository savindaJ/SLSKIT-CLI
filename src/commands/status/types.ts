import type { StackOutput } from "../deploy/types.js";

export interface StatusOptions {
  env?: string;
  /** Overrides the profile stored in slskit.json for this run only. */
  profile?: string;
}

// Whether the stack is settled, working, or needs attention. Derived from the
// CloudFormation status string rather than matched by name at every call site.
export type StackHealth = "ok" | "busy" | "failed";

export interface StackSummary {
  status: string;
  reason?: string;
  createdAt?: string;
  updatedAt?: string;
}

// One Lambda as AWS currently has it. Environment values are never carried here —
// only the names — because a status report must not be able to print a secret.
export interface DeployedFunction {
  name: string;
  runtime?: string;
  memorySize?: number;
  lastModified?: string;
  state?: string;
  variableNames: string[];
}

// A function as the project declares it, paired with whatever AWS returned for it.
export interface FunctionStatus {
  /** The name in slskit.json. */
  name: string;
  service: string;
  /** <project>-<environment>-<function>, the physical Lambda name. */
  physical: string;
  deployed?: DeployedFunction;
}

export interface StatusReport {
  project: string;
  environment: string;
  stackName: string;
  region: string;
  profile?: string;
  health: StackHealth;
  stack: StackSummary;
  endpoints: StackOutput[];
  functions: FunctionStatus[];
  hints: string[];
}
