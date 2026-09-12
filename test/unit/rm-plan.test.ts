import { planRemoval, pruneGeneratedFiles } from "../../src/commands/rm/plan";
import { CliError } from "../../src/core/errors";
import type { ServiceDef } from "../../src/commands/init/types";
import { fullStackAnswers, pythonAnswers } from "../helpers/fixtures";

function apps(): ServiceDef[] {
  return [
    {
      name: "auth",
      functions: [
        { name: "login", httpPath: "/auth/login", method: "POST" },
        { name: "register", httpPath: "/auth/register", method: "POST" },
      ],
    },
    {
      name: "product",
      functions: [{ name: "getProducts", httpPath: "/products", method: "GET" }],
    },
  ];
}

describe("planRemoval", () => {
  it("removes one function and leaves the rest of its application alone", () => {
    const plan = planRemoval(fullStackAnswers, apps(), {
      kind: "function",
      appName: "auth",
      functionName: "login",
    });

    expect(plan.kind).toBe("function");
    expect(plan.cascadesToService).toBe(false);
    expect(plan.paths).toEqual([
      "src/functions/auth/login",
      "src/services/auth/login.ts",
    ]);
    expect(plan.routes).toEqual(["POST /auth/login"]);

    const auth = plan.apps.find((app) => app.name === "auth");
    expect(auth?.functions.map((fn) => fn.name)).toEqual(["register"]);
    expect(plan.apps.map((app) => app.name)).toEqual(["auth", "product"]);
  });

  it("uses the function's own runtime for the service file it deletes", () => {
    const withPython = apps();
    withPython[0].functions[0].runtime = "python";

    const plan = planRemoval(fullStackAnswers, withPython, {
      kind: "function",
      appName: "auth",
      functionName: "login",
    });

    expect(plan.paths).toContain("src/services/auth/login.py");
  });

  it("removes the application too when its last function goes", () => {
    const plan = planRemoval(fullStackAnswers, apps(), {
      kind: "function",
      appName: "product",
      functionName: "getProducts",
    });

    expect(plan.cascadesToService).toBe(true);
    expect(plan.paths).toEqual([
      "src/functions/product",
      "src/services/product",
      "templates/product.yaml",
    ]);
    expect(plan.apps.map((app) => app.name)).toEqual(["auth"]);
  });

  it("removes an application and every function in it", () => {
    const plan = planRemoval(pythonAnswers, apps(), {
      kind: "service",
      appName: "auth",
    });

    expect(plan.kind).toBe("service");
    expect(plan.functionsRemoved).toEqual(["login", "register"]);
    expect(plan.routes).toEqual(["POST /auth/login", "POST /auth/register"]);
    expect(plan.apps.map((app) => app.name)).toEqual(["product"]);
  });

  it("refuses to empty the project, since a stack needs at least one resource", () => {
    const single: ServiceDef[] = [
      { name: "auth", functions: [{ name: "login", httpPath: "/auth/login", method: "POST" }] },
    ];

    expect(() =>
      planRemoval(fullStackAnswers, single, {
        kind: "function",
        appName: "auth",
        functionName: "login",
      })
    ).toThrow(CliError);

    expect(() =>
      planRemoval(fullStackAnswers, single, { kind: "service", appName: "auth" })
    ).toThrow(/no functions/);
  });

  it("reports an unknown application and function by name", () => {
    expect(() =>
      planRemoval(fullStackAnswers, apps(), { kind: "service", appName: "billing" })
    ).toThrow(/Existing: auth, product/);

    expect(() =>
      planRemoval(fullStackAnswers, apps(), {
        kind: "function",
        appName: "auth",
        functionName: "nope",
      })
    ).toThrow(/Existing: login, register/);
  });
});

describe("pruneGeneratedFiles", () => {
  it("drops the removed file and anything nested under a removed directory", () => {
    const files = [
      "src/functions/auth/login/handler.ts",
      "src/functions/auth/login/__init__.py",
      "src/functions/auth/register/handler.ts",
      "src/services/auth/login.ts",
      "template.yaml",
    ];

    expect(
      pruneGeneratedFiles(files, ["src/functions/auth/login", "src/services/auth/login.ts"])
    ).toEqual(["src/functions/auth/register/handler.ts", "template.yaml"]);
  });

  it("does not drop a sibling whose name merely starts the same", () => {
    const files = ["src/functions/auth/login/handler.ts", "src/functions/auth/loginWithSso/handler.ts"];

    expect(pruneGeneratedFiles(files, ["src/functions/auth/login"])).toEqual([
      "src/functions/auth/loginWithSso/handler.ts",
    ]);
  });
});
