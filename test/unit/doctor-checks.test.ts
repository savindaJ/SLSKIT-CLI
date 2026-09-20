jest.mock("node:child_process", () => ({
  ...jest.requireActual("node:child_process"),
  spawnSync: jest.fn(),
}));

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  checkAwsCli,
  checkDocker,
  checkNode,
  checkSamCli,
  requiredNodeMajor,
} from "../../src/commands/doctor/checks";
import {
  checkEnvironment,
  checkProject,
  checkVariables,
} from "../../src/commands/doctor/project";
import { scaffoldProject } from "../../src/commands/init/scaffold";
import { minimalAnswers } from "../helpers/fixtures";
import { createTempDir, removeDir } from "../helpers/cli";

const mockSpawnSync = spawnSync as unknown as jest.Mock;

function found(stdout: string): Record<string, unknown> {
  return { error: null, status: 0, stdout, stderr: "" };
}

const NOT_ON_PATH = {
  error: Object.assign(new Error("spawnSync ENOENT"), { code: "ENOENT" }),
  status: null,
  stdout: "",
  stderr: "",
};

beforeEach(() => {
  mockSpawnSync.mockReset();
  // A benign default so helpers that shell out (npm install inside the scaffold)
  // succeed; every test that cares about a probe overrides it.
  mockSpawnSync.mockReturnValue(found(""));
});

describe("checkNode", () => {
  it("passes on the required major", () => {
    expect(checkNode("18.20.4", 18)).toMatchObject({ status: "ok", detail: "v18.20.4" });
  });

  it("passes on a newer major", () => {
    expect(checkNode("22.1.0", 18).status).toBe("ok");
  });

  it("fails below the required major, and names the version to install", () => {
    const result = checkNode("16.20.0", 18);
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("v16.20.0");
    expect(result.fix).toContain("18");
  });

  // The engine range in package.json is what npm enforces, so the check has to read
  // the same number rather than carry its own copy.
  it("takes the required major from package.json engines", () => {
    const engines = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, "../../package.json"), "utf8")
    ).engines.node as string;

    expect(requiredNodeMajor()).toBe(Number(/\d+/.exec(engines)![0]));
  });
});

describe("checkSamCli", () => {
  it("reports the version when sam answers", () => {
    mockSpawnSync.mockReturnValue(found("SAM CLI, version 1.120.0"));
    expect(checkSamCli()).toMatchObject({ status: "ok", detail: "1.120.0" });
  });

  it("fails when sam is not installed", () => {
    mockSpawnSync.mockReturnValue(NOT_ON_PATH);
    const result = checkSamCli();
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("not found on your PATH");
    expect(result.fix).toContain("install-sam-cli");
  });
});

describe("checkAwsCli", () => {
  it("reports the version when aws answers", () => {
    mockSpawnSync.mockReturnValue(found("aws-cli/2.15.30 Python/3.11.8 Darwin/23.4.0"));
    expect(checkAwsCli()).toMatchObject({ status: "ok", detail: "2.15.30" });
  });

  it("fails when aws is not installed", () => {
    mockSpawnSync.mockReturnValue(NOT_ON_PATH);
    expect(checkAwsCli().status).toBe("fail");
  });
});

describe("checkDocker", () => {
  it("passes when the daemon answers", () => {
    mockSpawnSync.mockImplementation((_cmd: string, args: string[]) =>
      args[0] === "info" ? found("24.0.7") : found("Docker version 24.0.7, build afdd53b")
    );

    const result = checkDocker();
    expect(result.status).toBe("ok");
    expect(result.detail).toContain("daemon running");
  });

  // Installed but stopped is the failure people actually hit, and it is the one a
  // plain "docker --version" probe would miss.
  it("warns when docker is installed but the daemon is down", () => {
    mockSpawnSync.mockImplementation((_cmd: string, args: string[]) =>
      args[0] === "info"
        ? { error: null, status: 1, stdout: "", stderr: "Cannot connect to the Docker daemon" }
        : found("Docker version 24.0.7, build afdd53b")
    );

    const result = checkDocker();
    expect(result.status).toBe("warn");
    expect(result.detail).toContain("daemon is not responding");
    expect(result.fix).toContain("Start Docker");
  });

  // A missing Docker must never fail the command: deploying does not use it.
  it("warns rather than fails when docker is absent", () => {
    mockSpawnSync.mockReturnValue(NOT_ON_PATH);
    const result = checkDocker();
    expect(result.status).toBe("warn");
    expect(result.fix).toContain("slskit deploy");
  });
});

describe("checkProject", () => {
  let root: string;

  beforeEach(() => {
    root = createTempDir("slskit-doctor-");
  });

  afterEach(() => {
    removeDir(root);
  });

  it("skips outside a project instead of failing", () => {
    const { result, manifest } = checkProject(root);
    expect(result.status).toBe("skip");
    expect(manifest).toBeUndefined();
  });

  it("counts the services and functions of a scaffolded project", async () => {
    await scaffoldProject({ ...minimalAnswers, name: "." }, root);
    const { result, manifest } = checkProject(root);

    expect(result.status).toBe("ok");
    expect(result.detail).toContain("2 services");
    expect(result.detail).toContain("4 functions");
    expect(manifest?.name).toBe(path.basename(root));
  });

  it("fails on a manifest that is not valid JSON", () => {
    fs.writeFileSync(path.join(root, "slskit.json"), "{ not json");
    expect(checkProject(root).result.status).toBe("fail");
  });

  it("fails on a manifest with no project name", () => {
    fs.writeFileSync(path.join(root, "slskit.json"), JSON.stringify({ applications: [] }));
    const { result } = checkProject(root);
    expect(result.status).toBe("fail");
    expect(result.detail).toContain('no project "name"');
  });

  it("fails on a project built for another framework", () => {
    fs.writeFileSync(
      path.join(root, "slskit.json"),
      JSON.stringify({ name: "legacy", framework: { id: "serverless" } })
    );
    const { result } = checkProject(root);
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("AWS SAM only");
  });

  it("warns on a project with no functions", () => {
    fs.writeFileSync(
      path.join(root, "slskit.json"),
      JSON.stringify({ name: "empty", framework: { id: "sam" }, applications: [] })
    );
    expect(checkProject(root).result.status).toBe("warn");
  });
});

describe("checkEnvironment", () => {
  const manifest = {
    name: "shop",
    environments: {
      default: "dev",
      list: {
        dev: { region: "us-east-1", stackName: "shop-dev", profile: "work" },
        staging: { stackName: "shop-staging" },
      },
    },
  };

  it("reports the stack, region and profile of the default environment", () => {
    const { result, target } = checkEnvironment(manifest, undefined);
    expect(result.status).toBe("ok");
    expect(result.title).toBe('Environment "dev"');
    expect(result.detail).toContain("shop-dev");
    expect(result.detail).toContain("us-east-1");
    expect(target).toMatchObject({ region: "us-east-1", profile: "work" });
  });

  it("fails on an environment that does not exist, and lists the ones that do", () => {
    const { result, target } = checkEnvironment(manifest, "production");
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("dev, staging");
    expect(result.fix).toBe("slskit env add production");
    expect(target).toBeUndefined();
  });

  // Without a region nothing can be deployed, which deploy discovers on its own but
  // only once you are already trying to ship.
  it("fails on an environment with no region", () => {
    const { result, target } = checkEnvironment(manifest, "staging");
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("no AWS region");
    expect(target).toBeUndefined();
  });
});

describe("checkVariables", () => {
  let root: string;

  beforeEach(() => {
    root = createTempDir("slskit-doctor-vars-");
  });

  afterEach(() => {
    removeDir(root);
  });

  const manifestWith = (variables: Record<string, unknown>) => ({
    name: "shop",
    environments: {
      default: "dev",
      list: { dev: { region: "us-east-1", stackName: "shop-dev", variables } },
    },
  });

  it("counts the values it resolved", () => {
    const manifest = manifestWith({ LOG_LEVEL: { value: "debug" } });
    const result = checkVariables(root, manifest as never, "dev");

    expect(result.status).toBe("ok");
    expect(result.detail).toContain("1 value");
  });

  it("does not count APP_ENVIRONMENT, which is generated", () => {
    const result = checkVariables(root, manifestWith({}) as never, "dev");
    expect(result.status).toBe("ok");
    expect(result.detail).toContain("none declared");
  });

  // The late failure this command exists to catch: declared secret, no value on disk.
  it("fails on a declared secret with no value, and carries the fix", () => {
    const manifest = manifestWith({ API_KEY: { secret: true } });
    const result = checkVariables(root, manifest as never, "dev");

    expect(result.status).toBe("fail");
    expect(result.detail).toContain('"API_KEY"');
    expect(result.fix).toContain("slskit env set API_KEY=<value> --secret --env dev");
  });
});
