export interface RunOptions {
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
