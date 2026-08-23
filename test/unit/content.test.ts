import { buildFileMap } from "../../src/commands/init/content";
import { LAMBDA_APPS } from "../../src/commands/init/types";
import {
  fullStackAnswers,
  minimalAnswers,
  pythonAnswers,
  serverlessAnswers,
} from "../helpers/fixtures";

describe("buildFileMap", () => {
  it("generates core files for a minimal SAM project", () => {
    const files = buildFileMap(minimalAnswers);

    expect(files["package.json"]).toBeDefined();
    expect(files["README.md"]).toBeDefined();
    expect(files[".gitignore"]).toBeDefined();
    expect(files["sless.json"]).toBeDefined();
    expect(files["template.yaml"]).toBeDefined();
    expect(files["gateway/template.yaml"]).toBeUndefined();
  });

  it("puts all generated source under src/", () => {
    const files = buildFileMap(fullStackAnswers);
    const stray = Object.keys(files).filter((file) =>
      /^(functions|services|shared)\//.test(file)
    );

    expect(stray).toEqual([]);
    expect(files["src/functions/auth/login/handler.ts"]).toBeDefined();
    expect(files["src/services/auth/login.ts"]).toBeDefined();
  });

  it("writes one template per service next to that service's handlers", () => {
    const files = buildFileMap(fullStackAnswers);

    expect(files["src/functions/auth/template.yaml"]).toMatch(/Description: auth service/);
    expect(files["src/functions/product/template.yaml"]).toMatch(
      /Description: product service/
    );
  });

  it("keeps a root stack that nests every service template", () => {
    const files = buildFileMap(fullStackAnswers);

    expect(files["template.yaml"]).toMatch(/AWS::Serverless::Application/);
    expect(files["template.yaml"]).toMatch(
      /Location: src\/functions\/auth\/template\.yaml/
    );
    expect(files["template.yaml"]).toMatch(
      /Location: src\/functions\/product\/template\.yaml/
    );
  });

  it("gives each service its own HTTP API so SAM resolves it in-template", () => {
    const files = buildFileMap(fullStackAnswers);
    const auth = files["src/functions/auth/template.yaml"];

    expect(auth).toMatch(/AWS::Serverless::HttpApi/);
    expect(auth).toMatch(/ApiId: !Ref HttpApi\b/);
    // A cross-stack ApiId parameter is what broke sam build previously.
    expect(auth).not.toMatch(/!Ref HttpApiId/);
  });

  it("declares the shared layer inside each service template", () => {
    const files = buildFileMap(fullStackAnswers);
    const auth = files["src/functions/auth/template.yaml"];

    expect(auth).toMatch(/SharedLayer/);
    expect(auth).toMatch(/- !Ref SharedLayer\b/);
  });

  it("points the SAM layer ContentUri at the layer dir, relative to the service template", () => {
    const files = buildFileMap(fullStackAnswers);
    expect(files["src/functions/auth/template.yaml"]).toMatch(
      /ContentUri: \.\.\/\.\.\/shared\/nodejs/
    );
  });

  it("uses the project root as CodeUri so npm install finds package.json", () => {
    const files = buildFileMap(fullStackAnswers);
    const auth = files["src/functions/auth/template.yaml"];

    expect(auth).toMatch(/CodeUri: \.\.\/\.\.\/\.\.\//);
    expect(auth).toMatch(/Handler: src\/functions\/auth\/login\/handler\.handler/);
    expect(auth).toMatch(/- src\/functions\/auth\/login\/handler\.ts/);
  });

  it("uses a dotted root-relative handler path for python", () => {
    const files = buildFileMap({ ...pythonAnswers, framework: "sam" });
    expect(files["src/functions/auth/template.yaml"]).toMatch(
      /Handler: src\.functions\.auth\.login\.handler\.handler/
    );
  });

  it("points the Serverless layer path at nodejs relative to src/shared/serverless.yml", () => {
    const files = buildFileMap({ ...serverlessAnswers, layer: true });
    expect(files["src/shared/serverless.yml"]).toMatch(/path: nodejs/);
  });

  it("points the Serverless layer path at python for a Python layer", () => {
    const files = buildFileMap(pythonAnswers);
    expect(files["src/shared/serverless.yml"]).toMatch(/path: python/);
  });

  it("writes plain JS (not TS) into a TypeScript project's Lambda layer", () => {
    const files = buildFileMap(fullStackAnswers);
    expect(files["src/shared/nodejs/logger.js"]).toBeDefined();
    expect(files["src/shared/nodejs/logger.ts"]).toBeUndefined();
  });

  it("writes CommonJS (not ESM export) into a real Lambda layer, since it is never bundled", () => {
    const files = buildFileMap(fullStackAnswers);
    expect(files["src/shared/nodejs/logger.js"]).toMatch(/^exports\.logger/);
    expect(files["src/shared/nodejs/logger.js"]).not.toMatch(/^export /m);
  });

  it("keeps db out of the Lambda layer, since a layer ships no node_modules", () => {
    const files = buildFileMap(fullStackAnswers);
    expect(files["src/shared/nodejs/db.js"]).toBeUndefined();
    expect(files["src/shared/nodejs/db.ts"]).toBeUndefined();
    expect(files["src/shared/db.ts"]).toMatch(/@aws-sdk\/lib-dynamodb/);
  });

  it("imports db by relative path even when a layer is enabled", () => {
    const files = buildFileMap(fullStackAnswers);
    const service = files["src/services/auth/login.ts"];

    expect(service).toMatch(/from "\/opt\/nodejs\/logger"/);
    expect(service).toMatch(/from "\.\.\/\.\.\/shared\/db"/);
    expect(service).not.toMatch(/from "\/opt\/nodejs\/db"/);
  });

  it("wires each handler to its matching service module", () => {
    const files = buildFileMap(fullStackAnswers);
    expect(files["src/functions/auth/login/handler.ts"]).toMatch(
      /from "\.\.\/\.\.\/\.\.\/services\/auth\/login"/
    );
  });

  it("imports python db from the packaged source tree even with a layer", () => {
    const files = buildFileMap({ ...pythonAnswers, database: "dynamodb" });
    const service = files["src/services/auth/login.py"];

    expect(service).toMatch(/from src\.shared\.db import/);
    expect(service).not.toMatch(/^from db import/m);
    expect(files["src/shared/__init__.py"]).toBeDefined();
    expect(files["src/__init__.py"]).toBeDefined();
  });

  it("keeps TypeScript shared code when there is no layer (bundled by esbuild)", () => {
    const files = buildFileMap({ ...minimalAnswers, runtime: "typescript" });
    expect(files["src/shared/logger.ts"]).toBeDefined();
  });

  it("emits a .d.ts declaration so a TypeScript project can type the JS layer", () => {
    const files = buildFileMap(fullStackAnswers);
    expect(files["src/shared/nodejs/logger.d.ts"]).toMatch(
      /export declare const logger/
    );
  });

  it("pins a Lambda-compatible prisma query engine", () => {
    const files = buildFileMap({
      ...minimalAnswers,
      runtime: "typescript",
      database: "prisma",
    });
    expect(files["prisma/schema.prisma"]).toMatch(/rhel-openssl-3\.0\.x/);
  });

  it("omits layer .d.ts files for a JavaScript project", () => {
    const files = buildFileMap({
      ...serverlessAnswers,
      framework: "sam",
      layer: true,
      database: "none",
    });
    expect(files["src/shared/nodejs/logger.js"]).toBeDefined();
    expect(files["src/shared/nodejs/logger.d.ts"]).toBeUndefined();
  });

  it("uses src/shared/python for Python layer source", () => {
    const files = buildFileMap(pythonAnswers);
    expect(files["src/shared/python/logger.py"]).toBeDefined();
    expect(files["src/shared/serverless.yml"]).toBeDefined();
  });

  it("generates serverless configs without root SAM template", () => {
    const files = buildFileMap(serverlessAnswers);
    expect(files["template.yaml"]).toBeUndefined();
    expect(files["gateway/serverless.yml"]).toBeDefined();
    expect(files["src/functions/auth/serverless.yml"]).toBeDefined();
    expect(files["src/functions/product/serverless.yml"]).toBeDefined();
  });

  it("generates tsconfig scoped to src/", () => {
    const files = buildFileMap(fullStackAnswers);
    expect(files["tsconfig.json"]).toMatch(/"strict": true/);
    expect(files["tsconfig.json"]).toMatch(/"src\/\*\*\/\*\.ts"/);
    expect(files["tsconfig.json"]).toMatch(/\.\/src\/shared\/nodejs\/\*/);
  });

  it("adds prisma generate and migrate scripts when database is prisma", () => {
    const files = buildFileMap({
      ...minimalAnswers,
      runtime: "typescript",
      database: "prisma",
    });
    const pkg = JSON.parse(files["package.json"]) as {
      scripts: Record<string, string>;
    };

    expect(pkg.scripts["prisma:generate"]).toBe("prisma generate");
    expect(pkg.scripts["prisma:migrate"]).toBe("prisma migrate dev");
    expect(pkg.scripts["prisma:deploy"]).toBe("prisma migrate deploy");
    expect(files["README.md"]).toMatch(/npm run prisma:migrate/);
  });

  it("omits prisma scripts when no database is selected", () => {
    const files = buildFileMap(minimalAnswers);
    const pkg = JSON.parse(files["package.json"]) as {
      scripts: Record<string, string>;
    };

    expect(pkg.scripts["prisma:generate"]).toBeUndefined();
  });

  it("omits prisma npm scripts for a Python project (prisma runs from the venv)", () => {
    const files = buildFileMap({ ...pythonAnswers, database: "prisma" });
    const pkg = JSON.parse(files["package.json"]) as {
      scripts: Record<string, string>;
    };

    expect(pkg.scripts["prisma:generate"]).toBeUndefined();
  });

  it("points serverless deploy scripts at the per-service templates under src/", () => {
    const files = buildFileMap(serverlessAnswers);
    const pkg = JSON.parse(files["package.json"]) as {
      scripts: Record<string, string>;
    };

    expect(pkg.scripts["deploy:auth"]).toContain("src/functions/auth/serverless.yml");
    expect(pkg.scripts["deploy:product"]).toContain(
      "src/functions/product/serverless.yml"
    );
  });

  it("generates Python package markers and requirements", () => {
    const files = buildFileMap(pythonAnswers);

    expect("src/functions/__init__.py" in files).toBe(true);
    expect("src/functions/auth/login/__init__.py" in files).toBe(true);
    expect(files["requirements.txt"]).toBeDefined();
    expect(files["src/functions/auth/login/handler.py"]).toBeDefined();
  });

  it("writes memory size into each service template", () => {
    const files = buildFileMap({ ...fullStackAnswers, memorySize: 2048 });
    expect(files["src/functions/auth/template.yaml"]).toMatch(/MemorySize: 2048/);
    expect(files["src/functions/product/template.yaml"]).toMatch(/MemorySize: 2048/);
  });

  it("writes memory size into serverless provider config", () => {
    const files = buildFileMap(serverlessAnswers);
    expect(files["src/functions/auth/serverless.yml"]).toMatch(/memorySize: 1024/);
  });

  it("generates prisma schema when database is prisma", () => {
    const files = buildFileMap({
      ...minimalAnswers,
      runtime: "typescript",
      database: "prisma",
    });

    expect(files["prisma/schema.prisma"]).toBeDefined();
    expect(files[".env.example"]).toBeDefined();
    expect(files["src/shared/logger.ts"]).toMatch(/export const logger/);
  });

  it("generates handlers and services for every lambda app function", () => {
    const files = buildFileMap(fullStackAnswers);

    for (const app of LAMBDA_APPS) {
      for (const fn of app.functions) {
        expect(files[`src/functions/${app.name}/${fn.name}/handler.ts`]).toBeDefined();
        expect(files[`src/services/${app.name}/${fn.name}.ts`]).toBeDefined();
      }
    }
  });

  it("attaches HTTP events when apiGateway is enabled", () => {
    const files = buildFileMap(fullStackAnswers);
    const auth = files["src/functions/auth/template.yaml"];

    expect(auth).toMatch(/Type: HttpApi/);
    expect(auth).toMatch(/\/auth\/login/);
  });

  it("omits HTTP events when apiGateway is disabled", () => {
    const files = buildFileMap(minimalAnswers);
    expect(files["src/functions/auth/template.yaml"]).not.toMatch(/Events:/);
  });

  it("generates each service's DynamoDB table in its own template", () => {
    const files = buildFileMap(fullStackAnswers);

    expect(files["src/functions/auth/template.yaml"]).toMatch(/UsersTable/);
    expect(files["src/functions/auth/template.yaml"]).not.toMatch(/ProductsTable:/);
    expect(files["src/functions/product/template.yaml"]).toMatch(/ProductsTable/);
  });
});
