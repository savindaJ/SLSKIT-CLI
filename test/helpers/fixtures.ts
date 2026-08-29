import type { InitAnswers } from "../../src/commands/init/types";

export const minimalAnswers: InitAnswers = {
  name: "test-app",
  runtime: "javascript",
  database: "none",
  apiGateway: false,
  sharedApi: false,
  layer: false,
  memorySize: 256,
  force: false,
};

export const fullStackAnswers: InitAnswers = {
  name: "my-serverless-app",
  runtime: "typescript",
  database: "dynamodb",
  apiGateway: true,
  sharedApi: false,
  layer: true,
  memorySize: 512,
  force: false,
};

export const mongooseAnswers: InitAnswers = {
  name: "mongoose-app",
  runtime: "javascript",
  database: "mongoose",
  apiGateway: true,
  sharedApi: false,
  layer: false,
  memorySize: 1024,
  force: false,
};

export const pythonAnswers: InitAnswers = {
  name: "py-app",
  runtime: "python",
  database: "none",
  apiGateway: false,
  sharedApi: false,
  layer: true,
  memorySize: 128,
  force: false,
};

// One HTTP API for the whole project, which SAM can only express as a single
// flat template.
export const sharedApiAnswers: InitAnswers = {
  name: "shared-api-app",
  runtime: "typescript",
  database: "none",
  apiGateway: true,
  sharedApi: true,
  layer: true,
  memorySize: 256,
  force: false,
};
