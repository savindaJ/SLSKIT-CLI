import { applyGlobalOptions, resetContext } from "../../src/core/context";
import { logger } from "../../src/core/logger";

describe("logger", () => {
  const writes: string[] = [];
  let stdoutWrite: typeof process.stdout.write;

  beforeEach(() => {
    writes.length = 0;
    stdoutWrite = process.stdout.write;
    process.stdout.write = ((chunk: string) => {
      writes.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
  });

  afterEach(() => {
    process.stdout.write = stdoutWrite;
    resetContext();
  });

  it("writes info by default", () => {
    logger.info("hello");
    expect(writes.join("")).toBe("hello\n");
  });

  it("suppresses info when --silent is set", () => {
    applyGlobalOptions({ silent: true });
    logger.info("hello");
    expect(writes).toEqual([]);
  });

  it("suppresses info when --json is set", () => {
    applyGlobalOptions({ json: true });
    logger.info("hello");
    expect(writes).toEqual([]);
  });
});
