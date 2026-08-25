import type { InitAnswers } from "../../src/commands/init/types";

export const minimalAnswers: InitAnswers = {
  name: "test-app",
  runtime: "javascript",
  database: "none",
  apiGateway: false,
  layer: false,
  memorySize: 256,
  force: false,
};

export const fullStackAnswers: InitAnswers = {
  name: "my-serverless-app",
  runtime: "typescript",
  database: "dynamodb",
  apiGateway: true,
  layer: true,
  memorySize: 512,
  force: false,
};

export const mongooseAnswers: InitAnswers = {
  name: "mongoose-app",
  runtime: "javascript",
  database: "mongoose",
  apiGateway: true,
  layer: false,
  memorySize: 1024,
  force: false,
};

export const pythonAnswers: InitAnswers = {
  name: "py-app",
  runtime: "python",
  database: "none",
  apiGateway: false,
  layer: true,
  memorySize: 128,
  force: false,
};
