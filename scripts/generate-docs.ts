import fs from "node:fs";
import path from "node:path";
import { generateFlagsMarkdown } from "../src/core/flags-docs";
import { createProgram } from "../src/program";

const OUTPUT = path.resolve(__dirname, "../docs/flags.md");

function main(): void {
  const markdown = generateFlagsMarkdown(createProgram());
  const check = process.argv.includes("--check");

  if (check) {
    const current = fs.existsSync(OUTPUT) ? fs.readFileSync(OUTPUT, "utf8") : "";
    if (current !== markdown) {
      console.error("docs/flags.md is out of date. Run: npm run docs");
      process.exitCode = 1;
      return;
    }
    return;
  }

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, markdown);
}

main();
