// Detects hosted CI without a dependency. `CI` is the de-facto signal; GitHub
// Actions is listed explicitly because some self-hosted runners omit `CI`.
export function isCI(env: NodeJS.ProcessEnv = process.env): boolean {
  const ci = env.CI;
  if (ci === "true" || ci === "1") {
    return true;
  }

  return env.GITHUB_ACTIONS === "true";
}

export function isInteractive(
  stdin: { isTTY?: boolean } = process.stdin,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return Boolean(stdin.isTTY) && !isCI(env);
}
