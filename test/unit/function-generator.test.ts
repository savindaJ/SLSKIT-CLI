import { generateFunction } from "../../src/commands/function/generator";
import type { ServiceDef, ServiceFunction } from "../../src/commands/init/types";
import { fullStackAnswers, minimalAnswers, pythonAnswers } from "../helpers/fixtures";

const authApp: ServiceDef = {
  name: "auth",
  functions: [
    { name: "login", httpPath: "/auth/login", method: "POST" },
    { name: "register", httpPath: "/auth/register", method: "POST" },
  ],
};

function fn(overrides: Partial<ServiceFunction> = {}): ServiceFunction {
  return {
    name: "resetPassword",
    httpPath: "/auth/resetPassword",
    method: "POST",
    ...overrides,
  };
}

describe("generateFunction", () => {
  it("adds a same-runtime function to an existing app, attaching the layer", () => {
    const result = generateFunction(
      fullStackAnswers,
      [authApp],
      "auth",
      false,
      fn({ runtime: "typescript", memorySize: 512 }),
      []
    );

    expect(result.rootTemplatePath).toBeUndefined();
    expect(result.files["src/functions/auth/resetPassword/handler.ts"]).toBeDefined();
    expect(result.files["src/services/auth/resetPassword.ts"]).toBeDefined();

    const template = result.files[result.appTemplatePath];
    expect(template).toMatch(/ResetPasswordFunction/);
    expect(template).toMatch(/LoginFunction/); // existing function preserved
    expect(template).toMatch(/Layers:\n\s+- !Ref SharedLayer/);
    expect(template).toMatch(/MemorySize: 512/);
  });

  it("generates a standalone function with no layer or db when the runtime family differs", () => {
    const result = generateFunction(
      fullStackAnswers, // typescript project with dynamodb + layer
      [authApp],
      "auth",
      false,
      fn({ name: "pyCheck", httpPath: "/auth/pyCheck", runtime: "python" }),
      []
    );

    const service = result.files["src/services/auth/pyCheck.py"];
    expect(service).toBeDefined();
    expect(service).not.toMatch(/dynamodb|prisma|mongo/i);

    const template = result.files[result.appTemplatePath];
    const functionBlock = template.slice(template.indexOf("PyCheckFunction"));
    expect(functionBlock).not.toMatch(/Layers:/);
    expect(functionBlock).not.toMatch(/Policies:/);
  });

  it("creates a new SAM app and updates the root template", () => {
    const result = generateFunction(
      fullStackAnswers,
      [authApp],
      "ops",
      true,
      fn({ name: "healthCheck", httpPath: "/ops/healthCheck", method: "GET" }),
      []
    );

    expect(result.rootTemplatePath).toBe("template.yaml");
    expect(result.files["template.yaml"]).toMatch(/OpsStack/);
    expect(result.files["template.yaml"]).toMatch(/Location: templates\/ops\.yaml/);
    expect(result.files["templates/ops.yaml"]).toMatch(/Description: ops service/);
  });

  it("does not touch the root template when adding to an existing app", () => {
    const existingApp: ServiceDef = {
      name: "auth",
      functions: [{ name: "login", httpPath: "/auth/login", method: "POST" }],
    };

    const result = generateFunction(
      minimalAnswers,
      [existingApp],
      "auth",
      false,
      fn(),
      []
    );

    expect(result.rootTemplatePath).toBeUndefined();
    expect(result.appTemplatePath).toBe("templates/auth.yaml");
  });

  it("writes __init__.py markers for a new python function", () => {
    const app: ServiceDef = { name: "auth", functions: [] };
    const result = generateFunction(
      pythonAnswers,
      [app],
      "auth",
      false,
      fn({ runtime: "python" }),
      []
    );

    expect(result.files["src/__init__.py"]).toBe("");
    expect(result.files["src/functions/auth/__init__.py"]).toBe("");
    expect(result.files["src/functions/auth/resetPassword/__init__.py"]).toBe("");
    expect(result.files["src/services/auth/__init__.py"]).toBe("");
  });

  it("rebuilds slskit.json including previously generated files", () => {
    const result = generateFunction(
      fullStackAnswers,
      [authApp],
      "auth",
      false,
      fn({ runtime: "typescript" }),
      ["README.md", "package.json"]
    );

    const manifest = JSON.parse(result.files["slskit.json"]) as {
      structure: { files: string[] };
      applications: Array<{ name: string; functions: Array<{ name: string }> }>;
    };

    expect(manifest.structure.files).toContain("README.md");
    expect(manifest.structure.files).toContain("src/functions/auth/resetPassword/handler.ts");
    const auth = manifest.applications.find((app) => app.name === "auth");
    expect(auth?.functions.map((f) => f.name).sort()).toEqual([
      "login",
      "register",
      "resetPassword",
    ]);
  });
});
