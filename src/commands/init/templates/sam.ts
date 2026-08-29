import {
  APP_ENVIRONMENT_KEY,
  APP_ENVIRONMENT_PARAM,
  DEFAULT_ENVIRONMENT,
} from "../../../core/environments.js";
import { SRC_DIR, lambdaRuntime, sameRuntimeFamily, serviceTemplatePath } from "../types.js";
import type {
  DatabaseId,
  InitAnswers,
  ServiceDef,
  ServiceFunction,
} from "../types.js";
import { dynamoTableName, envParameterName, pascal } from "./helpers.js";

// DATABASE_URL and MONGODB_URI are not special-cased: init seeds them into
// .env.<environment> like any other variable, so they arrive through envKeys and are
// overridable per stage. Only the DynamoDB table names stay literal -- the templates
// create those tables, so they are not stage configuration.
function databaseVariables(database: DatabaseId): string[] {
  if (database === "dynamodb") {
    return ["USERS_TABLE: users", "PRODUCTS_TABLE: products"];
  }
  return [];
}

// Stage variables are wired to parameters rather than literals so one template can
// serve every stage: the deploy supplies the values as --parameter-overrides.
function environmentYaml(
  database: DatabaseId,
  envKeys: string[],
  indent: string
): string {
  const variables = [
    `${APP_ENVIRONMENT_KEY}: !Ref ${APP_ENVIRONMENT_PARAM}`,
    ...databaseVariables(database),
    ...envKeys.map((key) => `${key}: !Ref ${envParameterName(key)}`),
  ];

  const body = variables.map((line) => `${indent}    ${line}`).join("\n");
  return `${indent}Environment:\n${indent}  Variables:\n${body}\n`;
}

function stageParameterNames(envKeys: string[]): string[] {
  return envKeys.map(envParameterName);
}

function appEnvironmentParameter(): string {
  return `  ${APP_ENVIRONMENT_PARAM}:
    Type: String
    Default: ${DEFAULT_ENVIRONMENT}
    Description: Deployment environment; every stage-scoped resource name is built from it`;
}

function samParameters(envKeys: string[]): string {
  const params: string[] = [appEnvironmentParameter()];

  // Every stage variable defaults to empty, so a stage that does not set one can
  // still deploy from the same template without supplying an override. NoEcho is
  // unconditional: any of them may hold a connection string or an API key, and
  // nothing here reads a parameter value back out of CloudFormation.
  for (const key of envKeys) {
    params.push(`  ${envParameterName(key)}:
    Type: String
    Default: ""
    NoEcho: true
    Description: ${key} environment variable`);
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
  const layerDir = answers.runtime === "python" ? "shared/python" : "shared/nodejs";
  const contentUri = answers.sharedApi
    ? `${SRC_DIR}/${layerDir}`
    : `../${SRC_DIR}/${layerDir}`;

  return `  SharedLayer:
    Type: AWS::Serverless::LayerVersion
    Properties:
      LayerName: !Sub "\${AWS::StackName}-shared"
      Description: Shared utilities attached to every function
      ContentUri: ${contentUri}
      CompatibleRuntimes:
        - ${runtime}
      RetentionPolicy: Retain
    Metadata:
      BuildMethod: ${buildMethod}

`;
}

function samDynamoResources(service: ServiceDef): string {
  const { resource, table } = dynamoTableName(service.name);

  return `
  ${resource}:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: ${table}
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: id
          AttributeType: S
      KeySchema:
        - AttributeName: id
          KeyType: HASH
`;
}

function samPolicies(database: DatabaseId, service: ServiceDef): string {
  if (database !== "dynamodb") {
    return "";
  }

  const { resource } = dynamoTableName(service.name);
  return `      Policies:
        - DynamoDBCrudPolicy:
            TableName: !Ref ${resource}
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

function samFunctionName(answers: InitAnswers, fn: ServiceFunction): string {
  return `      FunctionName: !Sub "${answers.name}-\${${APP_ENVIRONMENT_PARAM}}-${fn.name}"\n`;
}

// A service template lives in templates/, one level below the project root; the
// flat template is the project root itself.
function codeUriFor(answers: InitAnswers): string {
  return answers.sharedApi ? "./" : "../";
}

function samFunction(
  answers: InitAnswers,
  service: ServiceDef,
  fn: ServiceFunction,
  envKeys: string[]
): string {
  const fnRuntime = fn.runtime ?? answers.runtime;
  // A function in a different runtime family than the project can't attach the
  // project's layer or import its db client, so it runs standalone instead.
  const sameFamily = sameRuntimeFamily(fnRuntime, answers.runtime);
  const useLayer = answers.layer && sameFamily;
  const database: DatabaseId = sameFamily ? answers.database : "none";
  const memorySize = fn.memorySize ?? answers.memorySize;

  const resource = `${pascal(fn.name)}Function`;
  const functionName = samFunctionName(answers, fn);
  const env = environmentYaml(database, envKeys, "      ");
  const policies = samPolicies(database, service);
  const runtime = lambdaRuntime(fnRuntime);
  const layers = useLayer ? `      Layers:\n        - !Ref SharedLayer\n` : "";
  const events = answers.apiGateway ? samHttpEvent(fn) : "";

  // CodeUri is the project root: SAM stages it and runs npm install / pip install there,
  // so package.json and requirements.txt must be inside it.
  if (fnRuntime === "python") {
    return `  ${resource}:
    Type: AWS::Serverless::Function
    Properties:
${functionName}      CodeUri: ${codeUriFor(answers)}
      Handler: ${SRC_DIR}.functions.${service.name}.${fn.name}.handler.handler
      Runtime: ${runtime}
      MemorySize: ${memorySize}
${env}${policies}${layers}${events}`;
  }

  const entryExt = fnRuntime === "typescript" ? "ts" : "js";
  const entry = `${SRC_DIR}/functions/${service.name}/${fn.name}/handler.${entryExt}`;
  const handlerPath = `${entry.replace(/\.(ts|js)$/, "")}.handler`;
  const externals = useLayer
    ? `        External:
          - "/opt/nodejs/*"
`
    : "";

  return `  ${resource}:
    Type: AWS::Serverless::Function
    Properties:
${functionName}      CodeUri: ${codeUriFor(answers)}
      Handler: ${handlerPath}
      Runtime: ${runtime}
      MemorySize: ${memorySize}
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
  service: ServiceDef,
  envKeys: string[] = []
): string {
  const httpApi = answers.apiGateway ? samHttpApiResource() : "";
  const sharedLayer = answers.layer ? samSharedLayerResource(answers) : "";
  const functions = service.functions
    .map((fn) => samFunction(answers, service, fn, envKeys))
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

${samParameters(envKeys)}Globals:
  Function:
    Timeout: 10
    MemorySize: ${answers.memorySize}

Resources:
${httpApi}${sharedLayer}${functions}${dynamo}${outputs}`;
}

// One template for the whole project: a single HTTP API, one layer, and every
// function beside them. SAM rejects an ApiId that points outside the template that
// declares the API, so sharing one API Gateway means everything lives together.
export function samFlatTemplate(
  answers: InitAnswers,
  apps: ServiceDef[],
  envKeys: string[] = []
): string {
  const httpApi = answers.apiGateway ? samHttpApiResource() : "";
  const sharedLayer = answers.layer ? samSharedLayerResource(answers) : "";

  const functions = apps
    .flatMap((service) =>
      service.functions.map((fn) => samFunction(answers, service, fn, envKeys))
    )
    .join("\n");

  const dynamo =
    answers.database === "dynamodb"
      ? apps.map((service) => samDynamoResources(service)).join("")
      : "";

  const outputs = answers.apiGateway
    ? `
Outputs:
  ApiUrl:
    Description: HTTP API URL for every function in this project
    Value: !Sub https://\${HttpApi}.execute-api.\${AWS::Region}.amazonaws.com
`
    : "";

  return `AWSTemplateFormatVersion: "2010-09-09"
Transform: AWS::Serverless-2016-10-31
Description: ${answers.name}

${samParameters(envKeys)}Globals:
  Function:
    Timeout: 10
    MemorySize: ${answers.memorySize}

Resources:
${httpApi}${sharedLayer}${functions}${dynamo}${outputs}`;
}

export function samRootTemplate(
  answers: InitAnswers,
  apps: ServiceDef[],
  envKeys: string[] = []
): string {
  const parameterNames = [APP_ENVIRONMENT_PARAM, ...stageParameterNames(envKeys)];
  const parametersBlock =
    parameterNames.length > 0
      ? `      Parameters:\n${parameterNames
          .map((name) => `        ${name}: !Ref ${name}`)
          .join("\n")}\n`
      : "";

  const services = apps
    .map((service) => {
      const resource = `${pascal(service.name)}Stack`;
      return `  ${resource}:
    Type: AWS::Serverless::Application
    Properties:
      Location: ${serviceTemplatePath(service.name)}
${parametersBlock}`;
    })
    .join("\n");

  const outputs = answers.apiGateway
    ? `
Outputs:
${apps
  .map(
    (service) => `  ${pascal(service.name)}ApiUrl:
    Description: HTTP API URL for the ${service.name} service
    Value: !GetAtt ${pascal(service.name)}Stack.Outputs.HttpApiUrl`
  )
  .join("\n")}
`
    : "";

  return `AWSTemplateFormatVersion: "2010-09-09"
Transform: AWS::Serverless-2016-10-31
Description: ${answers.name} root stack

${samParameters(envKeys)}Resources:
${services}${outputs}`;
}
