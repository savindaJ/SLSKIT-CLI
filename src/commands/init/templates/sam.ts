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

function samParameters(envKeys: string[], extra: string[] = []): string {
  const params: string[] = [appEnvironmentParameter(), ...extra];

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

// Like CodeUri, this is relative to the template that declares it, not to the API mode.
function samSharedLayerResource(answers: InitAnswers, site: TemplateSite): string {
  const runtime = lambdaRuntime(answers.runtime);
  const buildMethod = answers.runtime === "python" ? "python3.12" : "nodejs20.x";
  const layerDir = answers.runtime === "python" ? "shared/python" : "shared/nodejs";
  const contentUri =
    site === "root" ? `${SRC_DIR}/${layerDir}` : `../${SRC_DIR}/${layerDir}`;

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

// A service template lives in templates/, one level below the project root; the flat
// local template is written at the project root itself.
type TemplateSite = "service" | "root";

function codeUriFor(site: TemplateSite): string {
  return site === "root" ? "./" : "../";
}

// With one shared API Gateway the API lives in the root stack, which SAM's HttpApi
// event cannot reach ("ApiId must be a valid reference to an AWS::Serverless::HttpApi
// resource in same template"). Plain API Gateway v2 resources have no such rule, so
// the routes are declared directly against the id the root passes down.
const SHARED_API_PARAM = "HttpApiId";

function samRawRoute(fn: ServiceFunction): string {
  const name = pascal(fn.name);

  return `
  ${name}Integration:
    Type: AWS::ApiGatewayV2::Integration
    Properties:
      ApiId: !Ref ${SHARED_API_PARAM}
      IntegrationType: AWS_PROXY
      IntegrationUri: !GetAtt ${name}Function.Arn
      PayloadFormatVersion: "2.0"

  ${name}Route:
    Type: AWS::ApiGatewayV2::Route
    Properties:
      ApiId: !Ref ${SHARED_API_PARAM}
      RouteKey: "${fn.method} ${fn.httpPath}"
      Target: !Sub "integrations/\${${name}Integration}"

  ${name}Permission:
    Type: AWS::Lambda::Permission
    Properties:
      Action: lambda:InvokeFunction
      FunctionName: !Ref ${name}Function
      Principal: apigateway.amazonaws.com
      SourceArn: !Sub "arn:\${AWS::Partition}:execute-api:\${AWS::Region}:\${AWS::AccountId}:\${${SHARED_API_PARAM}}/*/*"
`;
}

function sharedApiParameter(): string {
  return `  ${SHARED_API_PARAM}:
    Type: String
    Description: The project's shared HTTP API; this service attaches its routes to it`;
}

// The one API every service hangs its routes off. Declared with plain API Gateway v2
// resources rather than AWS::Serverless::HttpApi so that nested stacks can reference it.
function samSharedApiResources(answers: InitAnswers): string {
  return `  SharedHttpApi:
    Type: AWS::ApiGatewayV2::Api
    Properties:
      Name: !Sub "${answers.name}-\${${APP_ENVIRONMENT_PARAM}}"
      ProtocolType: HTTP
      CorsConfiguration:
        AllowMethods:
          - GET
          - POST
          - OPTIONS
        AllowHeaders:
          - "*"
        AllowOrigins:
          - "*"

  SharedHttpApiStage:
    Type: AWS::ApiGatewayV2::Stage
    Properties:
      ApiId: !Ref SharedHttpApi
      StageName: $default
      AutoDeploy: true

`;
}

function samFunction(
  answers: InitAnswers,
  service: ServiceDef,
  fn: ServiceFunction,
  envKeys: string[],
  site: TemplateSite
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
  // Routes are SAM events when the API is in this template, and separate API Gateway
  // resources when it lives in the root stack.
  const events =
    answers.apiGateway && !(answers.sharedApi && site === "service")
      ? samHttpEvent(fn)
      : "";

  // CodeUri is the project root: SAM stages it and runs npm install / pip install there,
  // so package.json and requirements.txt must be inside it.
  if (fnRuntime === "python") {
    return `  ${resource}:
    Type: AWS::Serverless::Function
    Properties:
${functionName}      CodeUri: ${codeUriFor(site)}
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
${functionName}      CodeUri: ${codeUriFor(site)}
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

// One stack per service, nested by the root. With per-service APIs the stack owns its
// own HTTP API; with a shared one it takes the API's id from the root and attaches
// routes to it.
export function samServiceTemplate(
  answers: InitAnswers,
  service: ServiceDef,
  envKeys: string[] = []
): string {
  const shared = answers.apiGateway && answers.sharedApi;

  const httpApi = answers.apiGateway && !shared ? samHttpApiResource() : "";
  const sharedLayer = answers.layer ? samSharedLayerResource(answers, "service") : "";
  const functions = service.functions
    .map((fn) => samFunction(answers, service, fn, envKeys, "service"))
    .join("\n");
  const routes = shared
    ? service.functions.map((fn) => samRawRoute(fn)).join("")
    : "";
  const dynamo = answers.database === "dynamodb" ? samDynamoResources(service) : "";

  // Only a service that owns its API has a URL of its own to report upward.
  const outputs =
    answers.apiGateway && !shared
      ? `
Outputs:
  HttpApiUrl:
    Description: HTTP API URL for the ${service.name} service
    Value: !Sub https://\${HttpApi}.execute-api.\${AWS::Region}.amazonaws.com
`
      : "";

  const parameters = shared
    ? samParameters(envKeys, [sharedApiParameter()])
    : samParameters(envKeys);

  return `AWSTemplateFormatVersion: "2010-09-09"
Transform: AWS::Serverless-2016-10-31
Description: ${service.name} service

${parameters}Globals:
  Function:
    Timeout: 10
    MemorySize: ${answers.memorySize}

Resources:
${httpApi}${sharedLayer}${functions}${routes}${dynamo}${outputs}`;
}

// Everything in one file: a single HTTP API, one layer, every function beside them.
// This is what "slskit run" serves, never what gets deployed. SAM local cannot resolve
// an API that lives in a parent stack, so a shared-API project is flattened for local
// use -- generated from the same manifest as the real templates, so it cannot drift.
export function samFlatTemplate(
  answers: InitAnswers,
  apps: ServiceDef[],
  envKeys: string[] = []
): string {
  const httpApi = answers.apiGateway ? samHttpApiResource() : "";
  const sharedLayer = answers.layer ? samSharedLayerResource(answers, "root") : "";

  const functions = apps
    .flatMap((service) =>
      service.functions.map((fn) => samFunction(answers, service, fn, envKeys, "root"))
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
  const shared = answers.apiGateway && answers.sharedApi;

  const parameterNames = [APP_ENVIRONMENT_PARAM, ...stageParameterNames(envKeys)];
  const passed = parameterNames.map((name) => `        ${name}: !Ref ${name}`);

  // The API is created here, so its id is handed to every service that attaches to it.
  if (shared) {
    passed.push(`        ${SHARED_API_PARAM}: !Ref SharedHttpApi`);
  }

  const parametersBlock =
    passed.length > 0 ? `      Parameters:\n${passed.join("\n")}\n` : "";

  const sharedApi = shared ? samSharedApiResources(answers) : "";

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

  // One shared API has one URL; per-service APIs each report their own.
  const outputs = !answers.apiGateway
    ? ""
    : shared
      ? `
Outputs:
  ApiUrl:
    Description: HTTP API URL for every service in this project
    Value: !Sub https://\${SharedHttpApi}.execute-api.\${AWS::Region}.amazonaws.com
`
      : `
Outputs:
${apps
  .map(
    (service) => `  ${pascal(service.name)}ApiUrl:
    Description: HTTP API URL for the ${service.name} service
    Value: !GetAtt ${pascal(service.name)}Stack.Outputs.HttpApiUrl`
  )
  .join("\n")}
`;

  return `AWSTemplateFormatVersion: "2010-09-09"
Transform: AWS::Serverless-2016-10-31
Description: ${answers.name} root stack

${samParameters(envKeys)}Resources:
${sharedApi}${services}${outputs}`;
}
