---
"slskit-cli": minor
---

`slskit doctor` checks everything a project depends on in one pass: the Node version
against the published engine range, the AWS SAM CLI, the AWS CLI, Docker and its
daemon, `slskit.json`, the chosen environment's region, its variables (a `--secret`
with no value is found here rather than mid-deploy) and its AWS credentials. Every
failing check prints the command that fixes it.

It runs from anywhere — outside a project the project checks are skipped rather than
failed. Docker is a warning, not a failure, because only `slskit run` needs it. The
exit code is non-zero only when something failed, so `slskit doctor && slskit deploy`
works as a CI gate, and the global `--json` flag prints the report as a stable list
of eight checks.
