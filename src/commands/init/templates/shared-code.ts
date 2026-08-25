import type { InitAnswers } from "../types.js";

export function sharedLogger(runtime: InitAnswers["runtime"]): string {
  if (runtime === "python") {
    return `import logging

logger = logging.getLogger("slskit")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO)
`;
  }

  if (runtime === "typescript") {
    return `export const logger = {
  info(message: string, extra?: unknown): void {
    console.log(JSON.stringify({ level: "info", message, extra }));
  },
  error(message: string, extra?: unknown): void {
    console.error(JSON.stringify({ level: "error", message, extra }));
  },
};
`;
  }

  return `export const logger = {
  info(message, extra) {
    console.log(JSON.stringify({ level: "info", message, extra }));
  },
  error(message, extra) {
    console.error(JSON.stringify({ level: "error", message, extra }));
  },
};
`;
}

export function sharedLayerLogger(): string {
  return `exports.logger = {
  info(message, extra) {
    console.log(JSON.stringify({ level: "info", message, extra }));
  },
  error(message, extra) {
    console.error(JSON.stringify({ level: "error", message, extra }));
  },
};
`;
}

// The layer ships runtime JS, so a TypeScript project needs these declarations to type it.
export function sharedLayerLoggerTypes(): string {
  return `export declare const logger: {
  info(message: string, extra?: unknown): void;
  error(message: string, extra?: unknown): void;
};
`;
}

export function sharedDb(answers: InitAnswers): string | undefined {
  if (answers.database === "none") {
    return undefined;
  }

  if (answers.runtime === "python") {
    if (answers.database === "prisma") {
      return `from prisma import Prisma

prisma = Prisma()


async def connect_db():
    if not prisma.is_connected():
        await prisma.connect()
    return prisma
`;
    }

    if (answers.database === "mongoose") {
      return `import os
from pymongo import MongoClient

_client = None


def connect_db():
    global _client
    if _client is None:
        uri = os.environ.get("MONGODB_URI", "mongodb://127.0.0.1:27017/app")
        _client = MongoClient(uri)
    return _client.get_default_database()
`;
    }

    return `import os
import boto3

dynamodb = boto3.resource("dynamodb")


def users_table():
    return dynamodb.Table(os.environ.get("USERS_TABLE", "users"))


def products_table():
    return dynamodb.Table(os.environ.get("PRODUCTS_TABLE", "products"))
`;
  }

  if (answers.database === "prisma") {
    return `import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();
`;
  }

  if (answers.database === "mongoose") {
    const typed = answers.runtime === "typescript";
    return `import mongoose from "mongoose";

export async function connectDb()${typed ? ": Promise<typeof mongoose>" : ""} {
  if (mongoose.connection.readyState === 0) {
    const uri = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/app";
    await mongoose.connect(uri);
  }

  return mongoose;
}
`;
  }

  return `import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
export const docClient = DynamoDBDocumentClient.from(client);

export const USERS_TABLE = process.env.USERS_TABLE ?? "users";
export const PRODUCTS_TABLE = process.env.PRODUCTS_TABLE ?? "products";
`;
}

export function prismaSchema(): string {
  // rhel-openssl-3.0.x is the query engine for the Amazon Linux 2023 Lambda runtimes.
  return `generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "rhel-openssl-3.0.x"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  password  String
  createdAt DateTime @default(now())
}

model Product {
  id        String   @id @default(cuid())
  name      String
  price     Int
  createdAt DateTime @default(now())
}
`;
}
