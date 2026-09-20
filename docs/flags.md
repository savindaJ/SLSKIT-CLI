# slskit — generated flag reference

This file is generated from the Commander program. Do not edit it by hand.

```bash
npm run docs
```

CI fails if this file is stale. Narrative docs live in [COMMAND.md](../COMMAND.md).

## Global flags

Available on every command.

- `-V, --version` — output the version number
- `--cwd <path>` — Run as if started from this directory
- `--debug` — Print stack traces when a command fails
- `--silent` — Silence informational output
- `--json` — JSON output where a command supports it

## `init [name]`

Scaffold a multi-service AWS SAM project

Flags:

- `-r, --runtime <runtime>` — typescript | javascript | python
- `--database <database>` — none | prisma | mongoose | dynamodb
- `--api-gateway <yes|no>` — Expose the functions over HTTP
- `--shared-api <yes|no>` — One API Gateway for every function (default: no — one per service)
- `--layer <yes|no>` — Use shared/ as a common Lambda layer
- `--memory <mb>` — Function memory size: 128 | 256 | 512 | 1024 | 2048 | 3008 | 4096 | 10240
- `-f, --force` — Overwrite files if the folder already exists

## `run [environment]`

Run the generated SAM project locally (every application served from one API Gateway port)

Flags:

- `-p, --port <port>` — Local API Gateway port (default: `3000`)
- `-s, --service <name>` — Run every function in one service
- `--function <name>` — Run one function on its own
- `--all` — Run everything without being asked what to run
- `--no-build` — Skip "sam build" before starting the local API
- `--no-watch` — Do not rebuild on file changes (stop and re-run to pick up edits)
- `-e, --env <name>` — Environment whose variables to run with (default: the default environment)

## `function [name]`

Add a function to an existing or new application in this project

Flags:

- `--app <name>` — Existing application to attach the function to
- `--new-app <name>` — Create a new application with this name
- `--method <method>` — GET | POST | PUT | DELETE | PATCH
- `--memory <mb>` — Function memory size: 128 | 256 | 512 | 1024 | 2048 | 3008 | 4096 | 10240
- `-r, --runtime <runtime>` — typescript | javascript | python

## `rm [name]`

Remove a function or an application, and everything that referenced it

Flags:

- `--function <name>` — Remove this function
- `--service <name>` — Remove this application and every function in it
- `--app <name>` — Same as --service
- `-y, --yes` — Skip the confirmation prompt

## `configure`

Set up AWS credentials and the deploy target for an environment

Flags:

- `-e, --env <name>` — Environment to configure (default: "dev")
- `--profile <name>` — AWS named profile to resolve credentials from
- `--region <region>` — AWS region to deploy into (example: us-east-1)
- `--stack-name <name>` — CloudFormation stack name for this environment
- `--skip-verify` — Save without checking that the credentials work
- `--set-credentials` — Enter an AWS access key and store it in ~/.aws/credentials

## `env`

Manage deployment environments (dev, staging, production, ...) and their variables

## `env list`

Show every environment and its deploy target

## `env add <name>`

Add an environment and configure its AWS deploy target

Flags:

- `--profile <name>` — AWS named profile to resolve credentials from
- `--region <region>` — AWS region to deploy into (example: us-east-1)
- `--stack-name <name>` — CloudFormation stack name for this environment
- `--skip-verify` — Save without checking that the credentials work

## `env use <name>`

Set the environment that commands default to

## `env remove <name>`

Remove an environment from this project

Flags:

- `-y, --yes` — Skip the confirmation prompt

## `env set <assignment>`

Add or update a variable (KEY=value)

Flags:

- `-e, --env <name>` — Environment to change (default: the default environment)
- `--secret` — Store the value in .env.<environment> instead of slskit.json
- `--ssm <path>` — Read the value from an SSM Parameter Store path at deploy time

## `env unset <key>`

Remove a variable from an environment

Flags:

- `-e, --env <name>` — Environment to change (default: the default environment)

## `env vars`

Show every variable configured for an environment

Flags:

- `-e, --env <name>` — Environment to show (default: the default environment)
- `--show-secrets` — Reveal secret values instead of masking them

## `deploy [environment]`

Deploy to AWS — the whole project, one service, or a single function

Flags:

- `-e, --env <name>` — Environment to deploy
- `-s, --service <name>` — Deploy every function in one service
- `--function <name>` — Deploy one function on its own
- `--all` — Deploy the whole project without asking what to deploy
- `--profile <name>` — AWS named profile (overrides slskit.json for this run)
- `--no-build` — Skip "sam build" before deploying
- `-y, --yes` — Skip the confirmation prompt
- `--skip-verify` — Deploy without checking the credentials first
- `--guided` — Run "sam deploy --guided" instead of the managed defaults

## `doctor`

Check that everything slskit needs is installed and configured

Flags:

- `-e, --env <name>` — Environment whose region, variables and credentials to check
