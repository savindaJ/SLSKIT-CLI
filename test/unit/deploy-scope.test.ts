import {
  allScope,
  functionScope,
  serviceScope,
  sharesOneApi,
} from "../../src/commands/deploy/scope";
import type { ProjectManifest } from "../../src/core/environments";

function manifest(perService = true): ProjectManifest {
  return {
    name: "shop",
    apiGateway: { enabled: true, perService },
    applications: [
      { name: "auth", functions: [{ name: "login" }, { name: "register" }] },
      { name: "product", functions: [{ name: "getProducts" }] },
      { name: "empty", functions: [] },
    ],
  } as unknown as ProjectManifest;
}

describe("sharesOneApi", () => {
  it("is true only when the project has one flat template", () => {
    expect(sharesOneApi(manifest(true))).toBe(false);
    expect(sharesOneApi(manifest(false))).toBe(true);
  });
});

describe("serviceScope", () => {
  it("collects every function in the service", () => {
    const scope = serviceScope(manifest(), "auth");

    expect(scope.kind).toBe("service");
    expect(scope.resourceIds).toEqual([
      "AuthStack/LoginFunction",
      "AuthStack/RegisterFunction",
    ]);
    expect(scope.label).toMatch(/2 functions/);
  });

  // With one shared API Gateway there is no nested stack to qualify the id with.
  it("drops the stack prefix in a shared-API project", () => {
    expect(serviceScope(manifest(false), "auth").resourceIds).toEqual([
      "LoginFunction",
      "RegisterFunction",
    ]);
  });

  it("names the services that do exist when one is misspelled", () => {
    expect(() => serviceScope(manifest(), "auths")).toThrow(/auth, product, empty/);
  });

  it("refuses a service with nothing in it", () => {
    expect(() => serviceScope(manifest(), "empty")).toThrow(/no functions to deploy/);
  });
});

describe("functionScope", () => {
  // Function names are unique project-wide, so the service is derived rather than asked for.
  it("finds the function's service on its own", () => {
    const scope = functionScope(manifest(), "getProducts");

    expect(scope).toMatchObject({
      kind: "function",
      service: "product",
      resourceIds: ["ProductStack/GetProductsFunction"],
    });
  });

  it("lists the known functions when one is misspelled", () => {
    expect(() => functionScope(manifest(), "getProduct")).toThrow(
      /login, register, getProducts/
    );
  });
});

describe("allScope", () => {
  it("targets no individual resources", () => {
    expect(allScope).toMatchObject({ kind: "all", resourceIds: [] });
  });
});
