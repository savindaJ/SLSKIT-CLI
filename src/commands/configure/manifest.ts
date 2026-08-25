import { readManifest, writeManifest } from "../../core/manifest.js";
import type { ConfigurableManifest, StageConfig } from "./types.js";

export function readConfigurableManifest(cwd: string): ConfigurableManifest {
  return readManifest(cwd, "slskit configure");
}

// Spreads the existing manifest so unrelated keys survive untouched; only the
// deployment block is replaced. The first stage configured becomes the default,
// and any environment variables already recorded for the stage are preserved.
export function writeStageConfig(
  cwd: string,
  manifest: ConfigurableManifest,
  stage: string,
  config: StageConfig
): void {
  const deployment = manifest.deployment;
  const existingEnv = deployment?.stages?.[stage]?.env;

  writeManifest(cwd, {
    ...manifest,
    deployment: {
      defaultStage: deployment?.defaultStage ?? stage,
      stages: {
        ...deployment?.stages,
        [stage]: existingEnv ? { ...config, env: existingEnv } : config,
      },
    },
  });
}
