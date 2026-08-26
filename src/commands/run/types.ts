export interface RunOptions {
  port?: string | number;
  build?: boolean;
  env?: string;
}

export interface SlessManifest {
  name: string;
  framework: {
    id: string;
  };
}
