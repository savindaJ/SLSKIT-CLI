/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/test"],
  testMatch: ["**/*.test.ts"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  setupFilesAfterEnv: ["<rootDir>/test/setup.ts"],
  clearMocks: true,
  maxWorkers: "50%",
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        diagnostics: { ignoreCodes: [151002] },
        tsconfig: "tsconfig.test.json",
      },
    ],
  },
};
