import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { CliError } from "../../core/errors.js";
import { logger } from "../../core/logger.js";
import { buildFileMap } from "./content.js";
import type { InitAnswers } from "./types.js";

function run(cwd: string, command: string, args: string[], env?: NodeJS.ProcessEnv): void {
  logger.info(`> ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    env: env ? { ...process.env, ...env } : process.env,
    shell: process.platform === "win32",
  });

  if (result.error) {
    throw new CliError(`Failed to run ${command}: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new CliError(`${command} exited with code ${result.status ?? 1}`);
  }
}

// An environment file holds real credentials, so --force must never clobber one.
const isEnvironmentFile = (relativePath: string): boolean =>
  relativePath.startsWith(".env");

function writeFiles(root: string, files: Record<string, string>): void {
  for (const [relativePath, contents] of Object.entries(files)) {
    const fullPath = path.join(root, relativePath);

    if (isEnvironmentFile(relativePath) && fs.existsSync(fullPath)) {
      logger.info(`Kept existing ${relativePath} rather than overwriting its values`);
      continue;
    }

    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, contents);
  }
}

export function resolveProjectRoot(cwd: string, name: string): { root: string; folderName: string } {
  if (name === ".") {
    return { root: cwd, folderName: path.basename(cwd) };
  }

  return { root: path.join(cwd, name), folderName: name };
}

export function ensureProjectRoot(root: string, force: boolean): void {
  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true });
    return;
  }

  const entries = fs.readdirSync(root).filter((entry) => entry !== ".git");
  if (entries.length === 0 || force) {
    return;
  }

  throw new CliError(
    `Directory already exists and is not empty: ${root}. Re-run with --force to overwrite generated files.`
  );
}

export async function scaffoldProject(answers: InitAnswers, cwd = process.cwd()): Promise<string> {
  const { root, folderName } = resolveProjectRoot(cwd, answers.name);
  const project = { ...answers, name: folderName };

  ensureProjectRoot(root, project.force);
  writeFiles(root, buildFileMap(project));

  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const hasNpmDeps =
    Object.keys(pkg.dependencies ?? {}).length > 0 ||
    Object.keys(pkg.devDependencies ?? {}).length > 0;

  if (hasNpmDeps) {
    logger.info("\nInstalling npm dependencies...");
    run(root, "npm", ["install"]);
  }

  if (project.runtime === "python" && fs.existsSync(path.join(root, "requirements.txt"))) {
    logger.info("\nCreating Python venv and installing requirements...");
    run(root, "python3", ["-m", "venv", ".venv"]);
    const pip = path.join(root, ".venv", "bin", "pip");
    run(root, pip, ["install", "-r", "requirements.txt"]);
  }

  if (project.database === "prisma" && project.runtime !== "python") {
    logger.info("\nGenerating Prisma client...");
    run(root, "npx", ["prisma", "generate"], {
      DATABASE_URL:
        process.env.DATABASE_URL ?? "postgresql://user:password@localhost:5432/app",
    });
  }

  return root;
}
