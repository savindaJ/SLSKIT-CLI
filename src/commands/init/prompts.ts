import { CliError } from "../../core/errors.js";
import type {
  DatabaseId,
  InitAnswers,
  InitOptions,
  MemorySize,
  RuntimeId,
} from "./types.js";
import { MEMORY_SIZES } from "./types.js";

export const RUNTIME_ALIASES: Record<string, RuntimeId> = {
  typescript: "typescript",
  ts: "typescript",
  "node-ts": "typescript",
  javascript: "javascript",
  js: "javascript",
  node: "javascript",
  nodejs: "javascript",
  python: "python",
  py: "python",
  python3: "python",
};

const DATABASE_ALIASES: Record<string, DatabaseId> = {
  none: "none",
  skip: "none",
  no: "none",
  prisma: "prisma",
  mongoose: "mongoose",
  mongo: "mongoose",
  mongodb: "mongoose",
  dynamodb: "dynamodb",
  dynamo: "dynamodb",
  documentclient: "dynamodb",
};

export function parseAlias<T extends string>(
  value: string | undefined,
  aliases: Record<string, T>,
  label: string
): T | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = aliases[value.trim().toLowerCase()];
  if (!parsed) {
    throw new CliError(
      `Unknown ${label} "${value}". Expected ${Object.keys(aliases).join(", ")}.`
    );
  }

  return parsed;
}

function parseYesNo(
  value: string | boolean | undefined,
  label: string
): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  if (value === undefined || value === "") {
    return undefined;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["yes", "y", "true", "1"].includes(normalized)) {
    return true;
  }
  if (["no", "n", "false", "0"].includes(normalized)) {
    return false;
  }

  throw new CliError(`${label} must be yes or no.`);
}

export function parseMemory(value: string | number | undefined): MemorySize | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }

  const parsed = Number(String(value).replace(/mb$/i, "").trim());
  if (!MEMORY_SIZES.includes(parsed as MemorySize)) {
    throw new CliError(
      `Unknown memory size "${value}". Choose ${MEMORY_SIZES.join(", ")}.`
    );
  }

  return parsed as MemorySize;
}

export function memoryLabel(size: MemorySize): string {
  if (size % 1024 === 0) {
    return `${size} MB (${size / 1024} GB)`;
  }

  return `${size} MB`;
}

export async function collectAnswers(options: InitOptions): Promise<InitAnswers> {
  let name = options.name?.trim();
  let runtime = parseAlias(options.runtime, RUNTIME_ALIASES, "runtime");
  let database = parseAlias(options.database, DATABASE_ALIASES, "database");
  let apiGateway = parseYesNo(options.apiGateway, "--api-gateway");
  let layer = parseYesNo(options.layer, "--layer");
  let memorySize = parseMemory(options.memory);

  const needsPrompt =
    !name ||
    !runtime ||
    !database ||
    apiGateway === undefined ||
    layer === undefined ||
    memorySize === undefined;

  if (needsPrompt && !process.stdin.isTTY) {
    throw new CliError(
      "Non-interactive init needs --name, --runtime, --database, --api-gateway, --layer, and --memory."
    );
  }

  if (needsPrompt) {
    const { input, select, confirm } = await import("@inquirer/prompts");

    name ??= await input({
      message: "Project Name:",
      default: "my-lambda-app",
      required: true,
    });

    runtime ??= await select<RuntimeId>({
      message: "Runtime:",
      choices: [
        { name: "TypeScript (Node.js)", value: "typescript" },
        { name: "JavaScript (Node.js)", value: "javascript" },
        { name: "Python", value: "python" },
      ],
    });

    database ??= await select<DatabaseId>({
      message: "Database / ORM (Optional):",
      choices: [
        { name: "None", value: "none" },
        { name: "Prisma", value: "prisma" },
        { name: "Mongoose", value: "mongoose" },
        { name: "DynamoDB DocumentClient", value: "dynamodb" },
      ],
    });

    apiGateway ??= await confirm({
      message: "API Gateway? Attach every function to a single HTTP API",
      default: true,
    });

    layer ??= await confirm({
      message: "Common Lambda layer? Use shared/ and attach it to every function",
      default: true,
    });

    memorySize ??= await select<MemorySize>({
      message: "Function memory size:",
      choices: MEMORY_SIZES.map((size) => ({
        name: memoryLabel(size),
        value: size,
      })),
    });
  }

  const projectName = name?.trim();
  if (!projectName) {
    throw new CliError("Project name is required.");
  }

  return {
    name: projectName,
    runtime: runtime as RuntimeId,
    database: database as DatabaseId,
    apiGateway: Boolean(apiGateway),
    layer: Boolean(layer),
    memorySize: memorySize as MemorySize,
    force: Boolean(options.force),
  };
}
