# slskit

Global CLI for scaffolding and running multi-service AWS Lambda projects.

## Install

```bash
npm install
npm run build
npm link
```

## Commands

### `slskit init [name]`

Scaffolds a multi-service AWS SAM project. Runs interactively when flags are
omitted; every flag must be supplied in a non-interactive shell.

```bash
slskit init my-lambda-app \
  --runtime typescript \
  --database none \
  --api-gateway yes \
  --layer yes \
  --memory 128
```

| Flag | Values |
| --- | --- |
| `-r, --runtime` | `typescript` \| `javascript` \| `python` |
| `--database` | `none` \| `prisma` \| `mongoose` \| `dynamodb` |
| `--api-gateway` | `yes` \| `no` — attach every function to a single HTTP API |
| `--layer` | `yes` \| `no` — publish `shared/` as a common Lambda layer |
| `--memory` | `128` \| `256` \| `512` \| `1024` \| `2048` \| `3008` \| `4096` \| `10240` |
| `-f, --force` | Overwrite files if the folder already exists |

Use `slskit init .` to scaffold into the current directory.

> `--force` overwrites existing files in place. Never run it in a directory that
> already holds a project you care about.

### `slskit run`

Runs the generated SAM project locally, serving every application from a single
API Gateway port. Verifies the AWS SAM CLI is installed first, and offers to
install it (Homebrew on macOS, snap on Linux) when it is missing.

```bash
slskit run                 # sam build, then sam local start-api on port 3000
slskit run --port 4000     # use a different port
slskit run --no-build      # skip sam build
```

### `slskit function [name]`

Adds a function to an existing or brand-new application inside a project already
scaffolded by `slskit init`. Run it from the project root. Prompts interactively
when flags are omitted; every flag must be supplied in a non-interactive shell.

```bash
slskit function resetPassword \
  --app auth \
  --method POST \
  --memory 512 \
  --runtime typescript
```

| Flag | Values |
| --- | --- |
| `--app` | Attach to an existing application (mutually exclusive with `--new-app`) |
| `--new-app` | Create a new application with this name |
| `--method` | `GET` \| `POST` \| `PUT` \| `DELETE` \| `PATCH` |
| `--memory` | `128` \| `256` \| `512` \| `1024` \| `2048` \| `3008` \| `4096` \| `10240` |
| `-r, --runtime` | `typescript` \| `javascript` \| `python` |

Each function can use a different language than the rest of the project — a
Python function can live next to TypeScript ones in the same application. A
function whose language differs from the project's own runtime family (Node vs.
Python) can't attach the project's shared Lambda layer or database client, so it
is generated standalone instead (plain success response, no shared imports). The
command also updates that application's infra template, the root `template.yaml`
when a SAM app is brand new, `sless.json`, and — if the new function needs
tooling the project doesn't have yet (e.g. the first TypeScript function in a
JavaScript project, or the first Node function in a Python project) —
`package.json`/`tsconfig.json`, followed by `npm install`.

### `slskit configure`

Records the AWS credentials and deploy target for a stage. Run it from the
project root, before deploying. Prompts interactively when flags are omitted;
`--profile` (or credentials in the environment) and a region must be supplied in
a non-interactive shell.

```bash
slskit configure                                    # interactive, stage "dev"
slskit configure --profile work --region us-east-1
slskit configure --stage prod --profile prod-admin --region eu-west-2
```

| Flag | Values |
| --- | --- |
| `--stage` | Stage to configure — defaults to `dev` |
| `--profile` | AWS named profile to resolve credentials from |
| `--region` | AWS region to deploy into (example: `us-east-1`) |
| `--stack-name` | CloudFormation stack name — defaults to `<project>-<stage>` |
| `--skip-verify` | Save without checking that the credentials work |

Each value falls back, in order, to the flag, whatever the stage already had,
the environment (`AWS_PROFILE`, `AWS_REGION`), and then your AWS config file.
Credentials are verified with `aws sts get-caller-identity` and the command
fails without writing anything if they don't work — use `--skip-verify` to save
regardless. When the AWS CLI isn't installed the check is skipped with a notice.

**No credential material is ever written to disk.** Only the profile *name* is
stored in `sless.json`, and it is resolved at deploy time; when credentials come
from environment variables no profile is recorded at all.

```jsonc
"deployment": {
  "defaultStage": "dev",
  "stages": {
    "dev": { "region": "us-east-1", "profile": "work", "stackName": "my-app-dev" }
  }
}
```

### `slskit stage`

Manages deployment stages. Every stage is an independent deploy target — its own
AWS region, profile, CloudFormation stack, and environment variables.

```bash
slskit stage list
slskit stage add staging --profile work --region eu-west-2
slskit stage use production      # change the stage other commands default to
slskit stage remove staging --yes
```

`stage add` runs the same setup as `slskit configure --stage <name>`, so it
verifies the credentials before saving. The first stage you configure becomes the
default; `stage use` changes it. Removing a stage leaves its `.env.<stage>` file
on disk so secrets are never silently deleted.

### `slskit env`

Manages the environment variables of one stage. Every stage-aware command falls
back to the project's default stage when `--stage` is omitted.

```bash
slskit env set LOG_LEVEL=info                            # committed to sless.json
slskit env set DATABASE_URL --secret --stage production  # prompts, writes .env.production
slskit env set API_KEY --ssm /app/prod/api-key           # resolved from Parameter Store
slskit env list --stage production
slskit env unset API_KEY --stage production
```

| Flag | Applies to | Meaning |
| --- | --- | --- |
| `--stage` | all | Stage to act on — defaults to the project's default stage |
| `--secret` | `set` | Store the value in `.env.<stage>` instead of `sless.json` |
| `--ssm <path>` | `set` | Resolve the value from an SSM Parameter Store path |
| `--show-secrets` | `list` | Print secret values instead of masking them |

Each variable records **where its value comes from**, never the secret itself:

```jsonc
"deployment": {
  "defaultStage": "dev",
  "stages": {
    "production": {
      "region": "eu-west-2",
      "profile": "prod-admin",
      "stackName": "my-app-production",
      "env": {
        "LOG_LEVEL":    { "value": "info" },              // committed
        "DATABASE_URL": { "secret": true },               // value in .env.production
        "API_KEY":      { "ssm": "/app/prod/api-key" }    // value in AWS
      }
    }
  }
}
```

> Secret values are written to `.env.<stage>`, and `slskit env set --secret` repairs
> your `.gitignore` if it doesn't already exclude `.env.*`. A secret value is never
> written to `sless.json`.

#### How variables reach your functions

Templates are shared by every stage, so each one declares a CloudFormation
parameter for the **union** of variable names across all stages, and every function
references them:

```yaml
Parameters:
  EnvLogLevel:
    Type: String
    Default: ""            # a stage that doesn't set it still deploys
Resources:
  LoginFunction:
    Properties:
      Environment:
        Variables:
          LOG_LEVEL: !Ref EnvLogLevel
```

`LOG_LEVEL` becomes the parameter `EnvLogLevel`; the `Env` prefix keeps stage
variables from colliding with the database parameters the templates already
declare. Two keys that collapse to the same parameter name are rejected when you
set the second one. Templates are regenerated automatically on every `env set`,
`env unset`, and `stage remove`, so they always match the manifest.

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
