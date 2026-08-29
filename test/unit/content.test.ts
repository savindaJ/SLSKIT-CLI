import { buildFileMap } from "../../src/commands/init/content";
import { LAMBDA_APPS } from "../../src/commands/init/types";
import {
  fullStackAnswers,
  minimalAnswers,
  mongooseAnswers,
  pythonAnswers,
  sharedApiAnswers,
} from "../helpers/fixtures";

describe("buildFileMap", () => {
  it("generates core files for a minimal SAM project", () => {
    const files = buildFileMap(minimalAnswers);

    expect(files["package.json"]).toBeDefined();
    expect(files["README.md"]).toBeDefined();
    expect(files[".gitignore"]).toBeDefined();
    expect(files["slskit.json"]).toBeDefined();
    expect(files["template.yaml"]).toBeDefined();
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

    expect(files["templates/auth.yaml"]).toMatch(/Description: auth service/);
    expect(files["templates/product.yaml"]).toMatch(
      /Description: product service/
    );
  });

  it("keeps a root stack that nests every service template", () => {
    const files = buildFileMap(fullStackAnswers);

    expect(files["template.yaml"]).toMatch(/AWS::Serverless::Application/);
    expect(files["template.yaml"]).toMatch(
      /Location: templates\/auth\.yaml/
    );
    expect(files["template.yaml"]).toMatch(
      /Location: templates\/product\.yaml/
    );
  });

  it("gives each service its own HTTP API so SAM resolves it in-template", () => {
    const files = buildFileMap(fullStackAnswers);
    const auth = files["templates/auth.yaml"];

    expect(auth).toMatch(/AWS::Serverless::HttpApi/);
    expect(auth).toMatch(/ApiId: !Ref HttpApi\b/);
    // A cross-stack ApiId parameter is what broke sam build previously.
    expect(auth).not.toMatch(/!Ref HttpApiId/);
  });

  it("declares the shared layer inside each service template", () => {
    const files = buildFileMap(fullStackAnswers);
    const auth = files["templates/auth.yaml"];

    expect(auth).toMatch(/SharedLayer/);
    expect(auth).toMatch(/- !Ref SharedLayer\b/);
  });

  it("points the SAM layer ContentUri at the layer dir, relative to the service template", () => {
    const files = buildFileMap(fullStackAnswers);
    expect(files["templates/auth.yaml"]).toMatch(
      /ContentUri: \.\.\/src\/shared\/nodejs/
    );
  });

  it("uses the project root as CodeUri so npm install finds package.json", () => {
    const files = buildFileMap(fullStackAnswers);
    const auth = files["templates/auth.yaml"];

    expect(auth).toMatch(/CodeUri: \.\.\//);
    expect(auth).toMatch(/Handler: src\/functions\/auth\/login\/handler\.handler/);
    expect(auth).toMatch(/- src\/functions\/auth\/login\/handler\.ts/);
  });

  it("uses a dotted root-relative handler path for python", () => {
    const files = buildFileMap(pythonAnswers);
    expect(files["templates/auth.yaml"]).toMatch(
      /Handler: src\.functions\.auth\.login\.handler\.handler/
    );
  });

  it("points the SAM layer ContentUri at nodejs for a Node layer", () => {
    const files = buildFileMap({ ...mongooseAnswers, layer: true });
    expect(files["templates/auth.yaml"]).toMatch(
      /ContentUri: \.\.\/src\/shared\/nodejs/
    );
  });

  it("points the SAM layer ContentUri at python for a Python layer", () => {
    const files = buildFileMap(pythonAnswers);
    expect(files["templates/auth.yaml"]).toMatch(
      /ContentUri: \.\.\/src\/shared\/python/
    );
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
      ...mongooseAnswers,
      layer: true,
      database: "none",
    });
    expect(files["src/shared/nodejs/logger.js"]).toBeDefined();
    expect(files["src/shared/nodejs/logger.d.ts"]).toBeUndefined();
  });

  it("uses src/shared/python for Python layer source", () => {
    const files = buildFileMap(pythonAnswers);
    expect(files["src/shared/python/logger.py"]).toBeDefined();
  });

  it("generates a root stack plus one template per application", () => {
    const files = buildFileMap(mongooseAnswers);
    expect(files["template.yaml"]).toMatch(/AWS::Serverless::Application/);
    expect(files["templates/auth.yaml"]).toBeDefined();
    expect(files["templates/product.yaml"]).toBeDefined();
    expect(Object.keys(files).filter((f) => f.endsWith(".yml"))).toEqual([]);
  });

  it("generates tsconfig scoped to src/", () => {
    const files = buildFileMap(fullStackAnswers);
    expect(files["tsconfig.json"]).toMatch(/"strict": true/);
    expect(files["tsconfig.json"]).toMatch(/"src\/\*\*\/\*\.ts"/);
    expect(files["tsconfig.json"]).toMatch(/\.\/src\/shared\/nodejs\/\*/);

    // .aws-sam holds a full copy of the project after "sam build"; loading it as a
    // second TypeScript program is what makes editors report phantom missing files.
    const parsed = JSON.parse(files["tsconfig.json"]) as { exclude: string[] };
    expect(parsed.exclude).toContain(".aws-sam");
    expect(parsed.exclude).toContain("node_modules");
    expect(parsed.exclude).toContain("dist");
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

    // The Prisma CLI only reads ".env", so every script is pointed at the
    // environment file the project actually ships with.
    expect(pkg.scripts["prisma:generate"]).toBe("dotenv -e .env.dev -- prisma generate");
    expect(pkg.scripts["prisma:migrate"]).toBe("dotenv -e .env.dev -- prisma migrate dev");
    expect(pkg.scripts["prisma:deploy"]).toBe(
      "dotenv -e .env.dev -- prisma migrate deploy"
    );
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

  it("generates SAM build and deploy scripts", () => {
    const files = buildFileMap(mongooseAnswers);
    const pkg = JSON.parse(files["package.json"]) as {
      scripts: Record<string, string>;
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };

    expect(pkg.scripts.build).toBe("sam build");
    expect(pkg.scripts.deploy).toBe("sam deploy --guided");
    // sam build runs `npm install --omit=dev`, so esbuild cannot be a devDependency.
    expect(pkg.dependencies.esbuild).toBeDefined();
    expect(pkg.devDependencies.serverless).toBeUndefined();
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
    expect(files["templates/auth.yaml"]).toMatch(/MemorySize: 2048/);
    expect(files["templates/product.yaml"]).toMatch(/MemorySize: 2048/);
  });

  it("generates prisma schema when database is prisma", () => {
    const files = buildFileMap({
      ...minimalAnswers,
      runtime: "typescript",
      database: "prisma",
    });

    expect(files["prisma/schema.prisma"]).toBeDefined();
    expect(files[".env.dev"]).toMatch(/DATABASE_URL=/);
    expect(files["src/shared/logger.ts"]).toMatch(/export const logger/);
  });

  // DATABASE_URL used to be a hardcoded parameter with no default and no override,
  // which made SAM substitute the parameter's own name as its value at runtime.
  it("wires a seeded database variable through the stage parameter mechanism", () => {
    const files = buildFileMap({
      ...minimalAnswers,
      runtime: "typescript",
      database: "prisma",
    });

    expect(files["template.yaml"]).toMatch(/EnvDatabaseUrl:/);
    expect(files["templates/auth.yaml"]).toMatch(
      /DATABASE_URL: !Ref EnvDatabaseUrl/
    );
    expect(files["templates/auth.yaml"]).not.toMatch(/^ {2}DatabaseUrl:/m);
  });

  it("gives every stage parameter an empty default and NoEcho", () => {
    const files = buildFileMap({
      ...minimalAnswers,
      runtime: "typescript",
      database: "prisma",
    });

    expect(files["template.yaml"]).toMatch(
      /EnvDatabaseUrl:\n {4}Type: String\n {4}Default: ""\n {4}NoEcho: true/
    );
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
    const auth = files["templates/auth.yaml"];

    expect(auth).toMatch(/Type: HttpApi/);
    expect(auth).toMatch(/\/auth\/login/);
  });

  it("omits HTTP events when apiGateway is disabled", () => {
    const files = buildFileMap(minimalAnswers);
    expect(files["templates/auth.yaml"]).not.toMatch(/Events:/);
  });

  it("generates each service's DynamoDB table in its own template", () => {
    const files = buildFileMap(fullStackAnswers);

    expect(files["templates/auth.yaml"]).toMatch(/UsersTable/);
    expect(files["templates/auth.yaml"]).not.toMatch(/ProductsTable:/);
    expect(files["templates/product.yaml"]).toMatch(/ProductsTable/);
  });
});

// SAM refuses an ApiId that points at another template ("ApiId must be a valid
// reference to an 'AWS::Serverless::HttpApi' resource in same template"), so sharing
// one API Gateway has to mean one flat template rather than a stack per service.
describe("buildFileMap with one shared API Gateway", () => {
  const files = () => buildFileMap(sharedApiAnswers);

  it("still gives every service its own template", () => {
    const generated = files();

    expect(generated["template.yaml"]).toBeDefined();
    for (const app of LAMBDA_APPS) {
      expect(generated[`templates/${app.name}.yaml`]).toBeDefined();
    }
  });

  // SAM refuses an HttpApi event whose ApiId points at another template, so the
  // routes are plain API Gateway v2 resources against the id the root passes down.
  it("declares one API in the root and attaches routes from each service", () => {
    const generated = files();
    const root = generated["template.yaml"];

    expect(root.match(/Type: AWS::ApiGatewayV2::Api/g) ?? []).toHaveLength(1);
    expect(root).toMatch(/HttpApiId: !Ref SharedHttpApi/);

    const auth = generated["templates/auth.yaml"];
    expect(auth).not.toMatch(/Type: AWS::Serverless::HttpApi/);
    expect(auth).toMatch(/Type: AWS::ApiGatewayV2::Route/);
    expect(auth).toMatch(/RouteKey: "POST \/auth\/login"/);
    expect(auth).toMatch(/^ {2}HttpApiId:$/m);
  });

  it("outputs one URL rather than one per service", () => {
    const root = files()["template.yaml"];

    expect(root).toMatch(/^ {2}ApiUrl:$/m);
    expect(root).not.toMatch(/AuthApiUrl:/);
  });

  // A service template sits in templates/, one level below the project root.
  it("points CodeUri and the layer one level up from a service template", () => {
    const auth = files()["templates/auth.yaml"];

    expect(auth).toMatch(/CodeUri: \.\.\//);
    expect(auth).toMatch(/ContentUri: \.\.\/src\/shared\/nodejs/);
  });

  it("records the layout so later commands regenerate the same shape", () => {
    const manifest = JSON.parse(files()["slskit.json"]) as {
      apiGateway: { perService: boolean };
    };

    expect(manifest.apiGateway.perService).toBe(false);
  });
});
