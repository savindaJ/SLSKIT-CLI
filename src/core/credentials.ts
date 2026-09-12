export type ProfileSource = "flag" | "config" | "env" | "none";

export interface ResolvedProfile {
  profile: string | undefined;
  source: ProfileSource;
}

// Resolution order is conservative on purpose: a leftover AWS_PROFILE in the
// shell must not override the profile this project stored in slskit.json.
// An explicit --profile always wins.
export function resolveAwsProfile(options: {
  flag?: string;
  stored?: string;
  env?: NodeJS.ProcessEnv;
}): ResolvedProfile {
  const env = options.env ?? process.env;

  const fromFlag = options.flag?.trim();
  if (fromFlag) {
    return { profile: fromFlag, source: "flag" };
  }

  const fromStore = options.stored?.trim();
  if (fromStore) {
    return { profile: fromStore, source: "config" };
  }

  const fromEnv = env.AWS_PROFILE?.trim();
  if (fromEnv) {
    return { profile: fromEnv, source: "env" };
  }

  return { profile: undefined, source: "none" };
}
