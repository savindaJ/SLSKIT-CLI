# slskit — command reference

Every command, every flag, and what each one actually does.

`slskit` scaffolds and grows multi-service AWS Lambda projects built on AWS SAM.
It has two runtime dependencies (`commander` and `@inquirer/prompts`) and shells out
to the AWS SAM CLI and the AWS CLI for everything that touches AWS.

| Command | What it does |
| --- | --- |
| [`slskit init`](#slskit-init-name) | Scaffold a new project |
| [`slskit run`](#slskit-run-environment) | Run it locally on one API Gateway port |
| [`slskit function`](#slskit-function-name) | Add a function to a new or existing service |
| [`slskit rm`](#slskit-rm-name) | Remove a function or a service |
| [`slskit configure`](#slskit-configure) | Set AWS credentials and the deploy target |
| [`slskit env`](#slskit-env) | Manage environments and their variables |
| [`slskit deploy`](#slskit-deploy-environment) | Deploy to AWS |
| [`slskit doctor`](#slskit-doctor) | Check the toolchain, the project and the credentials |

Conventions used below: `<required>`, `[optional]`. Every command that reads a
project must be run from the project root — the directory holding `slskit.json` —
or passed `--cwd` to that directory.

Every command also accepts `--debug` (stack traces), `--silent` (no info logs)
and `--json` (suppress human output). The generated flag list is in
[docs/flags.md](docs/flags.md); this file is the narrative reference.

---

## Concepts

Four ideas explain most of the behaviour.

**The manifest.** `slskit.json` is the project graph: services, functions, runtimes,
routes, environments. Every command reads it, and the templates are regenerated from
it, so it is the source of truth rather than the YAML. A project generated before the
CLI was renamed still has `sless.json`; that is read as a fallback and migrated to the
new name the next time anything writes to it.

**Environments.** An environment is one deploy target: its own region, AWS profile,
CloudFormation stack and variables. Every project starts with `dev`. Environments
never share resources — `dev` and `production` are separate stacks with separately
named functions.

**`APP_ENVIRONMENT`.** One variable is generated for every environment and always
equals its name. Every stage-scoped resource name is built from it:

| Thing | Name |
| --- | --- |
| CloudFormation stack | `<project>-<APP_ENVIRONMENT>` |
| Lambda function | `<project>-<APP_ENVIRONMENT>-<function>` |

Because a Lambda name is capped at 64 characters, an environment name that would push
any function past the limit is refused up front rather than failing mid-deploy.

**Project layout.** A root stack nests one template per service:

```text
my-lambda-app/
├── src/
│   ├── functions/        # handlers, one folder per service
│   ├── services/         # business logic the handlers import
│   └── shared/           # shared utilities (a Lambda layer when --layer yes)
├── templates/            # one stack per service: auth.yaml, product.yaml
├── template.yaml         # root stack, nests them
├── .env.dev              # the dev environment's variables (gitignored)
└── slskit.json           # the project graph
```

---

## `slskit init [name]`

Scaffolds a new AWS SAM project with two example services (`auth`, `product`), their
handlers, business logic, shared code and templates, then runs `npm install`.

```bash
slskit init my-lambda-app
slskit init .                       # scaffold into the current directory

slskit init my-lambda-app \
  --runtime typescript \
  --database none \
  --api-gateway yes \
  --shared-api no \
  --layer yes \
  --memory 128
```

| Argument | Meaning |
| --- | --- |
| `name` | Project name, and the folder it is created in. `.` uses the current directory. |

| Flag | Values |
| --- | --- |
| `-r, --runtime` | `typescript` \| `javascript` \| `python` |
| `--database` | `none` \| `prisma` \| `mongoose` \| `dynamodb` |
| `--api-gateway` | `yes` \| `no` — expose the functions over HTTP |
| `--shared-api` | `yes` \| `no` — one API Gateway for everything. Default `no`. |
| `--layer` | `yes` \| `no` — publish `shared/` as a common Lambda layer |
| `--memory` | `128` \| `256` \| `512` \| `1024` \| `2048` \| `3008` \| `4096` \| `10240` |
| `-f, --force` | Overwrite files if the folder already exists |

Prompts for anything not passed. In a non-interactive shell every flag except
`--shared-api` and `--force` must be supplied.

> `--force` overwrites existing files in place. Never run it in a directory holding a
> project you care about.

### One API Gateway, or one per service

Either way you get a root stack nesting `templates/<service>.yaml`, so the root file
stays short as the project grows. The flag only decides where the API lives.

| | `--shared-api no` (default) | `--shared-api yes` |
| --- | --- | --- |
| API Gateways | one per service | 1 |
| Routes declared as | SAM `HttpApi` events | API Gateway v2 resources |
| Stack output | `AuthApiUrl`, `ProductApiUrl`, … | `ApiUrl` |

Multiple API Gateways do not cost more — HTTP APIs bill per request, not per gateway.
The usual way to put one public URL in front of several is a custom domain with path
mappings.

A shared API has to be declared with plain `AWS::ApiGatewayV2::Route` resources,
because SAM only resolves an `ApiId` inside the template that declares the API:

```text
ApiId must be a valid reference to an 'AWS::Serverless::HttpApi' resource in same template
```

That deploys correctly but `sam local start-api` cannot serve it — it returns 502 on
every route. So `slskit run` serves a flattened copy instead; see below.

---

## `slskit run [environment]`

Runs the project locally, serving every route from a single API Gateway port. Checks
that the AWS SAM CLI is installed first, and offers to install it (Homebrew on macOS,
snap on Linux) when it is missing.

```bash
slskit run                         # default environment, port 3000
slskit run staging                 # run with the staging environment
slskit run dev --port 4000
slskit run --service auth          # only auth's routes
slskit run --function getProducts  # only that one
slskit run --all                   # everything, without being asked
slskit run --no-build
slskit run --no-watch
```

| Argument | Meaning |
| --- | --- |
| `environment` | Environment to run with. Defaults to the default environment. |

| Flag | Meaning |
| --- | --- |
| `-e, --env <name>` | Same as the positional argument |
| `-p, --port <port>` | Local API Gateway port (default `3000`) |
| `-s, --service <name>` | Run every function in one service |
| `--function <name>` | Run one function on its own |
| `--all` | Run everything without being asked what to run |
| `--no-build` | Skip `sam build` before starting |
| `--no-watch` | Don't rebuild on save |

### Choosing what to run

With a TTY and no scope flag, it asks:

```text
? What do you want to run?
❯ Everything — every service
  One service — all of its functions
  One function
? Service: auth (2 functions)
```

A scoped run is meaningfully faster: it serves a template containing only those
functions, so `sam build` compiles only those. Routes outside the scope are not
mounted. Function names are unique project-wide, so `--function` finds its own
service. An unknown name fails before SAM starts.

Without a TTY the scope defaults to everything, so scripted runs are unchanged.

### Watch mode

On by default. Saving a file rebuilds the smallest thing that can change:

| Changed | What happens |
| --- | --- |
| a handler or service file | only that function is rebuilt; the next request uses it |
| `src/shared/**` | full rebuild |
| a template, `slskit.json`, or a `.env` file | full rebuild, then the local API restarts |

A rebuild that fails leaves the previous build serving and waits for the next save,
so a syntax error never takes the session down.

### The generated local template

A project whose services share one API Gateway is served from `.slskit-local.yaml`, a
flattened copy generated from `slskit.json` on every run and built into
`.aws-sam/local/`. It is gitignored and never deployed. Because both it and the real
templates come from the same manifest, they cannot drift.

Environment variables reach the running functions exactly as they will in AWS, and
override values are never printed — only how many there are. A `--secret` variable
missing from `.env.<environment>` fails before SAM starts rather than booting with an
empty value.

---

## `slskit function [name]`

Adds a function to an existing service, or creates a new one. Run from the project
root. Updates the service template, the root template when the service is new,
`slskit.json`, and installs any tooling the new function needs.

```bash
slskit function resetPassword --app auth --method POST --memory 512 --runtime typescript
slskit function list --new-app category --method GET --memory 128 --runtime typescript
```

| Argument | Meaning |
| --- | --- |
| `name` | Function name. Letters and digits, starting with a letter. |

| Flag | Values |
| --- | --- |
| `--app <name>` | Attach to an existing service (mutually exclusive with `--new-app`) |
| `--new-app <name>` | Create a new service with this name |
| `--method` | `GET` \| `POST` \| `PUT` \| `DELETE` \| `PATCH` |
| `--memory` | `128` \| `256` \| `512` \| `1024` \| `2048` \| `3008` \| `4096` \| `10240` |
| `-r, --runtime` | `typescript` \| `javascript` \| `python` |

The route is `/<service>/<function>`.

### Names are unique across the project

Not just within one service. The Lambda is physically named
`<project>-<environment>-<function>`, and with a shared API the template's logical id
is `<Name>Function` — both project-scoped. A reused name is refused, and the prompt
asks again rather than giving up:

```text
? Function name: list
> Function "list" already exists in application "category". Choose another name.
? Function name:
```

With `--name` in a non-interactive shell it fails with the same message.

### Mixed runtimes

Each function can use a different language from the rest of the project. A function
whose runtime family differs (Node vs. Python) cannot attach the project's layer or
import its database client, so it is generated standalone — a plain success response,
no shared imports. If the project lacks the tooling that function needs (the first
TypeScript function in a JavaScript project, say), `package.json` / `tsconfig.json`
are updated and `npm install` runs.

---

## `slskit rm [name]`

Removes a function, or a whole service and every function in it. The inverse of
`slskit function`: it deletes the code, prunes `slskit.json`, and regenerates every
template that referenced what went. Aliased as `slskit remove`.

```bash
slskit rm                            # asks what to remove, then which one
slskit rm login                      # resolved by name
slskit rm --function login
slskit rm --service auth             # the service and all of its functions
slskit rm --app auth                 # same thing
slskit rm login --yes                # skip the confirmation
```

| Argument | Meaning |
| --- | --- |
| `name` | A function or service name. Looked up in the project; `--function`/`--service` settle it if one name is both. |

| Flag | Meaning |
| --- | --- |
| `--function <name>` | Remove this function |
| `--service <name>` | Remove this service and every function in it |
| `--app <name>` | Same as `--service` |
| `-y, --yes` | Skip the confirmation prompt — required in a non-interactive shell |

### What it deletes

| Removing | Gone |
| --- | --- |
| a function | `src/functions/<service>/<function>/`, `src/services/<service>/<function>.<ext>` |
| a service | `src/functions/<service>/`, `src/services/<service>/`, `templates/<service>.yaml` |

And in every case: the function's entry in `slskit.json`, its route, its layer
attachment, its directory listing — plus the service's nesting in `template.yaml` and
its entry in `framework.files.applications`, `apiGateway.templates` and
`layer.templates` when a whole service goes.

The manifest is rebuilt from the pruned service list rather than edited in place, so
nothing derived from it can be left behind. Environments, their variables and the
project version are carried through untouched.

### It asks before it deletes

With no flags and a TTY it asks what kind of thing to remove, then which one:

```text
? What do you want to remove?
❯ A function
  An application — and every function in it
? Function: auth/login  POST /auth/login
```

Then it prints exactly what will go and waits for a yes. `--yes` skips that, and is
required without a TTY — where the command prints the same plan and stops rather than
deleting anything.

### Removing the last function removes its service

A service template with no functions is not valid CloudFormation, so a function that
is the last one in its service takes the service with it. The command says so before
asking.

For the same reason it refuses to empty the project:

```text
"login" is the only function in this project, and a stack with no resources cannot be
deployed. Add another function first, or start over with "slskit init".
```

### It does not touch AWS

`slskit rm` only changes your project. Resources already deployed stay until the next
full deploy removes them from the stack:

```bash
slskit deploy production --all
```

A scoped deploy cannot do it — removing a resource is an infrastructure change.

---

## `slskit configure`

Records the AWS credentials and deploy target for an environment. Run before
deploying.

```bash
slskit configure                                     # interactive, environment "dev"
slskit configure --profile work --region us-east-1
slskit configure --env production --profile prod-admin --region eu-west-2
slskit configure --set-credentials                   # enter an access key
```

| Flag | Meaning |
| --- | --- |
| `-e, --env <name>` | Environment to configure (default `dev`) |
| `--profile <name>` | AWS named profile to resolve credentials from |
| `--region <region>` | AWS region to deploy into |
| `--stack-name <name>` | CloudFormation stack name (default `<project>-<environment>`) |
| `--skip-verify` | Save without checking that the credentials work |
| `--set-credentials` | Enter an AWS access key and store it in `~/.aws/credentials` |

Each value falls back, in order, to: the flag, whatever the environment already had,
the shell (`AWS_PROFILE`, `AWS_REGION`), then your AWS config file. Credentials are
verified with `aws sts get-caller-identity` and nothing is written if they don't work
— use `--skip-verify` to save regardless. When the AWS CLI isn't installed the check
is skipped with a notice.

### Storing an access key

If credentials don't verify, `configure` offers to take a key there and then:

```text
Could not verify AWS credentials for profile "work" in us-east-1.
? Enter an AWS access key now and store it in ~/.aws/credentials? Yes
? AWS Access Key ID: AKIA...
? AWS Secret Access Key: [hidden]
```

The secret is never echoed. It is handed to `aws configure set`, which writes it to
`~/.aws/credentials` — **outside your project**, so it cannot be committed.

**No credential material is ever written into the project.** Only the profile *name*
goes into `slskit.json`, resolved at deploy time; when credentials come from
environment variables, no profile is recorded at all.

---

## `slskit env`

Manages environments and their variables.

```bash
slskit env list
slskit env add production --profile prod-admin --region eu-west-2
slskit env use production
slskit env remove staging --yes
slskit env set LOG_LEVEL=debug
slskit env unset API_KEY
slskit env vars --env production
```

### `slskit env list` (alias `ls`)

Shows every environment with its stack, region, profile and variable count. `*` marks
the default.

### `slskit env add <name>`

Creates an environment and configures its deploy target — the same credential flow as
`configure`.

| Flag | Meaning |
| --- | --- |
| `--profile <name>` | AWS named profile |
| `--region <region>` | AWS region |
| `--stack-name <name>` | CloudFormation stack name |
| `--skip-verify` | Save without checking the credentials |

Names are lowercase, starting with a letter: `[a-z][a-z0-9-]*`. A name that would push
any Lambda past the 64-character limit is refused.

### `slskit env use <name>`

Sets the environment every other command defaults to.

### `slskit env remove <name>` (alias `rm`)

Removes an environment from `slskit.json` and regenerates the templates. `-y, --yes`
skips the confirmation, and is required in a non-interactive shell. The
`.env.<environment>` file is left on disk — delete it yourself.

### `slskit env set <KEY=value>`

| Flag | Meaning |
| --- | --- |
| `-e, --env <name>` | Environment to change (default: the default one) |
| `--secret` | Store the value in `.env.<environment>`, never in `slskit.json` |
| `--ssm <path>` | Store only the SSM path; AWS resolves the value at deploy |

```bash
slskit env set LOG_LEVEL=debug                  # plain value, in slskit.json
slskit env set API_KEY=sk-live-abc --secret     # value in .env.<environment>
slskit env set DB_PASSWORD --ssm /shop/prod/db  # resolved by AWS at deploy
```

`APP_ENVIRONMENT` is managed by slskit and cannot be set.

### `slskit env unset <key>`

Removes a variable. `-e, --env` selects the environment.

### `slskit env vars`

Shows every variable for an environment, secrets masked. `--show-secrets` reveals
them; `-e, --env` selects the environment.

### How variables reach your functions

You can also just edit `.env.<environment>` — a key typed in by hand is a real
variable. `run` and `deploy` reconcile the templates with the current set of names
before handing anything to SAM, so no extra command is needed.

Each variable becomes a CloudFormation parameter (`LOG_LEVEL` → `EnvLogLevel`) wired
into every function's `Environment.Variables`, supplied at deploy as a
`--parameter-overrides` entry. Every stage parameter is `NoEcho` and defaults to
empty, so an environment that doesn't set one still deploys.

| Kind | Stored in | Reaches AWS as |
| --- | --- | --- |
| plain | `slskit.json` | the literal value |
| `--secret` | `.env.<environment>` (gitignored) | the value read from that file at deploy |
| `--ssm` | `slskit.json` (path only) | `{{resolve:ssm:<path>}}`, resolved by CloudFormation |
| edited by hand | `.env.<environment>` (gitignored) | the value read from that file at deploy |

A `--secret` variable missing from its `.env` file fails the command with the exact
`slskit env set` line that fixes it, rather than deploying an empty string.

Values are passed as `ParameterKey=…,ParameterValue="…"` rather than SAM's shorthand,
because the shorthand splits on whitespace and would silently truncate `hello world`
to `hello`.

> A Lambda environment variable is readable in plaintext by anyone with
> `lambda:GetFunctionConfiguration`. `NoEcho` hides it in CloudFormation, not from
> your account's users. For real secrets prefer `--ssm`.

---

## `slskit deploy [environment]`

Deploys to AWS — every function, API Gateway, layer and table, under that
environment's own CloudFormation stack.

```bash
slskit deploy                        # default environment
slskit deploy production
slskit deploy production -y          # skip the confirmation (CI)
slskit deploy dev --service auth     # every function in auth
slskit deploy dev --function login   # just that one
slskit deploy dev --all              # whole project, no question
```

| Argument | Meaning |
| --- | --- |
| `environment` | Environment to deploy. Defaults to the default environment. |

| Flag | Meaning |
| --- | --- |
| `-e, --env <name>` | Same as the positional argument |
| `-s, --service <name>` | Deploy every function in one service |
| `--function <name>` | Deploy one function on its own |
| `--all` | Deploy everything without being asked |
| `-y, --yes` | Skip the confirmation prompt — required in a non-interactive shell |
| `--no-build` | Skip `sam build` |
| `--skip-verify` | Deploy without checking the credentials first |
| `--guided` | Run `sam deploy --guided` instead of the managed defaults |

### Choosing what to deploy

With a TTY and no scope flag, it asks the same way `run` does. Naming an unknown
service or function fails immediately, before anything reaches AWS.

A scoped deploy is a **code-only** update: it runs `sam sync --code` against functions
already in the stack. Much faster, but it cannot change infrastructure.

| Changed | Use |
| --- | --- |
| business logic in a handler or service | `--function` or `--service` |
| a route, memory size, or a variable | `--all` |
| a function added with `slskit function` | `--all` |

Because a code sync updates functions rather than creating them, it needs a stack that
already exists:

```text
Stack "shop-dev" does not exist yet, so there is nothing to update.
Deploy the whole project first: slskit deploy dev --all
```

### What it does

It stops before calling AWS if the environment has no region, doesn't exist, the
credentials don't verify, or a `--secret` variable is missing — so a failed deploy
costs nothing. Then it prints the plan and asks:

```text
About to deploy the whole project of "shop" to AWS.
  APP_ENVIRONMENT: production
  stack:       shop-production
  region:      eu-west-2
  functions:   4
    shop-production-login
    ...
This creates real AWS resources in your account and they cost money.
? Deploy to "production"? (y/N)
```

Deploys are granted `CAPABILITY_IAM` and `CAPABILITY_AUTO_EXPAND` (the latter for the
nested service stacks), and `--resolve-s3` provisions the artifact bucket, so a first
deploy needs no manual setup. Afterwards it prints the stack outputs:

```text
Deployed the whole project of "shop" to "dev".
  stack:   shop-dev
  region:  us-east-1

Endpoints:
  ApiUrl: https://6hjgplpky0.execute-api.us-east-1.amazonaws.com
```

Each environment deploys to its own stack, so they never touch each other:

| | dev | production |
| --- | --- | --- |
| Stack | `shop-dev` | `shop-production` |
| Lambda | `shop-dev-login` | `shop-production-login` |

---

## `slskit doctor`

Checks everything a working slskit project depends on, in one pass, and says what to
do about anything that is wrong. Runs from anywhere — inside a project it checks the
project too, outside one it checks the toolchain and says the rest was skipped.

```bash
slskit doctor
slskit doctor --env production      # check that environment's region, variables and credentials
slskit doctor --json                # machine-readable report
```

| Flag | Meaning |
| --- | --- |
| `-e, --env <name>` | Environment whose region, variables and credentials to check. Defaults to the default environment. |

### What it checks

| Check | Passes when |
| --- | --- |
| Node.js | the running version meets the `engines.node` range slskit is published with |
| AWS SAM CLI | `sam --version` answers |
| AWS CLI | `aws --version` answers |
| Docker | it is installed **and** the daemon responds to `docker info` |
| Project | `slskit.json` parses, names the project, targets AWS SAM, and has at least one function |
| Environment | the environment exists in the manifest and has a region |
| Variables | every variable resolves — in particular, a `--secret` has a value in `.env.<environment>` |
| AWS credentials | `sts get-caller-identity` succeeds for that environment's profile and region |

```text
slskit doctor — /Users/you/shop

  ok    Node.js               v20.11.0
  ok    AWS SAM CLI           1.120.0
  ok    AWS CLI               2.15.30
  warn  Docker                installed, but the daemon is not responding
          fix: Start Docker Desktop (or "sudo systemctl start docker"), then re-run "slskit doctor".
  ok    Project               "shop" — 2 services, 4 functions (slskit.json)
  ok    Environment "dev"     stack shop-dev in us-east-1, profile "work"
  fail  Variables             Variable "API_KEY" is marked secret for environment "dev" but is missing from .env.dev.
          fix: Set it with: slskit env set API_KEY=<value> --secret --env dev
  fail  AWS credentials       profile "work" was rejected in us-east-1: The config profile (work) could not be found
          fix: slskit configure --env dev --set-credentials

2 failed, 1 warning, 4 ok.

Fix the checks marked "fail", then re-run "slskit doctor".
```

### Four outcomes, and only one of them fails

| | Meaning |
| --- | --- |
| `ok` | nothing to do |
| `warn` | something is limited but nothing is broken — the line says what it stops you doing |
| `fail` | a command will not work until this is fixed |
| `skip` | the answer was not knowable here, usually because an earlier check failed |

**Docker is a warning, not a failure.** Only `slskit run` needs it: `sam local` runs
functions in Lambda-like containers, but a deploy uploads a zip and never talks to
Docker. Failing on it would block a CI deploy that was never going to need it.

**A missing project is a skip, not a failure.** `slskit doctor` is meant to be the
first thing you run on a new machine, before there is anything to check it against.

### Exit code

`0` unless a check failed, which makes it usable as a gate:

```bash
slskit doctor --env production && slskit deploy production --yes
```

Warnings and skips do not affect it. `--silent` suppresses the report and leaves only
the exit code.

### `--json`

The global `--json` flag prints the report instead of the human output, and nothing
else reaches stdout. The check list is always the same eight entries in the same
order, whatever could be answered, so a CI step never has to special-case a partial
machine.

```json
{
  "ok": false,
  "checks": [
    { "id": "node", "title": "Node.js", "status": "ok", "detail": "v20.11.0" },
    {
      "id": "docker",
      "title": "Docker",
      "status": "warn",
      "detail": "installed, but the daemon is not responding",
      "fix": "Start Docker Desktop (or \"sudo systemctl start docker\"), then re-run \"slskit doctor\"."
    }
  ],
  "summary": { "ok": 6, "warn": 1, "fail": 1, "skip": 0 }
}
```

### It only reads

`slskit doctor` never writes a file, never changes the manifest and never creates an
AWS resource. The one thing that leaves your machine is `sts get-caller-identity`,
which is a read.

---

## Typical sessions

**Start a project and see it running**

```bash
slskit init my-lambda-app
cd my-lambda-app
slskit run
```

**Add a function and try it**

```bash
slskit function resetPassword --app auth --method POST --memory 128 --runtime typescript
slskit run --service auth
```

**Check the machine before anything else**

```bash
slskit doctor
```

**First deploy**

```bash
slskit configure --set-credentials
slskit doctor
slskit deploy dev
```

**Add a production environment**

```bash
slskit env add production --profile prod-admin --region eu-west-2
slskit env set LOG_LEVEL=warn --env production
slskit env set API_KEY=sk-live-xxx --secret --env production
slskit deploy production
```

**Ship a logic change to one function**

```bash
slskit deploy production --function login
```

---

## Files slskit writes

| Path | Committed? | What it is |
| --- | --- | --- |
| `slskit.json` | yes | the project graph |
| `template.yaml` | yes | root stack |
| `templates/<service>.yaml` | yes | one stack per service |
| `.env.<environment>` | **no** | that environment's variable values |
| `.slskit-local.yaml` | **no** | generated local-run template |
| `.aws-sam/` | **no** | SAM build output |
| `~/.aws/credentials` | n/a | outside the project; where access keys go |
