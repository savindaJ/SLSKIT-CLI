import { buildFileMap } from "../../src/commands/init/content";
import { buildSlessManifest } from "../../src/commands/init/manifest";
import { LAMBDA_APPS } from "../../src/commands/init/types";
import { fullStackAnswers, minimalAnswers } from "../helpers/fixtures";

describe("buildSlessManifest", () => {
  it("includes complete project metadata", () => {
    const files = buildFileMap(fullStackAnswers);
    const manifest = buildSlessManifest(fullStackAnswers, LAMBDA_APPS, Object.keys(files)) as Record<
      string,
      unknown
    >;

    expect(manifest.name).toBe("my-serverless-app");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.generatedBy).toBe("slskit");
  });

  it("lists all applications and functions", () => {
    const files = buildFileMap(fullStackAnswers);
    const manifest = buildSlessManifest(fullStackAnswers, LAMBDA_APPS, Object.keys(files)) as {
      applications: Array<{ name: string; functions: Array<{ id: string }> }>;
    };

    expect(manifest.applications).toHaveLength(LAMBDA_APPS.length);
    const functionIds = manifest.applications.flatMap((app) =>
      app.functions.map((fn) => fn.id)
    );
    expect(functionIds.sort()).toEqual([
      "auth.login",
      "auth.register",
      "product.createProduct",
      "product.getProducts",
    ]);
  });

  it("includes API Gateway routes when enabled", () => {
    const files = buildFileMap(fullStackAnswers);
    const manifest = buildSlessManifest(fullStackAnswers, LAMBDA_APPS, Object.keys(files)) as {
      apiGateway: { enabled: boolean; routes: Array<{ path: string }> };
    };

    expect(manifest.apiGateway.enabled).toBe(true);
    expect(manifest.apiGateway.routes).toHaveLength(4);
    expect(manifest.apiGateway.routes.some((route) => route.path === "/products")).toBe(true);
  });

  it("disables API Gateway when not enabled", () => {
    const files = buildFileMap(minimalAnswers);
    const manifest = buildSlessManifest(minimalAnswers, LAMBDA_APPS, Object.keys(files)) as {
      apiGateway: { enabled: boolean; routes?: unknown[] };
    };

    expect(manifest.apiGateway.enabled).toBe(false);
    expect(manifest.apiGateway.routes).toBeUndefined();
  });

  it("attaches layer metadata to every function", () => {
    const files = buildFileMap(fullStackAnswers);
    const manifest = buildSlessManifest(fullStackAnswers, LAMBDA_APPS, Object.keys(files)) as {
      layer: { enabled: boolean; attachedTo: string[] };
    };

    expect(manifest.layer.enabled).toBe(true);
    expect(manifest.layer.attachedTo).toHaveLength(4);
  });

  it("records memory size on functions and global config", () => {
    const files = buildFileMap(fullStackAnswers);
    const manifest = buildSlessManifest(fullStackAnswers, LAMBDA_APPS, Object.keys(files)) as {
      functions: { memorySize: number };
      applications: Array<{ functions: Array<{ memorySize: number }> }>;
    };

    expect(manifest.functions.memorySize).toBe(512);
    for (const app of manifest.applications) {
      for (const fn of app.functions) {
        expect(fn.memorySize).toBe(512);
      }
    }
  });

  it("includes sorted structure files list", () => {
    const files = buildFileMap(fullStackAnswers);
    const manifest = buildSlessManifest(fullStackAnswers, LAMBDA_APPS, Object.keys(files)) as {
      structure: { files: string[] };
    };

    const sorted = [...manifest.structure.files].sort();
    expect(manifest.structure.files).toEqual(sorted);
    expect(manifest.structure.files).toContain("sless.json");
  });
});
