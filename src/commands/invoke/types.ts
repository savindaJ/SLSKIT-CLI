export interface InvokeOptions {
  env?: string;
  service?: string;
  function?: string;
  event?: string;
  remote?: boolean;
  build?: boolean;
  profile?: string;
  /** Output file for remote invoke response (default: stdout only) */
  out?: string;
}