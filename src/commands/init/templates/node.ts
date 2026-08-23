import type { InitAnswers, ServiceFunction } from "../types.js";
import { nodeLayerImport } from "./helpers.js";

function nodeSharedImports(answers: InitAnswers): string {
  const loggerFrom = answers.layer
    ? nodeLayerImport("logger")
    : "../../shared/logger";
  // db is never in the layer, so it is always imported by relative path and bundled.
  const dbFrom = "../../shared/db";

  const lines = [`import { logger } from "${loggerFrom}";`];
  if (answers.database === "prisma") {
    lines.push(`import { prisma } from "${dbFrom}";`);
  } else if (answers.database === "mongoose") {
    lines.push(`import { connectDb } from "${dbFrom}";`);
  } else if (answers.database === "dynamodb") {
    lines.push(`import { docClient } from "${dbFrom}";`);
  }

  return `${lines.join("\n")}\n`;
}

export function nodeService(
  answers: InitAnswers,
  fn: ServiceFunction,
  typed: boolean
): string {
  const dbSetup =
    answers.database === "mongoose"
      ? "  await connectDb();\n"
      : answers.database === "prisma"
        ? "  void prisma;\n"
        : answers.database === "dynamodb"
          ? "  void docClient;\n"
          : "";

  const eventType = typed
    ? `import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";\n`
    : "";

  const signature = typed
    ? `export async function ${fn.name}(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {`
    : `export async function ${fn.name}(event) {`;

  return `${eventType}${nodeSharedImports(answers)}
${signature}
${dbSetup}  logger.info("${fn.name} invoked");
  const payload = event.body ? JSON.parse(event.body) : {};

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "${fn.name}",
      input: payload,
    }),
  };
}
`;
}

export function nodeHandler(
  answers: InitAnswers,
  appName: string,
  fn: ServiceFunction,
  typed: boolean
): string {
  const eventType = typed
    ? `import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";\n`
    : "";

  const signature = typed
    ? `export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {`
    : `export async function handler(event) {`;

  return `${eventType}import { ${fn.name} } from "../../../services/${appName}/${fn.name}";

${signature}
  return ${fn.name}(event);
}
`;
}
