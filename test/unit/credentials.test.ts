import { resolveAwsProfile } from "../../src/core/credentials";

describe("resolveAwsProfile", () => {
  it("prefers an explicit --profile flag", () => {
    expect(
      resolveAwsProfile({
        flag: "from-flag",
        stored: "from-config",
        env: { AWS_PROFILE: "from-env" },
      })
    ).toEqual({ profile: "from-flag", source: "flag" });
  });

  it("uses the stored project profile before AWS_PROFILE", () => {
    expect(
      resolveAwsProfile({
        stored: "from-config",
        env: { AWS_PROFILE: "from-env" },
      })
    ).toEqual({ profile: "from-config", source: "config" });
  });

  it("falls back to AWS_PROFILE when the project has no profile", () => {
    expect(resolveAwsProfile({ env: { AWS_PROFILE: "from-env" } })).toEqual({
      profile: "from-env",
      source: "env",
    });
  });

  it("returns none when nothing is set", () => {
    expect(resolveAwsProfile({ env: {} })).toEqual({ profile: undefined, source: "none" });
  });

  it("ignores blank values", () => {
    expect(
      resolveAwsProfile({
        flag: "  ",
        stored: "",
        env: { AWS_PROFILE: "   " },
      })
    ).toEqual({ profile: undefined, source: "none" });
  });
});
