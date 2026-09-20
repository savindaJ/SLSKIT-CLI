---
"slskit-cli": minor
---

`slskit status [environment]` answers "what is deployed?" after the fact. Deploy
prints the API Gateway URLs once; status reads them back whenever you ask, along with
the CloudFormation stack status, every function with its runtime, memory and when its
code last changed, and hints about anything that has drifted between the project and
AWS.

Function timestamps come from Lambda rather than CloudFormation, so a
`slskit deploy --function` code sync — which never touches the stack — still shows as
a change. The hints cover both directions of drift: a function in `slskit.json` that
is not in the stack, a Lambda still in AWS that `slskit rm` dropped from the project,
variables that have not reached the deployed functions, and a `--secret` with no
value. Variable *names* are reported; values never are.

Exits non-zero when the stack does not exist or is in a failed or rolled-back state,
and supports the global `--json` flag.
