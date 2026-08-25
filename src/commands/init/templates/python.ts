import { SRC_DIR } from "../types.js";
import type { InitAnswers, ServiceFunction } from "../types.js";

export function pythonService(answers: InitAnswers, fn: ServiceFunction): string {
  // The layer lands on sys.path as /opt/python, so its modules are imported bare.
  // Everything else is packaged from the project root, hence the src. prefix.
  const loggerImport = answers.layer
    ? "from logger import logger"
    : `from ${SRC_DIR}.shared.logger import logger`;
  // db is never in the layer, so it is always imported from the packaged source tree.
  const dbImport =
    answers.database === "none"
      ? ""
      : answers.database === "dynamodb"
        ? `from ${SRC_DIR}.shared.db import users_table, products_table\n`
        : `from ${SRC_DIR}.shared.db import connect_db\n`;

  const dbSetup =
    answers.database === "none"
      ? ""
      : answers.database === "dynamodb"
        ? "    _ = (users_table, products_table)\n"
        : "    _ = connect_db\n";

  return `import json
${loggerImport}
${dbImport}
def ${fn.name}(event, context):
${dbSetup}    logger.info("${fn.name} invoked")
    body = event.get("body")
    payload = json.loads(body) if body else {}

    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({"message": "${fn.name}", "input": payload}),
    }
`;
}

// Used when a function's runtime family differs from the project's: it can't attach
// the project's layer or import its db client (built for the other family), so it
// ships as a plain, self-contained handler instead.
export function standalonePythonService(fn: ServiceFunction): string {
  return `import json


def ${fn.name}(event, context):
    print(json.dumps({"level": "info", "message": "${fn.name} invoked"}))
    body = event.get("body")
    payload = json.loads(body) if body else {}

    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({"message": "${fn.name}", "input": payload}),
    }
`;
}

export function pythonHandler(appName: string, fn: ServiceFunction): string {
  return `from ${SRC_DIR}.services.${appName}.${fn.name} import ${fn.name}


def handler(event, context):
    return ${fn.name}(event, context)
`;
}
