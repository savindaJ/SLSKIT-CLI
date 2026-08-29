import {
  applicationNameProblem,
  functionHttpPath,
  functionNameProblem,
} from "../../src/commands/function/prompts";
import type { ProjectManifest } from "../../src/commands/function/types";

function manifest(): ProjectManifest {
  return {
    name: "shop",
    framework: { id: "sam" },
    runtime: { id: "typescript" },
    database: { id: "none" },
    functions: { memorySize: 128 },
    apiGateway: { enabled: true },
    layer: { enabled: false },
    applications: [
      {
        name: "auth",
        functions: [
          {
            name: "login",
            handlerFile: "src/functions/auth/login/handler.ts",
            memorySize: 128,
            apiGateway: { enabled: true, path: "/auth/login", method: "POST" },
          },
        ],
      },
      {
        name: "category",
        functions: [
          {
            name: "list",
            handlerFile: "src/functions/category/list/handler.ts",
            memorySize: 128,
            apiGateway: { enabled: true, path: "/category/list", method: "GET" },
          },
        ],
      },
    ],
    structure: { files: [] },
  } as unknown as ProjectManifest;
}

describe("functionHttpPath", () => {
  it("is the route the generator gives a new function", () => {
    expect(functionHttpPath("billing", "list")).toBe("/billing/list");
  });
});

describe("functionNameProblem", () => {
  it("accepts a name nothing else uses", () => {
    expect(functionNameProblem(manifest(), "auth", "logout")).toBeUndefined();
  });

  it("rejects a name already used in the same application", () => {
    expect(functionNameProblem(manifest(), "auth", "login")).toMatch(
      /already exists in application "auth"/
    );
  });

  // The Lambda is physically named <project>-<environment>-<function>, and a shared
  // API Gateway makes the template's logical id <Name>Function -- both project-wide.
  // A duplicate used to overwrite the first function with no error from slskit, sam
  // validate or sam build.
  it("rejects a name already used in a different application", () => {
    const problem = functionNameProblem(manifest(), "billing", "list");

    expect(problem).toMatch(/already exists in application "category"/);
    expect(problem).toMatch(/every function in a project needs its own name/);
  });

  it("ignores case when comparing, since AWS resource names collide anyway", () => {
    expect(functionNameProblem(manifest(), "billing", "List")).toBeDefined();
  });

  it("rejects a name that is not a usable identifier", () => {
    expect(functionNameProblem(manifest(), "auth", "2fa")).toMatch(/must start with a letter/);
    expect(functionNameProblem(manifest(), "auth", "reset-password")).toBeDefined();
  });
});

describe("applicationNameProblem", () => {
  it("accepts a new application name", () => {
    expect(applicationNameProblem(manifest(), "billing")).toBeUndefined();
  });

  it("rejects one that exists and points at --app", () => {
    expect(applicationNameProblem(manifest(), "auth")).toMatch(/--app auth/);
  });
});
