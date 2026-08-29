import fs from "node:fs";
import path from "node:path";
import { classifyChange, planRebuild } from "./resources.js";
import type { ApplicationView, Change } from "./resources.js";

// Editors save in bursts -- a write, a rename, sometimes a companion file -- so
// events are collected for a moment and acted on once.
const DEBOUNCE_MS = 200;

const IGNORED_DIRS = new Set([".aws-sam", "node_modules", "dist", ".git", ".venv"]);

const WATCHED_EXTENSIONS = new Set([".ts", ".js", ".mjs", ".cjs", ".py", ".json", ".yaml", ".yml"]);

// Editors write temporary siblings while saving; acting on those would rebuild twice.
function isRelevant(relativePath: string): boolean {
  const base = path.basename(relativePath);

  if (base.startsWith(".") && !base.startsWith(".env")) {
    return false;
  }

  if (base.startsWith(".env")) {
    return true;
  }

  if (base.endsWith("~") || base.endsWith(".swp") || base.endsWith(".tmp")) {
    return false;
  }

  return WATCHED_EXTENSIONS.has(path.extname(base));
}

function directoriesUnder(root: string): string[] {
  const found: string[] = [];

  const walk = (dir: string): void => {
    found.push(dir);
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory() && !IGNORED_DIRS.has(entry.name)) {
        walk(path.join(dir, entry.name));
      }
    }
  };

  walk(root);
  return found;
}

export interface WatchHandlers {
  onFunctions: (resourceIds: string[], labels: string[]) => void;
  onFull: (labels: string[]) => void;
  onRestart: (labels: string[]) => void;
}

export interface Watcher {
  close: () => void;
}

// Watches the project's sources plus the files that decide how sam is started, and
// hands each debounced batch to the caller as one decision.
export function watchProject(
  cwd: string,
  applications: ApplicationView[],
  handlers: WatchHandlers,
  sharedApi = false
): Watcher {
  const watchers: fs.FSWatcher[] = [];
  const batch: Change[] = [];
  let timer: NodeJS.Timeout | undefined;
  let closed = false;

  const flush = (): void => {
    timer = undefined;
    if (closed || batch.length === 0) {
      return;
    }

    const plan = planRebuild(batch.splice(0, batch.length));

    if (plan.kind === "restart") {
      handlers.onRestart(plan.labels);
      return;
    }

    if (plan.kind === "full") {
      handlers.onFull(plan.labels);
      return;
    }

    handlers.onFunctions(plan.resourceIds, plan.labels);
  };

  const record = (relativePath: string): void => {
    if (closed || !isRelevant(relativePath)) {
      return;
    }

    batch.push(classifyChange(applications, relativePath, sharedApi));

    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(flush, DEBOUNCE_MS);
  };

  const watchDir = (dir: string, recursive: boolean): boolean => {
    try {
      const watcher = fs.watch(dir, { recursive }, (_event, filename) => {
        if (!filename) {
          return;
        }
        record(path.relative(cwd, path.join(dir, filename.toString())));
      });
      watchers.push(watcher);
      return true;
    } catch {
      return false;
    }
  };

  for (const name of ["src", "templates"]) {
    const dir = path.join(cwd, name);
    if (!fs.existsSync(dir)) {
      continue;
    }

    // Recursive watching is not available on every platform, so each directory is
    // watched individually when it is not.
    if (!watchDir(dir, true)) {
      for (const child of directoriesUnder(dir)) {
        watchDir(child, false);
      }
    }
  }

  // The project root itself, for template.yaml, slskit.json and the .env files. Not
  // recursive: everything below it that matters is already covered above.
  watchDir(cwd, false);

  return {
    close: () => {
      closed = true;
      if (timer) {
        clearTimeout(timer);
      }
      for (const watcher of watchers) {
        watcher.close();
      }
    },
  };
}

export function describeChange(labels: string[]): string {
  if (labels.length <= 2) {
    return labels.join(", ");
  }
  return `${labels.slice(0, 2).join(", ")} and ${labels.length - 2} more`;
}
