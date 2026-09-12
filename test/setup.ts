import { resetContext } from "../src/core/context";

const suiteCwd = process.cwd();

Object.defineProperty(process.stdin, "isTTY", {
  configurable: true,
  value: false,
});

afterEach(() => {
  process.exitCode = undefined;
  resetContext();
  if (process.cwd() !== suiteCwd) {
    process.chdir(suiteCwd);
  }
});
