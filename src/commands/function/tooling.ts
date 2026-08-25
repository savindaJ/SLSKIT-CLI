import fs from "node:fs";
import path from "node:path";
import { tsconfig } from "../init/templates/project.js";
import type { InitAnswers, RuntimeId } from "../init/types.js";

interface PackageJsonShape {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
}

// A function whose language differs from the project's original runtime may need
// tooling the project never installed (esbuild for a first node function in a
// python project, or typescript for a first TS function in a plain JS project).
// Returns true if package.json changed, so the caller knows to re-run npm install.
export function ensureToolingForRuntime(
  root: string,
  answers: InitAnswers,
  fnRuntime: RuntimeId
): boolean {
  if (fnRuntime === "python") {
    return false;
  }

  const pkgPath = path.join(root, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as PackageJsonShape;
  pkg.dependencies ??= {};
  pkg.devDependencies ??= {};
  let changed = false;

  if (!pkg.dependencies.esbuild && !pkg.devDependencies.esbuild) {
    // sam build stages the project with `npm install --omit=dev`, so esbuild must be a regular dependency.
    pkg.dependencies.esbuild = "^0.25.0";
    changed = true;
  }

  if (fnRuntime === "typescript" && !pkg.devDependencies.typescript) {
    pkg.devDependencies.typescript = "^5.7.2";
    pkg.devDependencies["@types/node"] = "^22.10.2";
    pkg.devDependencies["@types/aws-lambda"] = "^8.10.145";
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  }

  const tsconfigPath = path.join(root, "tsconfig.json");
  if (fnRuntime === "typescript" && !fs.existsSync(tsconfigPath)) {
    fs.writeFileSync(tsconfigPath, tsconfig(answers));
    changed = true;
  }

  return changed;
}
