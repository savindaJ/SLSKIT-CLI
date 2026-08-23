# sless

Global CLI for scaffolding and running multi-service AWS Lambda projects.

## Install

```bash
npm install
npm run build
npm link
```

## Commands

### `sless init [name]`

Scaffolds a multi-service serverless project. Runs interactively when flags are
omitted; every flag must be supplied in a non-interactive shell.

```bash
sless init my-lambda-app \
  --runtime typescript \
  --framework sam \
  --database none \
  --api-gateway yes \
  --layer yes \
  --memory 128
```

| Flag | Values |
| --- | --- |
| `-r, --runtime` | `typescript` \| `javascript` \| `python` |
| `--framework` | `sam` \| `serverless` |
| `--database` | `none` \| `prisma` \| `mongoose` \| `dynamodb` |
| `--api-gateway` | `yes` \| `no` — attach every function to a single HTTP API |
| `--layer` | `yes` \| `no` — publish `shared/` as a common Lambda layer |
| `--memory` | `128` \| `256` \| `512` \| `1024` \| `2048` \| `3008` \| `4096` \| `10240` |
| `-f, --force` | Overwrite files if the folder already exists |

Use `sless init .` to scaffold into the current directory.

> `--force` overwrites existing files in place. Never run it in a directory that
> already holds a project you care about.

### `sless run`

Runs the generated SAM project locally, serving every application from a single
API Gateway port. Verifies the AWS SAM CLI is installed first, and offers to
install it (Homebrew on macOS, snap on Linux) when it is missing.

```bash
sless run                 # sam build, then sam local start-api on port 3000
sless run --port 4000     # use a different port
sless run --no-build      # skip sam build
```

## Generated layout

```text
my-lambda-app/
├── functions/            # Lambda handlers, one folder per application
│   ├── auth/src/login/
│   └── product/src/getProducts/
├── services/             # business logic imported by the handlers
├── shared/               # shared utilities (a Lambda layer when --layer yes)
├── template.yaml         # single SAM stack: HTTP API, layer, and functions
└── sless.json            # machine-readable project graph
```

## Development

```bash
npm test          # jest
npm run test:watch
npm run build     # tsc
npm run dev       # tsx src/cli.ts
```
