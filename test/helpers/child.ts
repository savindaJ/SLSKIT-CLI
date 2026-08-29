import { EventEmitter } from "node:events";

export interface FakeChild extends EventEmitter {
  kill: jest.Mock;
}

// Stands in for the long-running "sam local start-api" process. It reports a clean
// exit on the next tick so a command that waits for the local API to finish can
// complete inside a test, and records kill() so restart behaviour can be asserted.
export function fakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;

  child.kill = jest.fn(() => {
    setImmediate(() => child.emit("close", null, "SIGINT"));
    return true;
  });

  setImmediate(() => child.emit("close", 0, null));
  return child;
}
