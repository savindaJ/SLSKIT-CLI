import fs from "node:fs";
import { CliError } from "../../src/core/errors";
import {
  readProjectManifest,
  toInitAnswers,
  toServiceDefs,
} from "../../src/commands/function/manifest";
import type { ProjectManifest } from "../../src/commands/function/types";
import { createTempDir, removeDir } from "../helpers/cli";

function sampleManifest(overrides: Partial<ProjectManifest> = {}): ProjectManifest {
  return {
    name: "demo-app",
    runtime: { id: "typescript" },
    framework: { id: "sam" },
    database: { id: "dynamodb" },
    apiGateway: { enabled: true },
    layer: { enabled: true },
    functions: { memorySize: 512 },
    applications: [
      {
        name: "auth",
        functions: [
          {
            name: "login",
            handlerFile: "src/functions/auth/login/handler.ts",
            memorySize: 512,
            apiGateway: { enabled: true, path: "/auth/login", method: "POST" },
          },
          {
            name: "sync",
            handlerFile: "src/functions/auth/sync/handler.py",
            memorySize: 256,
            apiGateway: { enabled: true, path: "/auth/sync", method: "GET" },
          },
        ],
      },
    ],
    structure: { files: ["README.md", "sless.json"] },
    ...overrides,
  };
}

describe("readProjectManifest", () => {
  let dir: string;

  beforeEach(() => {
    dir = createTempDir("slskit-fn-manifest-");
  });

  afterEach(() => {
    removeDir(dir);
  });

  it("throws when sless.json is missing", () => {
    expect(() => readProjectManifest(dir)).toThrow(CliError);
  });

  it("rejects a project that is not AWS SAM", () => {
    fs.writeFileSync(
      `${dir}/sless.json`,
      JSON.stringify(sampleManifest({ framework: { id: "serverless" } }))
    );
    expect(() => readProjectManifest(dir)).toThrow(/supports AWS SAM projects only/);
  });

  it("reads a valid manifest", () => {
    fs.writeFileSync(`${dir}/sless.json`, JSON.stringify(sampleManifest()));
    const manifest = readProjectManifest(dir);
    expect(manifest.name).toBe("demo-app");
  });
});

describe("toInitAnswers", () => {
  it("reconstructs project-level answers from the manifest", () => {
    const answers = toInitAnswers(sampleManifest());
    expect(answers).toEqual({
      name: "demo-app",
      runtime: "typescript",
      database: "dynamodb",
      apiGateway: true,
      layer: true,
      memorySize: 512,
      force: false,
    });
  });
});

describe("toServiceDefs", () => {
  it("recovers each function's language from its handler file extension", () => {
    const apps = toServiceDefs(sampleManifest());
    const auth = apps.find((app) => app.name === "auth");

    expect(auth?.functions.find((fn) => fn.name === "login")?.runtime).toBe("typescript");
    expect(auth?.functions.find((fn) => fn.name === "sync")?.runtime).toBe("python");
  });

  it("carries over http path, method, and memory size", () => {
    const apps = toServiceDefs(sampleManifest());
    const login = apps[0].functions.find((fn) => fn.name === "login");

    expect(login?.httpPath).toBe("/auth/login");
    expect(login?.method).toBe("POST");
    expect(login?.memorySize).toBe(512);
  });

  it("falls back to a derived path and GET when API Gateway is disabled for a function", () => {
    const manifest = sampleManifest({
      applications: [
        {
          name: "auth",
          functions: [
            {
              name: "login",
              handlerFile: "src/functions/auth/login/handler.js",
              memorySize: 128,
              apiGateway: { enabled: false },
            },
          ],
        },
      ],
    });

    const apps = toServiceDefs(manifest);
    expect(apps[0].functions[0].httpPath).toBe("/auth/login");
    expect(apps[0].functions[0].method).toBe("GET");
    expect(apps[0].functions[0].runtime).toBe("javascript");
  });
});
