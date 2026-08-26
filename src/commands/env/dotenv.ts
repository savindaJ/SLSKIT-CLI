import fs from "node:fs";
import path from "node:path";
import { APP_ENVIRONMENT_KEY } from "../../core/environments.js";

// Secret values live beside the project in .env.<environment>, which the generated
// .gitignore excludes. Nothing in this file is ever written into sless.json.
export function dotenvFileName(environment: string): string {
  return `.env.${environment}`;
}

function parseLine(line: string): [string, string] | undefined {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return undefined;
  }

  const eq = trimmed.indexOf("=");
  if (eq <= 0) {
    return undefined;
  }

  const key = trimmed.slice(0, eq).trim();
  let value = trimmed.slice(eq + 1).trim();

  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    value = value.slice(1, -1).replace(/\\(["\\])/g, "$1");
  } else if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
    value = value.slice(1, -1);
  }

  return [key, value];
}

export function readDotenv(
  cwd: string,
  environment: string
): Record<string, string> {
  const file = path.join(cwd, dotenvFileName(environment));
  if (!fs.existsSync(file)) {
    return {};
  }

  const values: Record<string, string> = {};
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const entry = parseLine(line);
    if (entry) {
      values[entry[0]] = entry[1];
    }
  }

  return values;
}

// Values are quoted when they contain anything that would not survive a raw round trip.
function formatLine(key: string, value: string): string {
  if (/^[A-Za-z0-9_./:-]*$/.test(value)) {
    return `${key}=${value}`;
  }

  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `${key}="${escaped}"`;
}

// APP_ENVIRONMENT is always written first and always equals the environment name,
// so the file is self-describing and can never disagree with the manifest.
export function writeDotenv(
  cwd: string,
  environment: string,
  values: Record<string, string>
): string {
  const file = dotenvFileName(environment);
  const rest = Object.keys(values)
    .filter((key) => key !== APP_ENVIRONMENT_KEY)
    .sort()
    .map((key) => formatLine(key, values[key]));

  const body = [formatLine(APP_ENVIRONMENT_KEY, environment), ...rest].join("\n");
  const header = `# Values for the "${environment}" environment. Never commit this file.\n`;

  fs.writeFileSync(path.join(cwd, file), `${header}${body}\n`);
  return file;
}

export function setDotenvValue(
  cwd: string,
  environment: string,
  key: string,
  value: string
): string {
  const values = readDotenv(cwd, environment);
  values[key] = value;
  return writeDotenv(cwd, environment, values);
}

export function unsetDotenvValue(
  cwd: string,
  environment: string,
  key: string
): void {
  const values = readDotenv(cwd, environment);
  if (!(key in values)) {
    return;
  }
  delete values[key];
  writeDotenv(cwd, environment, values);
}

// A leaked credential is the expensive failure here, so the ignore rule is repaired
// on every write rather than trusted to whatever the project was scaffolded with.
export function ensureDotenvIgnored(cwd: string): boolean {
  const file = path.join(cwd, ".gitignore");
  const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const lines = existing.split("\n").map((line) => line.trim());

  if (lines.includes(".env.*")) {
    return false;
  }

  const separator = existing.endsWith("\n") || existing === "" ? "" : "\n";
  fs.writeFileSync(file, `${existing}${separator}.env.*\n!.env.example\n`);
  return true;
}
