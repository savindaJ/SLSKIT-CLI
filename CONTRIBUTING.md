# Contributing to slskit

Thanks for taking the time. Bug reports, documentation fixes and pull requests are
all welcome.

## Getting set up

```bash
git clone https://github.com/savindaJ/SLSKIT-CLI.git
cd SLSKIT-CLI
npm install
npm test
```

To use your working copy as the real `slskit` command:

```bash
npm run build
npm link
slskit --help
```

`npm unlink -g slskit` puts things back.

| Script | What it does |
| --- | --- |
| `npm test` | the Jest suite |
| `npm run test:unit` | unit tests only |
| `npm run test:cli` | commander-level CLI tests only |
| `npm run test:watch` | the suite in watch mode |
| `npm run typecheck` | `tsc --noEmit` — type check only |
| `npm run docs` | regenerate `docs/flags.md` from Commander |
| `npm run docs:check` | fail if generated docs are stale |
| `npm run licenses` | check the MIT project license and production deps |
| `npm run build` | compile `src/` to `dist/` |
| `npm run dev` | run the CLI from source via tsx |

Node 18 or newer. CI runs the suite on 18, 20 and 22.

## Working on the code

**Try it on a real generated project.** Most of this tool's behaviour only shows up
when SAM actually runs. Scaffold into a scratch directory and use it:

```bash
mkdir /tmp/probe && cd /tmp/probe
slskit init probe --runtime typescript --database none \
  --api-gateway yes --layer yes --memory 128
slskit run
```

A change that passes the suite but was never run against `sam build` or
`sam local start-api` has not really been tested — several bugs in this project's
history type-checked and passed tests while being broken in practice.

**Tests are required for behaviour changes.** `test/unit/` covers pure functions;
`test/cli/` drives the commander program end to end against temporary directories.
Add the failing test first where you can.

**Match the surrounding style.** Comments explain *why*, not what — particularly
where the code works around something in the AWS SAM CLI. Those comments are load
bearing: they stop the workaround being "simplified" away later.

**Keep the dependency list short.** Two runtime dependencies is deliberate. A pull
request adding a third needs a good reason.

## Pull requests

1. Branch off `develop`.
2. Make sure `npm run typecheck`, `npm test`, `npm run docs`, `npm run licenses`
   and `npm run build` all pass.
3. If you added or changed a flag, run `npm run docs` so `docs/flags.md` stays in
   sync. Do not hand-edit that file.
4. Use a conventional PR title (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`,
   `test:`, `ci:`, `security:`).
5. Describe what changed and how you verified it — including anything you ran against
   real SAM.

Small, focused pull requests get reviewed faster than large ones.

By contributing you agree that your work is licensed under the same
[MIT license](LICENSE) as the rest of the project.

## Reporting bugs

Open an issue with the bug report template. The two most useful things are the exact
command you ran and the complete output. If it involves a generated project, the
relevant part of `template.yaml` or `slskit.json` usually settles it.

**Never paste AWS credentials, connection strings or the contents of a `.env` file
into an issue.** Redact them first.

## Security

Do not open a public issue for a security problem. See [SECURITY.md](SECURITY.md).
