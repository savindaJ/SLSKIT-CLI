import { resourceIdsFor } from "../../src/commands/deploy/scope";
import { allScope, functionScope, serviceScope } from "../../src/core/scope";
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

describe("serviceScope", () => {
  it("collects every function in the service", () => {
    const scope = serviceScope(manifest(), "auth");

    expect(scope.kind).toBe("service");
    expect(resourceIdsFor(manifest(), scope)).toEqual([
      "AuthStack/LoginFunction",
      "AuthStack/RegisterFunction",
    ]);
    expect(scope.label).toMatch(/2 functions/);
  });

  // Deploys always go through the nested service stacks, whichever API mode the
  // project uses, so the id is always qualified by its stack.
  it("keeps the stack prefix in a shared-API project too", () => {
    expect(resourceIdsFor(manifest(false), serviceScope(manifest(false), "auth"))).toEqual([
      "AuthStack/LoginFunction",
      "AuthStack/RegisterFunction",
    ]);
  });

  it("names the services that do exist when one is misspelled", () => {
    expect(() => serviceScope(manifest(), "auths")).toThrow(/auth, product, empty/);
  });

  it("refuses a service with nothing in it", () => {
    expect(() => serviceScope(manifest(), "empty")).toThrow(/has no functions/);
  });
});

describe("functionScope", () => {
  // Function names are unique project-wide, so the service is derived rather than asked for.
  it("finds the function's service on its own", () => {
    const scope = functionScope(manifest(), "getProducts");

    expect(scope).toMatchObject({ kind: "function", service: "product" });
    expect(resourceIdsFor(manifest(), scope)).toEqual([
      "ProductStack/GetProductsFunction",
    ]);
  });

  it("lists the known functions when one is misspelled", () => {
    expect(() => functionScope(manifest(), "getProduct")).toThrow(
      /login, register, getProducts/
    );
  });
});

describe("allScope", () => {
  it("targets no individual resources", () => {
    expect(allScope.kind).toBe("all");
    expect(resourceIdsFor(manifest(), allScope)).toEqual([]);
  });
});
