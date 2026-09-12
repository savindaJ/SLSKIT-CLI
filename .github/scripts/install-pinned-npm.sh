#!/usr/bin/env bash
set -euo pipefail

NODE_MAJOR="$(node -p "Number(process.version.slice(1).split('.')[0])")"

# npm 11 requires Node 20.17+; use npm 10 on Node 18.
if [[ "$NODE_MAJOR" -ge 20 ]]; then
  npm install -g npm@11.19.1
else
  npm install -g npm@10.9.4
fi

npm --version
