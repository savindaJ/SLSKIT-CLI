import { classifyChange, planRebuild, resourceIdFor } from "../../src/commands/run/resources";
import type { ApplicationView } from "../../src/commands/run/resources";

const applications: ApplicationView[] = [
  { name: "auth", functions: [{ name: "login" }, { name: "register" }] },
  { name: "product", functions: [{ name: "getProducts" }] },
];

const classify = (file: string) => classifyChange(applications, file);

describe("resourceIdFor", () => {
  it("names the nested stack and the function the way the templates do", () => {
    expect(resourceIdFor("auth", "login")).toBe("AuthStack/LoginFunction");
    expect(resourceIdFor("product", "getProducts")).toBe(
      "ProductStack/GetProductsFunction"
    );
  });

  // One shared API Gateway means a single flat template, where there is no stack to
  // qualify the function with -- "sam build AuthStack/LoginFunction" would not resolve.
  it("drops the stack prefix when every function shares one API", () => {
    expect(resourceIdFor("auth", "login", true)).toBe("LoginFunction");
  });
});

describe("classifyChange with one shared API Gateway", () => {
  it("targets the function without a stack prefix", () => {
    expect(
      classifyChange(applications, "src/services/product/getProducts.ts", true)
    ).toMatchObject({ kind: "function", resourceId: "GetProductsFunction" });
  });
});

describe("classifyChange", () => {
  it("maps a handler to just its own function", () => {
    expect(classify("src/functions/auth/login/handler.ts")).toEqual({
      kind: "function",
      resourceId: "AuthStack/LoginFunction",
      label: "auth/login",
    });
  });

  it("maps a service module to the function that delegates to it", () => {
    expect(classify("src/services/product/getProducts.ts")).toMatchObject({
      kind: "function",
      resourceId: "ProductStack/GetProductsFunction",
    });
  });

  // The layer is attached to every function in every stack, so nothing narrower works.
  it("treats shared code as a full rebuild", () => {
    expect(classify("src/shared/logger.ts").kind).toBe("full");
    expect(classify("src/shared/nodejs/logger.js").kind).toBe("full");
  });

  it("falls back to a full rebuild for a service no function is named after", () => {
    expect(classify("src/services/product/pricing.ts").kind).toBe("full");
    expect(classify("src/services/unknownApp/getProducts.ts").kind).toBe("full");
  });

  // Routes and parameter values are read once, when sam starts.
  it("asks for a restart when the template or the variables change", () => {
    expect(classify("template.yaml").kind).toBe("restart");
    expect(classify("templates/auth.yaml").kind).toBe("restart");
    expect(classify(".env.dev").kind).toBe("restart");
    expect(classify("slskit.json").kind).toBe("restart");
  });
});

describe("planRebuild", () => {
  it("collapses a burst of edits to the set of functions to rebuild", () => {
    const plan = planRebuild([
      classify("src/functions/auth/login/handler.ts"),
      classify("src/services/auth/login.ts"),
      classify("src/services/product/getProducts.ts"),
    ]);

    expect(plan.kind).toBe("function");
    expect(plan.resourceIds).toEqual([
      "AuthStack/LoginFunction",
      "ProductStack/GetProductsFunction",
    ]);
  });

  it("lets the most disruptive change in a batch win", () => {
    expect(
      planRebuild([classify("src/functions/auth/login/handler.ts"), classify("src/shared/logger.ts")])
        .kind
    ).toBe("full");

    expect(
      planRebuild([classify("src/shared/logger.ts"), classify(".env.dev")]).kind
    ).toBe("restart");
  });
});
