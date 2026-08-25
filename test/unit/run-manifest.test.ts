import fs from "node:fs";
import path from "node:path";
import { readManifest } from "../../src/commands/run/manifest";
import { CliError } from "../../src/core/errors";
import { createTempDir, removeDir } from "../helpers/cli";

describe("readManifest", () => {
  it("throws when sless.json is missing", () => {
    const dir = createTempDir("slskit-run-manifest-missing-");
    expect(() => readManifest(dir)).toThrow(CliError);
    expect(() => readManifest(dir)).toThrow(/No sless\.json found/);
    removeDir(dir);
  });

  it("throws when the project framework is not sam", () => {
    const dir = createTempDir("slskit-run-manifest-framework-");
    fs.writeFileSync(
      path.join(dir, "sless.json"),
      JSON.stringify({ name: "demo", framework: { id: "serverless" } })
    );

    expect(() => readManifest(dir)).toThrow(/supports AWS SAM projects only/);
    removeDir(dir);
  });

  it("returns the manifest for a sam project", () => {
    const dir = createTempDir("slskit-run-manifest-ok-");
    fs.writeFileSync(
      path.join(dir, "sless.json"),
      JSON.stringify({ name: "demo", framework: { id: "sam" } })
    );

    expect(readManifest(dir).name).toBe("demo");
    removeDir(dir);
  });
});
