import type { Command } from "commander";

const GLOBAL_LONG = new Set(["--cwd", "--debug", "--silent", "--json", "--version"]);

const HEADER = `# slskit — generated flag reference

This file is generated from the Commander program. Do not edit it by hand.

\`\`\`bash
npm run docs
\`\`\`

CI fails if this file is stale. Narrative docs live in [COMMAND.md](../COMMAND.md).

`;

function optionLine(option: {
  flags: string;
  description?: string;
  defaultValue?: unknown;
  long?: string;
}): string {
  const def =
    option.defaultValue === undefined || option.defaultValue === false
      ? ""
      : ` (default: \`${String(option.defaultValue)}\`)`;
  return `- \`${option.flags}\` — ${option.description ?? ""}${def}`;
}

function walk(command: Command, trail: string[]): string[] {
  const name = [...trail, command.name()].filter(Boolean).join(" ");
  const sections: string[] = [];

  if (trail.length > 0 || command.name() !== "slskit") {
    const args = command.registeredArguments ?? [];
    const argText = args
      .map((argument) => (argument.required ? `<${argument.name()}>` : `[${argument.name()}]`))
      .join(" ");
    const heading = argText ? `${name} ${argText}` : name;

    sections.push(`## \`${heading}\``, "");
    if (command.description()) {
      sections.push(command.description(), "");
    }

    const options = command.options.filter(
      (option) => !option.hidden && !GLOBAL_LONG.has(option.long ?? "")
    );
    if (options.length > 0) {
      sections.push("Flags:", "");
      for (const option of options) {
        sections.push(optionLine(option));
      }
      sections.push("");
    }
  }

  for (const child of command.commands) {
    const nextTrail = [...trail, command.name() === "slskit" ? "" : command.name()].filter(Boolean);
    sections.push(...walk(child, nextTrail));
  }

  return sections;
}

export function generateFlagsMarkdown(program: Command): string {
  const globals = program.options.filter((option) => !option.hidden);
  const parts = [
    HEADER,
    "## Global flags",
    "",
    "Available on every command.",
    "",
    ...globals.map(optionLine),
    "",
    ...walk(program, []),
  ];

  return `${parts.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}
