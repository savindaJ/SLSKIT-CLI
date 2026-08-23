import { lambdaRuntime } from "../types.js";
import type { InitAnswers, ServiceDef, ServiceFunction } from "../types.js";

function serverlessFunction(
  answers: InitAnswers,
  fn: ServiceFunction
): string {
  const handler = `${fn.name}/handler.handler`;
  const events = answers.apiGateway
    ? `    events:
      - httpApi:
          path: ${fn.httpPath}
          method: ${fn.method.toLowerCase()}
`
    : "";

  return `  ${fn.name}:
    handler: ${handler}
${events}`;
}

function serverlessEnv(answers: InitAnswers): string {
  if (answers.database === "prisma") {
    return `    environment:
      DATABASE_URL: \${env:DATABASE_URL, ''}\n`;
  }
  if (answers.database === "mongoose") {
    return `    environment:
      MONGODB_URI: \${env:MONGODB_URI, ''}\n`;
  }
  if (answers.database === "dynamodb") {
    return `    environment:
      USERS_TABLE: users
      PRODUCTS_TABLE: products\n`;
  }
  return "";
}

function serverlessProviderExtras(answers: InitAnswers): string {
  const lines: string[] = [];

  if (answers.apiGateway) {
    lines.push(
      `  httpApi:`,
      `    id: \${cf:\${self:custom.project}-gateway-\${sls:stage}.HttpApiId}`
    );
  }

  if (answers.layer) {
    lines.push(
      `  layers:`,
      `    - \${cf:\${self:custom.project}-shared-\${sls:stage}.SharedLayerArn}`
    );
  }

  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}

export function serverlessTemplate(answers: InitAnswers, service: ServiceDef): string {
  const plugins: string[] = [];
  if (answers.runtime !== "python") {
    plugins.push("serverless-esbuild");
  }
  if (answers.runtime === "python") {
    plugins.push("serverless-python-requirements");
  }

  const pluginBlock =
    plugins.length > 0
      ? `plugins:\n${plugins.map((plugin) => `  - ${plugin}`).join("\n")}\n\n`
      : "";

  const customEsbuild =
    answers.runtime !== "python"
      ? `  esbuild:
    bundle: true
    minify: false
    sourcemap: true
    target: node20
    platform: node
    format: cjs
${answers.layer ? "    external:\n      - /opt/nodejs/*\n" : ""}`
      : "";

  const customPython =
    answers.runtime === "python"
      ? `  pythonRequirements:
    dockerizePip: false
`
      : "";

  const functions = service.functions
    .map((fn) => serverlessFunction(answers, fn))
    .join("");

  const resources =
    answers.database === "dynamodb"
      ? service.name === "auth"
        ? `
resources:
  Resources:
    UsersTable:
      Type: AWS::DynamoDB::Table
      Properties:
        TableName: users
        BillingMode: PAY_PER_REQUEST
        AttributeDefinitions:
          - AttributeName: id
            AttributeType: S
        KeySchema:
          - AttributeName: id
            KeyType: HASH
`
        : `
resources:
  Resources:
    ProductsTable:
      Type: AWS::DynamoDB::Table
      Properties:
        TableName: products
        BillingMode: PAY_PER_REQUEST
        AttributeDefinitions:
          - AttributeName: id
            AttributeType: S
        KeySchema:
          - AttributeName: id
            KeyType: HASH
`
      : "";

  return `service: ${answers.name}-${service.name}

frameworkVersion: "3"

custom:
  project: ${answers.name}
${customEsbuild}${customPython}
provider:
  name: aws
  runtime: ${lambdaRuntime(answers.runtime)}
  memorySize: ${answers.memorySize}
  stage: \${opt:stage, 'dev'}
  region: \${opt:region, 'us-east-1'}
${serverlessEnv(answers)}${serverlessProviderExtras(answers)}
${pluginBlock}functions:
${functions}${resources}`;
}

export function serverlessGatewayTemplate(answers: InitAnswers): string {
  return `service: ${answers.name}-gateway

frameworkVersion: "3"

provider:
  name: aws
  stage: \${opt:stage, 'dev'}
  region: \${opt:region, 'us-east-1'}

resources:
  Resources:
    HttpApi:
      Type: AWS::ApiGatewayV2::Api
      Properties:
        Name: ${answers.name}-http-api
        ProtocolType: HTTP
        CorsConfiguration:
          AllowOrigins:
            - "*"
          AllowMethods:
            - GET
            - POST
            - OPTIONS
          AllowHeaders:
            - "*"
    HttpApiStage:
      Type: AWS::ApiGatewayV2::Stage
      Properties:
        ApiId: !Ref HttpApi
        StageName: $default
        AutoDeploy: true
  Outputs:
    HttpApiId:
      Description: Shared HTTP API ID used by every function
      Value: !Ref HttpApi
      Export:
        Name: ${answers.name}-gateway-\${sls:stage}-HttpApiId
    HttpApiUrl:
      Description: Shared HTTP API URL
      Value: !Sub https://\${HttpApi}.execute-api.\${AWS::Region}.amazonaws.com
`;
}

export function serverlessLayerTemplate(answers: InitAnswers): string {
  const layerRuntimeDir = answers.runtime === "python" ? "python" : "nodejs";

  return `service: ${answers.name}-shared

frameworkVersion: "3"

provider:
  name: aws
  runtime: ${lambdaRuntime(answers.runtime)}
  stage: \${opt:stage, 'dev'}
  region: \${opt:region, 'us-east-1'}

layers:
  shared:
    path: ${layerRuntimeDir}
    name: ${answers.name}-shared
    description: Common utilities attached to every function
    compatibleRuntimes:
      - ${lambdaRuntime(answers.runtime)}
    retain: true

resources:
  Outputs:
    SharedLayerArn:
      Description: Shared layer ARN
      Value: !Ref SharedLambdaLayer
      Export:
        Name: ${answers.name}-shared-\${sls:stage}-SharedLayerArn
`;
}
