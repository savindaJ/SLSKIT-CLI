import {
  LAMBDA_APPS,
  SRC_DIR,
  lambdaRuntime,
  serviceTemplatePath,
} from "../types.js";
import type { InitAnswers, ServiceDef, ServiceFunction } from "../types.js";
import { pascal } from "./helpers.js";

function environmentYaml(answers: InitAnswers, indent: string): string {
  if (answers.database === "prisma") {
    return `${indent}Environment:\n${indent}  Variables:\n${indent}    DATABASE_URL: !Ref DatabaseUrl\n`;
  }
  if (answers.database === "mongoose") {
    return `${indent}Environment:\n${indent}  Variables:\n${indent}    MONGODB_URI: !Ref MongoUri\n`;
  }
  if (answers.database === "dynamodb") {
    return `${indent}Environment:\n${indent}  Variables:\n${indent}    USERS_TABLE: users\n${indent}    PRODUCTS_TABLE: products\n`;
  }
  return "";
}

function databaseParameterNames(answers: InitAnswers): string[] {
  if (answers.database === "prisma") {
    return ["DatabaseUrl"];
  }
  if (answers.database === "mongoose") {
    return ["MongoUri"];
  }
  return [];
}

function samParameters(answers: InitAnswers): string {
  const params: string[] = [];

  if (answers.database === "prisma") {
    params.push(`  DatabaseUrl:
    Type: String
    Description: Prisma DATABASE_URL
    NoEcho: true`);
  }

  if (answers.database === "mongoose") {
    params.push(`  MongoUri:
    Type: String
    Description: MongoDB connection string
    NoEcho: true`);
  }

  if (params.length === 0) {
    return "";
  }

  return `Parameters:\n${params.join("\n")}\n\n`;
}

function samHttpApiResource(): string {
  return `  HttpApi:
    Type: AWS::Serverless::HttpApi
    Properties:
      StageName: $default
      CorsConfiguration:
        AllowMethods:
          - GET
          - POST
          - OPTIONS
        AllowHeaders:
          - "*"
        AllowOrigins:
          - "*"

`;
}

function samSharedLayerResource(answers: InitAnswers): string {
  const runtime = lambdaRuntime(answers.runtime);
  const buildMethod = answers.runtime === "python" ? "python3.12" : "nodejs20.x";
  const contentUri =
    answers.runtime === "python" ? "../../shared/python" : "../../shared/nodejs";

  return `  SharedLayer:
    Type: AWS::Serverless::LayerVersion
    Properties:
      LayerName: !Sub \${AWS::StackName}-shared
      Description: Shared utilities attached to every function in this service
      ContentUri: ${contentUri}
      CompatibleRuntimes:
        - ${runtime}
      RetentionPolicy: Retain
    Metadata:
      BuildMethod: ${buildMethod}

`;
}

function samDynamoResources(service: ServiceDef): string {
  const table = service.name === "auth" ? "UsersTable" : "ProductsTable";
  const tableName = service.name === "auth" ? "users" : "products";

  return `
  ${table}:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: ${tableName}
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: id
          AttributeType: S
      KeySchema:
        - AttributeName: id
          KeyType: HASH
`;
}

function samPolicies(answers: InitAnswers, service: ServiceDef): string {
  if (answers.database !== "dynamodb") {
    return "";
  }

  const table = service.name === "auth" ? "UsersTable" : "ProductsTable";
  return `      Policies:
        - DynamoDBCrudPolicy:
            TableName: !Ref ${table}
`;
}

function samHttpEvent(fn: ServiceFunction): string {
  return `      Events:
        ${pascal(fn.name)}Api:
          Type: HttpApi
          Properties:
            ApiId: !Ref HttpApi
            Path: ${fn.httpPath}
            Method: ${fn.method}
`;
}

function samFunction(
  answers: InitAnswers,
  service: ServiceDef,
  fn: ServiceFunction
): string {
  const resource = `${pascal(fn.name)}Function`;
  const env = environmentYaml(answers, "      ");
  const policies = samPolicies(answers, service);
  const runtime = lambdaRuntime(answers.runtime);
  const layers = answers.layer
    ? `      Layers:\n        - !Ref SharedLayer\n`
    : "";
  const events = answers.apiGateway ? samHttpEvent(fn) : "";

  // CodeUri is the project root: SAM stages it and runs npm install / pip install there,
  // so package.json and requirements.txt must be inside it.
  if (answers.runtime === "python") {
    return `  ${resource}:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: ../../../
      Handler: ${SRC_DIR}.functions.${service.name}.${fn.name}.handler.handler
      Runtime: ${runtime}
${env}${policies}${layers}${events}`;
  }

  const entryExt = answers.runtime === "typescript" ? "ts" : "js";
  const entry = `${SRC_DIR}/functions/${service.name}/${fn.name}/handler.${entryExt}`;
  const handlerPath = `${entry.replace(/\.(ts|js)$/, "")}.handler`;
  const externals = answers.layer
    ? `        External:
          - "/opt/nodejs/*"
`
    : "";

  return `  ${resource}:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: ../../../
      Handler: ${handlerPath}
      Runtime: ${runtime}
${env}${policies}${layers}${events}    Metadata:
      BuildMethod: esbuild
      BuildProperties:
        Format: cjs
        Minify: false
        Target: es2020
        Sourcemap: true
        EntryPoints:
          - ${entry}
${externals}`;
}

// Each service stack is self-contained: it owns its HTTP API, layer and tables, so that
// SAM can resolve every reference locally (a cross-stack ApiId breaks sam build).
export function samServiceTemplate(
  answers: InitAnswers,
  service: ServiceDef
): string {
  const httpApi = answers.apiGateway ? samHttpApiResource() : "";
  const sharedLayer = answers.layer ? samSharedLayerResource(answers) : "";
  const functions = service.functions
    .map((fn) => samFunction(answers, service, fn))
    .join("\n");
  const dynamo = answers.database === "dynamodb" ? samDynamoResources(service) : "";

  const outputs = answers.apiGateway
    ? `
Outputs:
  HttpApiUrl:
    Description: HTTP API URL for the ${service.name} service
    Value: !Sub https://\${HttpApi}.execute-api.\${AWS::Region}.amazonaws.com
`
    : "";

  return `AWSTemplateFormatVersion: "2010-09-09"
Transform: AWS::Serverless-2016-10-31
Description: ${service.name} service

${samParameters(answers)}Globals:
  Function:
    Timeout: 10
    MemorySize: ${answers.memorySize}

Resources:
${httpApi}${sharedLayer}${functions}${dynamo}${outputs}`;
}

export function samRootTemplate(answers: InitAnswers): string {
  const parameterNames = databaseParameterNames(answers);
  const parametersBlock =
    parameterNames.length > 0
      ? `      Parameters:\n${parameterNames
          .map((name) => `        ${name}: !Ref ${name}`)
          .join("\n")}\n`
      : "";

  const services = LAMBDA_APPS.map((service) => {
    const resource = `${pascal(service.name)}Stack`;
    return `  ${resource}:
    Type: AWS::Serverless::Application
    Properties:
      Location: ${serviceTemplatePath("sam", service.name)}
${parametersBlock}`;
  }).join("\n");

  const outputs = answers.apiGateway
    ? `
Outputs:
${LAMBDA_APPS.map(
  (service) => `  ${pascal(service.name)}ApiUrl:
    Description: HTTP API URL for the ${service.name} service
    Value: !GetAtt ${pascal(service.name)}Stack.Outputs.HttpApiUrl`
).join("\n")}
`
    : "";

  return `AWSTemplateFormatVersion: "2010-09-09"
Transform: AWS::Serverless-2016-10-31
Description: ${answers.name} root stack

${samParameters(answers)}Resources:
${services}${outputs}`;
}
