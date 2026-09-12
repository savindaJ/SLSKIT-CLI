#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

if (pkg.license !== "MIT") {
  console.error(`package.json license must be MIT (found ${pkg.license}).`);
  process.exitCode = 1;
}

const licenseFile = fs.readFileSync(path.join(root, "LICENSE"), "utf8");
if (!licenseFile.includes("MIT License")) {
  console.error("LICENSE does not look like an MIT license.");
  process.exitCode = 1;
}

const allowed = new Set([
  "MIT",
  "ISC",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "0BSD",
  "Unlicense",
  "CC0-1.0",
  "BlueOak-1.0.0",
]);

const blocked = /GPL|AGPL|LGPL|SSPL|BUSL|Commons Clause/i;

const names = Object.keys(pkg.dependencies ?? {});
const report = [];

for (const name of names) {
  const depPkgPath = path.join(root, "node_modules", name, "package.json");
  if (!fs.existsSync(depPkgPath)) {
    console.error(`Missing installed package: ${name}. Run npm ci first.`);
    process.exitCode = 1;
    continue;
  }

  const dep = JSON.parse(fs.readFileSync(depPkgPath, "utf8"));
  const license = typeof dep.license === "string" ? dep.license : JSON.stringify(dep.license);
  report.push(`${name}: ${license}`);

  if (blocked.test(license) || !allowed.has(license)) {
    console.error(`Blocked or unknown license on production dependency ${name}: ${license}`);
    process.exitCode = 1;
  }
}

if (!process.exitCode) {
  console.log(`Project license: ${pkg.license}`);
  for (const line of report) {
    console.log(line);
  }
}
