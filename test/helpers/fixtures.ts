import type { InitAnswers } from "../../src/commands/init/types";

export const minimalAnswers: InitAnswers = {
  name: "test-app",
  runtime: "javascript",
  framework: "sam",
  database: "none",
  apiGateway: false,
  layer: false,
  memorySize: 256,
  force: false,
};

export const fullStackAnswers: InitAnswers = {
  name: "my-serverless-app",
  runtime: "typescript",
  framework: "sam",
  database: "dynamodb",
  apiGateway: true,
  layer: true,
  memorySize: 512,
  force: false,
};

export const serverlessAnswers: InitAnswers = {
  name: "sls-app",
  runtime: "javascript",
  framework: "serverless",
  database: "mongoose",
  apiGateway: true,
  layer: false,
  memorySize: 1024,
  force: false,
};

export const pythonAnswers: InitAnswers = {
  name: "py-app",
  runtime: "python",
  framework: "serverless",
  database: "none",
  apiGateway: false,
  layer: true,
  memorySize: 128,
  force: false,
};
