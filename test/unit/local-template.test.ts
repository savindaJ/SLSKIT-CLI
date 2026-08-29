import fs from "node:fs";
import path from "node:path";
import {
  LOCAL_TEMPLATE_FILE,
  needsLocalTemplate,
  writeLocalTemplate,
} from "../../src/commands/run/local-template";
import { buildFileMap } from "../../src/commands/init/content";
import { sharedApiAnswers, minimalAnswers } from "../helpers/fixtures";
import type { ProjectManifest } from "../../src/core/environments";
import { createTempDir, removeDir } from "../helpers/cli";
import { functionScope, serviceScope } from "../../src/core/scope";

function manifestFor(shared: boolean): ProjectManifest {
  const answers = shared
    ? sharedApiAnswers
    : { ...minimalAnswers, apiGateway: true, sharedApi: false };
  return JSON.parse(buildFileMap(answers)["slskit.json"]) as ProjectManifest;
}

describe("needsLocalTemplate", () => {
  // sam local cannot resolve an API that a nested stack only holds an id for; every
  // route comes back 502. Per-service APIs live in the template that uses them, so
  // those run from the real files.
  it("is true only when the services share one API Gateway", () => {
    expect(needsLocalTemplate(manifestFor(true))).toBe(true);
    expect(needsLocalTemplate(manifestFor(false))).toBe(false);
  });

  it("is false for a project with no API at all", () => {
    const manifest = JSON.parse(
      buildFileMap({ ...minimalAnswers, apiGateway: false })["slskit.json"]
    ) as ProjectManifest;

    expect(needsLocalTemplate(manifest)).toBe(false);
  });
});

describe("writeLocalTemplate", () => {
  it("flattens every service into one servable template", () => {
    const dir = createTempDir("slskit-local-");
    const manifest = manifestFor(true);

    const written = writeLocalTemplate(dir, manifest);
    const body = fs.readFileSync(path.join(dir, written), "utf8");

    expect(written).toBe(LOCAL_TEMPLATE_FILE);
    // One API that the functions attach to through ordinary SAM events, which is the
    // only shape sam local understands.
    expect(body.match(/Type: AWS::Serverless::HttpApi/g) ?? []).toHaveLength(1);
    expect(body).toMatch(/ApiId: !Ref HttpApi$/m);
    expect(body).not.toMatch(/AWS::Serverless::Application/);
    expect(body).not.toMatch(/AWS::ApiGatewayV2::Route/);

    for (const fn of ["LoginFunction", "RegisterFunction", "GetProductsFunction"]) {
      expect(body).toMatch(new RegExp(`^ {2}${fn}:$`, "m"));
    }

    // It sits at the project root, so "./" resolves the same way it does for a deploy.
    expect(body).toMatch(/CodeUri: \.\//);
    removeDir(dir);
  });

  it("is regenerated from the manifest, so it cannot drift from the real templates", () => {
    const dir = createTempDir("slskit-local-drift-");
    const manifest = manifestFor(true);

    writeLocalTemplate(dir, manifest);
    const first = fs.readFileSync(path.join(dir, LOCAL_TEMPLATE_FILE), "utf8");
    writeLocalTemplate(dir, manifest);

    expect(fs.readFileSync(path.join(dir, LOCAL_TEMPLATE_FILE), "utf8")).toBe(first);
    removeDir(dir);
  });
});

// Narrowing the template is what makes a scoped run fast: sam only builds the
// functions that are still in it.
describe("writeLocalTemplate with a scope", () => {
  const functionsIn = (body: string): string[] =>
    (body.match(/^ {2}([A-Za-z]+)Function:$/gm) ?? []).map((line) => line.trim());

  it("keeps only the chosen service's functions", () => {
    const dir = createTempDir("slskit-local-svc-");
    const manifest = manifestFor(true);

    writeLocalTemplate(dir, manifest, serviceScope(manifest, "auth"));
    const body = fs.readFileSync(path.join(dir, LOCAL_TEMPLATE_FILE), "utf8");

    expect(functionsIn(body)).toEqual(["LoginFunction:", "RegisterFunction:"]);
    expect(body).not.toMatch(/GetProductsFunction/);
    removeDir(dir);
  });

  it("keeps only the one chosen function", () => {
    const dir = createTempDir("slskit-local-fn-");
    const manifest = manifestFor(true);

    writeLocalTemplate(dir, manifest, functionScope(manifest, "getProducts"));
    const body = fs.readFileSync(path.join(dir, LOCAL_TEMPLATE_FILE), "utf8");

    expect(functionsIn(body)).toEqual(["GetProductsFunction:"]);
    // Still a complete, servable template rather than a fragment.
    expect(body).toMatch(/Type: AWS::Serverless::HttpApi/);
    expect(body).toMatch(/^Resources:$/m);
    removeDir(dir);
  });

  it("keeps everything for the default scope", () => {
    const dir = createTempDir("slskit-local-all-");

    writeLocalTemplate(dir, manifestFor(true));
    const body = fs.readFileSync(path.join(dir, LOCAL_TEMPLATE_FILE), "utf8");

    expect(functionsIn(body)).toHaveLength(4);
    removeDir(dir);
  });
});
