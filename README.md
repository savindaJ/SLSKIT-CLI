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
  --shared-api yes \
  --layer yes \
  --memory 128
```

| Flag | Values |
| --- | --- |
| `-r, --runtime` | `typescript` \| `javascript` \| `python` |
| `--database` | `none` \| `prisma` \| `mongoose` \| `dynamodb` |
| `--api-gateway` | `yes` \| `no` — expose the functions over HTTP |
| `--shared-api` | `yes` \| `no` — one API Gateway for everything, or one per service |
| `--layer` | `yes` \| `no` — publish `shared/` as a common Lambda layer |
| `--memory` | `128` \| `256` \| `512` \| `1024` \| `2048` \| `3008` \| `4096` \| `10240` |
| `-f, --force` | Overwrite files if the folder already exists |

Use `slskit init .` to scaffold into the current directory.

#### One API Gateway, or one per service

`--shared-api yes` (the default) puts every function behind a single HTTP API, so
you deploy one API Gateway and get back one URL. `--shared-api no` gives each
service its own API and its own URL.

That choice decides the project's shape, because SAM only resolves an `ApiId`
inside the template that declares the API — a function cannot attach to an API in
its parent stack:

| | `--shared-api yes` | `--shared-api no` |
| --- | --- | --- |
| Templates | one `template.yaml` | a root stack nesting one per service |
| API Gateways | 1 | one per service |
| Output | `ApiUrl` | `AuthApiUrl`, `ProductApiUrl`, … |
| Deploy one service alone | no — it is one stack | yes |

Both behave identically under `slskit run`: every route is served from one local
port either way.

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
slskit run --no-watch      # do not rebuild on file changes
```

Name the environment as the first argument (`--env staging` also works). It runs
with that environment's variables, so `APP_ENVIRONMENT` and everything set with
`slskit env set` are present locally exactly as they will be in AWS.

#### Editing while it runs

`slskit run` watches the project. Save a handler or a service and only that one
function is rebuilt — the local API keeps running and serves the new code on the
next request, so there is nothing to stop and start:

```text
> product/getProducts changed — rebuilding
Rebuilt. The next request uses the new code.
```

| What you changed | What happens |
| --- | --- |
| `src/functions/<app>/<fn>/…` or `src/services/<app>/<fn>.…` | that function alone is rebuilt |
| `src/shared/…` | full rebuild — shared code is a layer on every function |
| a `template.yaml`, `slskit.json`, or a `.env.…` file | full rebuild, then the local API restarts |

Routes, memory and variable values are only read when `sam` starts, which is why
those changes restart it; ordinary code edits never do. A build that fails leaves
the previous one serving and waits for your next save rather than exiting.

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

Function names are unique across the whole project, not just within one
application: the Lambda is physically named `<project>-<environment>-<function>`,
and with one shared API Gateway the template's logical id is `<Name>Function`. A
reused name is refused, and the prompt asks again rather than giving up:

```text
? Function name: list
> Function "list" already exists in application "category". Choose another name.
? Function name:
```

Each function can use a different language than the rest of the project — a
Python function can live next to TypeScript ones in the same application. A
function whose language differs from the project's own runtime family (Node vs.
Python) can't attach the project's shared Lambda layer or database client, so it
is generated standalone instead (plain success response, no shared imports). The
command also updates that application's infra template, the root `template.yaml`
when a SAM app is brand new, `slskit.json`, and — if the new function needs
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
*name* is stored in `slskit.json`, and it is resolved at deploy time; when
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
| `-s, --service` | Deploy every function in one service |
| `--function` | Deploy one function on its own |
| `--all` | Deploy the whole project without being asked what to deploy |
| `-y, --yes` | Skip the confirmation prompt — required in a non-interactive shell |
| `--no-build` | Skip `sam build` |
| `--skip-verify` | Deploy without checking the credentials first |
| `--guided` | Run `sam deploy --guided` instead of the managed defaults |

#### Deploying one service, or one function

Interactively, `slskit deploy` asks what to send before it sends anything:

```text
? What do you want to deploy?
❯ Everything — the whole project
  One service — all of its functions
  One function
? Service: auth
? Function: register
```

Or name it directly, which is what CI wants:

```bash
slskit deploy dev --service auth -y      # every function in auth
slskit deploy dev --function login -y    # just that one
slskit deploy dev --all -y               # the whole project
```

Function names are unique across a project, so `--function` finds its service on
its own. An unknown name fails immediately, before anything reaches AWS.

A scoped deploy is a **code-only** update: it runs `sam sync --code` against the
functions already in the stack, which is much faster than a full deploy but cannot
change infrastructure. Anything that lives in the template — a route, memory, a new
variable, a new function — needs the whole project:

| Changed | Use |
| --- | --- |
| business logic in a handler or service | `--function` or `--service` |
| a route, memory size, or a variable | `--all` |
| added a function with `slskit function` | `--all` |

Because a code sync updates functions rather than creating them, it needs a stack
that already exists and says so if there isn't one:

```text
Stack "shop-dev" does not exist yet, so there is nothing to update.
Deploy the whole project first: slskit deploy dev --all
```

Without a TTY, and with `-y`, the default stays the whole project — so existing CI
commands keep doing exactly what they did.

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

Deploys are granted `CAPABILITY_IAM` and `CAPABILITY_AUTO_EXPAND` (the latter for
per-service nested stacks), and `--resolve-s3` provisions the artifact bucket, so a
first deploy needs no manual setup.

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

Add a variable either way — both reach every function:

```bash
slskit env set LOG_LEVEL=debug                        # plain value, in slskit.json
slskit env set API_KEY=sk-live-abc --secret           # value in .env.<environment>
slskit env set DB_PASSWORD --ssm /shop/prod/db        # resolved by AWS at deploy
slskit env vars --env production                      # secrets masked
slskit env unset API_KEY
```

```bash
echo 'SOME_API_KEY=abc123' >> .env.production         # or just edit the file
```

A key typed straight into `.env.<environment>` is a real variable: `run` and `deploy`
notice it, add the parameter to every template, and inject it into every function.
Nothing else to run.

| Flag | Applies to | Meaning |
| --- | --- | --- |
| `-e, --env` | `set`, `unset`, `vars` | Environment to act on — defaults to the default environment |
| `--secret` | `set` | Store the value in `.env.<environment>`, never in `slskit.json` |
| `--ssm <path>` | `set` | Store only the SSM path; AWS resolves the value at deploy |
| `--show-secrets` | `vars` | Reveal secret values instead of masking them |

#### How variables reach your functions

Templates are shared by every environment, so each variable becomes a
CloudFormation parameter (`LOG_LEVEL` → `EnvLogLevel`) wired into every function's
`Environment.Variables`, and the run or deploy supplies the value as a
`--parameter-overrides` entry. Every stage parameter is `NoEcho` and defaults to
empty, so a stage that doesn't set a variable still deploys from the same template.

| Kind | Stored in | Reaches AWS as |
| --- | --- | --- |
| plain | `slskit.json` | the literal value |
| `--secret` | `.env.<environment>` (gitignored) | the value read from that file at deploy |
| `--ssm` | `slskit.json` (path only) | `{{resolve:ssm:<path>}}`, resolved by CloudFormation |
| edited by hand | `.env.<environment>` (gitignored) | the value read from that file at deploy |

`slskit run` and `slskit deploy` reconcile the templates with the current set of
variable names before handing anything to SAM, so a key added by editing a `.env`
file needs no extra command. Database connection strings are ordinary variables —
`init` seeds `DATABASE_URL` into `.env.dev` and nothing about it is special-cased.

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
├── template.yaml         # the SAM template
├── .env.dev              # the dev environment's variables (gitignored)
└── slskit.json           # machine-readable project graph
```

With one shared API Gateway there is a single `template.yaml`. With `--shared-api
no`, each application also owns a `template.yaml` next to its handlers and the root
stack nests them, so applications can be deployed one at a time.

## Development

```bash
npm test          # jest
npm run test:watch
npm run build     # tsc
npm run dev       # tsx src/cli.ts
```
