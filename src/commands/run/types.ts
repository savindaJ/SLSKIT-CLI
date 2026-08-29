export interface RunOptions {
  /** Run every function in one service. */
  service?: string;
  /** Run one function on its own. */
  function?: string;
  /** Skip the scope prompt and run everything. */
  all?: boolean;
  port?: string | number;
  build?: boolean;
  env?: string;
  watch?: boolean;
}

export interface ProjectManifestFile {
  name: string;
  framework: {
    id: string;
  };
}
