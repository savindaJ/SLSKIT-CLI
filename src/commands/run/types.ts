export interface RunOptions {
  port?: string | number;
  build?: boolean;
}

export interface SlessManifest {
  name: string;
  framework: {
    id: string;
  };
}
