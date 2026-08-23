Object.defineProperty(process.stdin, "isTTY", {
  configurable: true,
  value: false,
});

afterEach(() => {
  process.exitCode = undefined;
});
