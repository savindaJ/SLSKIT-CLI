import fs from "node:fs";
import path from "node:path";

// Secrets live beside the project in .env.<stage>, which the generated .gitignore
// excludes. Nothing in this file is ever written into sless.json.
export function dotenvFileName(stage: string): string {
  return `.env.${stage}`;
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

  if (
    (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
    (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
  ) {
    value = value.slice(1, -1);
  }

  return [key, value];
}

export function readDotenv(cwd: string, stage: string): Record<string, string> {
  const file = path.join(cwd, dotenvFileName(stage));
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

// Values are quoted so spaces and "#" survive a round trip.
function formatLine(key: string, value: string): string {
  return /^[A-Za-z0-9_./:-]*$/.test(value) ? `${key}=${value}` : `${key}="${value.replace(/"/g, '\\"')}"`;
}

export function writeDotenv(
  cwd: string,
  stage: string,
  values: Record<string, string>
): string {
  const file = dotenvFileName(stage);
  const body = Object.keys(values)
    .sort()
    .map((key) => formatLine(key, values[key]))
    .join("\n");

  const header = `# Secret values for the "${stage}" stage. Never commit this file.\n`;
  fs.writeFileSync(
    path.join(cwd, file),
    body ? `${header}${body}\n` : header
  );

  return file;
}

export function setDotenvValue(
  cwd: string,
  stage: string,
  key: string,
  value: string
): string {
  const values = readDotenv(cwd, stage);
  values[key] = value;
  return writeDotenv(cwd, stage, values);
}

export function unsetDotenvValue(cwd: string, stage: string, key: string): void {
  const values = readDotenv(cwd, stage);
  if (!(key in values)) {
    return;
  }
  delete values[key];
  writeDotenv(cwd, stage, values);
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

  const addition = `${existing.endsWith("\n") || existing === "" ? "" : "\n"}.env.*\n!.env.example\n`;
  fs.writeFileSync(file, `${existing}${addition}`);
  return true;
}
