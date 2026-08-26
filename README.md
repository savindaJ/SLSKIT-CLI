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
slskit run                 # the default environment, port 3000
slskit run staging         # run with the staging environment
slskit run dev --port 4000 # an environment and a different port
slskit run --no-build      # skip sam build
```

Name the environment as the first argument (`--env staging` also works). It runs
with that environment's variables, so `APP_ENVIRONMENT` and everything set with
`slskit env set` are present locally exactly as they will be in AWS.

An environment that does not exist, or a `--secret` variable missing from its
`.env.<environment>`, fails before `sam` starts rather than booting with an empty
value. Override values are never printed — only how many there are.

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

Records the AWS credentials and deploy target for an environment. Run it from the
project root, before deploying. Prompts interactively when flags are omitted;
`--profile` (or credentials in the environment) and a region must be supplied in
a non-interactive shell.

```bash
slskit configure                                    # interactive, environment "dev"
slskit configure --profile work --region us-east-1
slskit configure --env production --profile prod-admin --region eu-west-2
```

| Flag | Values |
| --- | --- |
| `-e, --env` | Environment to configure — defaults to `dev` |
| `--profile` | AWS named profile to resolve credentials from |
| `--region` | AWS region to deploy into (example: `us-east-1`) |
| `--stack-name` | CloudFormation stack name — defaults to `<project>-<environment>` |
| `--skip-verify` | Save without checking that the credentials work |
| `--set-credentials` | Enter an AWS access key and store it in `~/.aws/credentials` |

Each value falls back, in order, to the flag, whatever the environment already
had, the shell (`AWS_PROFILE`, `AWS_REGION`), and then your AWS config file.
Credentials are verified with `aws sts get-caller-identity` and the command
fails without writing anything if they don't work — use `--skip-verify` to save
regardless. When the AWS CLI isn't installed the check is skipped with a notice.

#### Storing an AWS access key

If the credentials don't verify, `configure` offers to take a key there and then:

```text
Could not verify AWS credentials for profile "work" in us-east-1.
? Enter an AWS access key now and store it in ~/.aws/credentials? Yes
? AWS Access Key ID: AKIA...
? AWS Secret Access Key: [hidden]
```

The secret is never echoed. It is handed to `aws configure set`, which writes it
to `~/.aws/credentials` — **outside your project**, so it can never be committed.
Use `--set-credentials` to replace a key that already works.

**No credential material is ever written into the project.** Only the profile
*name* is stored in `sless.json`, and it is resolved at deploy time; when
credentials come from environment variables no profile is recorded at all.

### `slskit deploy [environment]`

Deploys one environment to AWS — every function, API Gateway, layer and table in
the project, under that environment's own CloudFormation stack.

```bash
slskit deploy                # the default environment
slskit deploy dev
slskit deploy production
slskit deploy production -y  # skip the confirmation prompt (CI)
```

| Flag | Meaning |
| --- | --- |
| `-e, --env` | Environment to deploy (the positional argument also works) |
| `-y, --yes` | Skip the confirmation prompt — required in a non-interactive shell |
| `--no-build` | Skip `sam build` |
| `--skip-verify` | Deploy without checking the credentials first |
| `--guided` | Run `sam deploy --guided` instead of the managed defaults |

Each environment deploys to its own stack with its own region, profile and
variables, so `dev` and `production` never touch each other:

| | dev | production |
| --- | --- | --- |
| Stack | `shop-dev` | `shop-production` |
| Lambda | `shop-dev-login` | `shop-production-login` |
| Region | whatever `configure` recorded | whatever `configure` recorded |

It stops before calling AWS if the environment has no region, doesn't exist, the
credentials don't verify, or a `--secret` variable is missing from its
`.env.<environment>` — so a failed deploy costs you nothing. Because deploying
creates real, billable AWS resources, it prints the plan and asks first:

```text
About to deploy "shop" to AWS.
  APP_ENVIRONMENT: production
  stack:       shop-production
  region:      eu-west-2
  functions:   4
    shop-production-login
    ...
This creates real AWS resources in your account and they cost money.
? Deploy to "production"? (y/N)
```

Nested stacks are deployed with `CAPABILITY_IAM` and `CAPABILITY_AUTO_EXPAND`,
and `--resolve-s3` provisions the artifact bucket, so a first deploy needs no
manual setup. Afterwards it prints each application's API URL.

### `slskit env`

Manages deployment environments and their variables. Every project starts with a
`dev` environment created by `slskit init`; add as many more as you need.

```bash
slskit env list                       # every environment, * marks the default
slskit env add production --profile prod-admin --region eu-west-2
slskit env use production             # what commands default to from now on
slskit env remove staging --yes
```

An environment is an independent deploy target: its own AWS region, profile,
CloudFormation stack, and variables.

```jsonc
"environments": {
  "default": "dev",
  "list": {
    "dev":        { "region": "us-east-1", "profile": "work",       "stackName": "shop-dev" },
    "production": { "region": "eu-west-2", "profile": "prod-admin", "stackName": "shop-production" }
  }
}
```

#### `APP_ENVIRONMENT`

Every environment generates one variable automatically, and every AWS resource
name is built from it:

```bash
APP_ENVIRONMENT=dev
```

| Thing | Name |
| --- | --- |
| CloudFormation stack | `<project>-<APP_ENVIRONMENT>` — `shop-production` |
| Lambda function | `<project>-<APP_ENVIRONMENT>-<function>` — `shop-production-login` |
| Lambda environment | `APP_ENVIRONMENT` is injected into every function |

It is written into `.env.<environment>`, injected into every Lambda, and always
equal to the environment name — so `slskit env set APP_ENVIRONMENT=...` is
refused. Create another environment with `slskit env add` instead.

Because a Lambda function name is capped at 64 characters, `slskit env add`
refuses an environment name that would push any function past the limit, rather
than letting the deploy fail halfway through.

#### Variables

```bash
slskit env set LOG_LEVEL=debug                        # plain value, in sless.json
slskit env set API_KEY=sk-live-abc --secret           # value in .env.<environment>
slskit env set DB_PASSWORD --ssm /shop/prod/db        # resolved by AWS at deploy
slskit env vars --env production                      # secrets masked
slskit env unset API_KEY
```

| Flag | Applies to | Meaning |
| --- | --- | --- |
| `-e, --env` | `set`, `unset`, `vars` | Environment to act on — defaults to the default environment |
| `--secret` | `set` | Store the value in `.env.<environment>`, never in `sless.json` |
| `--ssm <path>` | `set` | Store only the SSM path; AWS resolves the value at deploy |
| `--show-secrets` | `vars` | Reveal secret values instead of masking them |

#### How variables reach your functions

Templates are shared by every environment, so each variable becomes a
CloudFormation parameter (`LOG_LEVEL` → `EnvLogLevel`) that the deploy supplies
as `--parameter-overrides`. Adding or removing a variable name regenerates every
template so the parameter exists.

| Kind | Stored in | Reaches AWS as |
| --- | --- | --- |
| plain | `sless.json` | the literal value |
| `--secret` | `.env.<environment>` (gitignored) | the value read from that file at deploy |
| `--ssm` | `sless.json` (path only) | `{{resolve:ssm:<path>}}`, resolved by CloudFormation |

A variable marked `--secret` whose value is missing from `.env.<environment>`
fails the command with the exact `slskit env set` line that fixes it, rather
than deploying an empty string.

## Generated layout

```text
my-lambda-app/
├── src/
│   ├── functions/        # Lambda handlers, one folder per application
│   │   ├── auth/         #   template.yaml + login/ register/
│   │   └── product/      #   template.yaml + getProducts/ createProduct/
│   ├── services/         # business logic imported by the handlers
│   └── shared/           # shared utilities (a Lambda layer when --layer yes)
├── template.yaml         # root stack, nests one stack per application
├── .env.dev              # the dev environment's variables (gitignored)
└── sless.json            # machine-readable project graph
```

Each application owns a `template.yaml` next to its handlers, and the root stack
nests them, so applications can be deployed one at a time.

## Development

```bash
npm test          # jest
npm run test:watch
npm run build     # tsc
npm run dev       # tsx src/cli.ts
```
