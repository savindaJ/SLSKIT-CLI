# slskit

[![CI](https://github.com/savindaJ/Sless-Cli/actions/workflows/ci.yml/badge.svg)](https://github.com/savindaJ/Sless-Cli/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/slskit.svg)](https://www.npmjs.com/package/slskit)
[![node](https://img.shields.io/node/v/slskit.svg)](https://www.npmjs.com/package/slskit)
[![license](https://img.shields.io/npm/l/slskit.svg)](LICENSE)

A CLI for scaffolding and growing multi-service AWS Lambda projects on AWS SAM.

Starting a serverless project usually means a day of wiring: a template, a build
setup, handlers, an API Gateway, environment variables that behave the same locally
and in AWS, and a deploy that doesn't fight you. `slskit` gives you all of it in one
command, then stays useful — adding functions, managing environments, running the
project locally, and deploying a single function when that's all that changed.

Two runtime dependencies. Everything that touches AWS goes through the official
`sam` and `aws` CLIs.

```bash
npm install -g slskit
slskit init my-lambda-app
cd my-lambda-app
slskit run
```

That's a running API on `http://127.0.0.1:3000` with two services, four functions, a
shared Lambda layer, and hot reload on save.

## What you get

```text
my-lambda-app/
├── src/
│   ├── functions/        # handlers, one folder per service
│   ├── services/         # business logic the handlers import
│   └── shared/           # shared utilities, published as a Lambda layer
├── templates/            # one CloudFormation stack per service
├── template.yaml         # root stack, nests them
├── .env.dev              # the dev environment's variables (gitignored)
└── slskit.json           # the project graph every command reads
```

A root stack nesting one template per service, so the root file stays short as the
project grows and services can be deployed one at a time. TypeScript, JavaScript or
Python — and individual functions can differ from the rest of the project.

## Highlights

**Environments that don't leak into each other.** Every environment is its own deploy
target: region, profile, CloudFormation stack, variables. `APP_ENVIRONMENT` is
generated for each one, and every resource name is built from it — `shop-dev-login`
and `shop-production-login` are different functions in different stacks.

```bash
slskit env add production --profile prod-admin --region eu-west-2
slskit env set API_KEY=sk-live-xxx --secret --env production
slskit deploy production
```

**Variables that reach your code the same way locally and in AWS.** Add one with
`slskit env set`, or just type it into `.env.<environment>` — either way it becomes a
CloudFormation parameter wired into every function, and `process.env.YOUR_KEY` works
in both places. Secrets stay out of `slskit.json`, and `--ssm` keeps them out of the
CLI entirely.

**Run or deploy just the part you're working on.**

```bash
slskit run --service auth          # only auth's routes, so only those build
slskit deploy dev --function login # code-only update of one function
```

Both commands ask if you don't tell them. A scoped run builds only the functions it
serves; a scoped deploy uses `sam sync --code`, which is far faster than a full one.

**Hot reload.** `slskit run` watches `src/` and rebuilds only the function you
touched — the next request uses the new code, no restart. A broken file leaves the
previous build serving and waits for the next save.

**A deploy that tells you what it will do.** It stops before calling AWS if the
region is missing, the credentials don't verify, or a declared secret has no value —
so a failed deploy costs nothing. Then it prints the plan, asks, and reports the API
Gateway URLs when it's done.

**Credentials never enter your project.** `slskit configure` stores only the AWS
profile *name* in `slskit.json`; access keys go to `~/.aws/credentials` via the AWS
CLI. Secrets are never echoed, and override values are never logged.

## Commands

| Command | What it does |
| --- | --- |
| `slskit init [name]` | Scaffold a new project |
| `slskit run [environment]` | Run it locally on one API Gateway port |
| `slskit function [name]` | Add a function to a new or existing service |
| `slskit configure` | Set AWS credentials and the deploy target |
| `slskit env` | Manage environments and their variables |
| `slskit deploy [environment]` | Deploy to AWS |

**[COMMAND.md](COMMAND.md) is the full reference** — every flag, every behaviour,
and the reasoning behind the parts that aren't obvious.

## Requirements

| | |
| --- | --- |
| Node.js | 18 or newer |
| [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html) | to run and deploy — `slskit run` offers to install it |
| [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) | to verify credentials and read stack outputs |
| Docker | for `sam local`, which runs functions in Lambda-like containers |

## First deploy

```bash
slskit configure --set-credentials   # asks for a key, writes ~/.aws/credentials
slskit deploy dev
```

API Gateway, the functions, the layer and any tables are created in one pass —
`--resolve-s3` provisions the artifact bucket, so there's no manual setup. It prints
the URLs at the end:

```text
Deployed the whole project of "shop" to "dev".
  stack:   shop-dev
  region:  us-east-1

Endpoints:
  ApiUrl: https://6hjgplpky0.execute-api.us-east-1.amazonaws.com
```

## Development

```bash
git clone https://github.com/savindaJ/Sless-Cli.git
cd Sless-Cli
npm install
npm test
```

```bash
npm run build && npm link   # use your working copy as the real slskit command
npm run dev                 # run from source via tsx
npm run lint                # tsc --noEmit
```

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Bug reports and
documentation fixes are just as welcome as code.

## Security

Report vulnerabilities privately — see [SECURITY.md](SECURITY.md), which also
documents exactly how slskit handles your credentials.

## License

[MIT](LICENSE) © Savinda Jayasekara
