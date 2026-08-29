# Security policy

## Reporting a vulnerability

Please report security issues privately rather than opening a public issue.

Use GitHub's [private vulnerability reporting][advisory] on this repository, or email
**beecodelabs.savinda@gmail.com**.

[advisory]: https://github.com/savindaJ/Sless-Cli/security/advisories/new

Please include what the problem is, how to reproduce it, and what an attacker could
do with it. You can expect an acknowledgement within a few days, and I'll keep you
posted while it's being fixed. Please give me a reasonable window to release a fix
before disclosing publicly.

## Supported versions

This project is pre-1.0. Fixes go onto the latest release only.

## How slskit handles your credentials

Worth knowing when assessing a report:

- **No credential material is ever written into your project.** `slskit configure`
  stores only the AWS *profile name* in `slskit.json`. Access keys are handed to
  `aws configure set`, which writes them to `~/.aws/credentials`, outside the repo.
- **Secrets entered at a prompt are never echoed** and never logged.
- **Parameter override values are never printed** — only how many there are — because
  they carry secrets.
- **`.env.<environment>` files are gitignored** by every generated project, and are
  never included in a build artifact.
- **Nothing is sent anywhere.** The CLI talks only to the `sam` and `aws` binaries on
  your machine.

One thing that is *not* a slskit vulnerability but is worth understanding: a variable
that reaches a Lambda becomes an environment variable on that function. CloudFormation
parameters are declared `NoEcho`, so they are masked in the console and in
`describe-stacks`, but a Lambda environment variable is readable in plaintext by
anyone holding `lambda:GetFunctionConfiguration` on it. For values where that matters,
use `slskit env set KEY --ssm /path`, which keeps the secret in SSM Parameter Store
and never passes it through the CLI.
