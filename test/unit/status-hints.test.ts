import { buildHints } from "../../src/commands/status/hints";
import type { HintInput } from "../../src/commands/status/hints";
import type { DeployedFunction, FunctionStatus } from "../../src/commands/status/types";

function lambda(name: string, variableNames: string[] = ["APP_ENVIRONMENT"]): DeployedFunction {
  return { name, runtime: "nodejs20.x", memorySize: 256, variableNames };
}

function declared(name: string, deployed?: DeployedFunction): FunctionStatus {
  return { name, service: "auth", physical: `shop-dev-${name}`, deployed };
}

function input(overrides: Partial<HintInput> = {}): HintInput {
  const login = lambda("shop-dev-login");

  return {
    environment: "dev",
    functions: [declared("login", login)],
    deployed: [login],
    declaredVariables: [],
    health: "ok",
    stackStatus: "UPDATE_COMPLETE",
    ...overrides,
  };
}

describe("buildHints", () => {
  it("says nothing when the project and the stack agree", () => {
    expect(buildHints(input())).toEqual([]);
  });

  it("warns that an in-progress stack is still moving", () => {
    const hints = buildHints(input({ health: "busy", stackStatus: "UPDATE_IN_PROGRESS" }));
    expect(hints[0]).toContain("UPDATE_IN_PROGRESS");
    expect(hints[0]).toContain("will move");
  });

  it("warns that a rolled-back stack may be serving the previous version", () => {
    const hints = buildHints(
      input({ health: "failed", stackStatus: "UPDATE_ROLLBACK_COMPLETE" })
    );
    expect(hints[0]).toContain("did not finish cleanly");
  });

  it("carries a missing secret forward as a hint", () => {
    const hints = buildHints(
      input({ secretError: 'Variable "API_KEY" is marked secret but is missing from .env.dev.' })
    );
    expect(hints[0]).toContain("API_KEY");
    expect(hints[0]).toContain("will stop until it has a value");
  });

  it("names functions the project declares but AWS does not have", () => {
    const hints = buildHints(
      input({ functions: [declared("login", lambda("shop-dev-login")), declared("list")] })
    );
    expect(hints[0]).toContain('"list"');
    expect(hints[0]).toContain("slskit deploy dev --all");
  });

  // "slskit rm" only changes the project, so this is the drift it leaves behind.
  it("names functions AWS still has that the project has dropped", () => {
    const login = lambda("shop-dev-login");
    const removed = lambda("shop-dev-oldHandler");

    const hints = buildHints(
      input({ functions: [declared("login", login)], deployed: [login, removed] })
    );

    expect(hints[0]).toContain("shop-dev-oldHandler");
    expect(hints[0]).toContain("A full deploy removes it");
  });

  it("names variables that have not reached the deployed functions", () => {
    const hints = buildHints(
      input({
        functions: [declared("login", lambda("shop-dev-login", ["APP_ENVIRONMENT"]))],
        deployed: [lambda("shop-dev-login", ["APP_ENVIRONMENT"])],
        declaredVariables: ["LOG_LEVEL"],
      })
    );

    expect(hints[0]).toContain('"LOG_LEVEL"');
    expect(hints[0]).toContain("a template change");
  });

  it("names variables AWS still has that the project has dropped", () => {
    const live = lambda("shop-dev-login", ["APP_ENVIRONMENT", "OLD_FLAG"]);

    const hints = buildHints(
      input({ functions: [declared("login", live)], deployed: [live], declaredVariables: [] })
    );

    expect(hints[0]).toContain('"OLD_FLAG"');
    expect(hints[0]).toContain("no longer declared");
  });

  // APP_ENVIRONMENT is generated for every environment and is never declared as a
  // normal variable, so it must never be reported as stale.
  it("never reports APP_ENVIRONMENT as stale", () => {
    expect(buildHints(input({ declaredVariables: [] }))).toEqual([]);
  });

  it("says nothing about variables when nothing is deployed", () => {
    expect(
      buildHints(
        input({ functions: [declared("login")], deployed: [], declaredVariables: ["LOG_LEVEL"] })
      ).filter((hint) => hint.includes("LOG_LEVEL"))
    ).toEqual([]);
  });

  it("pluralises a list of several", () => {
    const hints = buildHints(
      input({ functions: [declared("login"), declared("list")], deployed: [] })
    );
    expect(hints[0]).toContain('"login", "list" are in slskit.json');
  });
});
