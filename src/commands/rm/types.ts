export interface RmOptions {
  name?: string;
  function?: string;
  service?: string;
  // "--app" is accepted as well, so "slskit rm --app auth" mirrors
  // "slskit function --app auth".
  app?: string;
  yes?: boolean;
}
