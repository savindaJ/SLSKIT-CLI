import { getContext } from "./context.js";

function shouldWriteInfo(): boolean {
  const { silent, json } = getContext();
  return !silent && !json;
}

export const logger = {
  info(message: string): void {
    if (!shouldWriteInfo()) {
      return;
    }
    process.stdout.write(`${message}\n`);
  },
  error(message: string): void {
    process.stderr.write(`${message}\n`);
  },
};
