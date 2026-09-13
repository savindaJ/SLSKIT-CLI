# Releasing

Versions are decided by [Changesets](https://github.com/changesets/changesets), not by
hand. Nobody edits `version` in `package.json` and nobody writes a changelog entry
directly — both are produced from the changeset files that land with each change.

## The everyday flow

**1. Describe the change when you make it.**

```bash
npx changeset
```

It asks for the bump and a sentence, then writes a small markdown file under
`.changeset/`. Commit that file with your work.

| Pick | When | `0.2.0` becomes |
| --- | --- | --- |
| `patch` | a bug fix, no behaviour added or removed | `0.2.1` |
| `minor` | a new command, flag or capability | `0.3.0` |
| `major` | an existing command changes in a way that breaks projects | `1.0.0` |

Until the package is `1.0.0`, a `major` bump moves the minor digit instead —
`0.2.0` → `0.3.0` — because semver treats everything below 1 as unstable. Reach
`1.0.0` deliberately, with an empty-but-major changeset:

```bash
npx changeset --empty      # then edit it to say "major"
```

A pull request with no changeset is fine — docs, tests and chores release nothing.
CI says so rather than failing.

**2. Merge to `develop`.** When pending changesets land on `develop`, the Release
workflow runs once and:

1. Applies every pending bump and rewrites `CHANGELOG.md`
2. Runs typecheck, licence check, and tests
3. Creates `vX.Y.Z`, publishes to npm, and pushes the version commit and tag to
   `develop`

No release branch is created — only a tag.

If a version bump reached `develop` but publish failed, the next push to `develop`
retries while that version still has no tag.

`prepublishOnly` runs before publish, so a failing typecheck, licence check or test
aborts the release.

To check what is queued at any time:

```bash
npm run changeset:status
```

## The first release

The automation above takes over from the *second* release onward. The first one is
done by hand, because there is nothing on npm yet for Changesets to compare against.

```bash
npm login
npm publish            # prepublishOnly runs clean, typecheck, licences, tests, build

git tag v0.2.0
git push origin v0.2.0
```

Then create the GitHub release from that tag, using the `0.2.0` section of
`CHANGELOG.md` as the body. Every release after this one is handled by the workflow.

## What the repository needs

| Secret | Used for |
| --- | --- |
| `NPM_TOKEN` | Publishing. Create an **Automation** token at npmjs.com → Access Tokens, then add it under Settings → Secrets and variables → Actions. A Publish token will not work: it prompts for 2FA, which a workflow cannot answer. |

The workflow needs **Settings → Actions → General → Workflow permissions → Read and
write** so it can push the version commit and tag to `develop`.

## Notes
- The scripts are named `changeset:version` and `changeset:publish` rather than
  `version` and `publish` on purpose: npm treats those two names as lifecycle hooks
  for `npm version` and `npm publish`, and would fire Changesets at the wrong moment.
- Publishing with `--provenance` requires a **public** source repository. It is off
  while this repository is private; turn it on afterwards by adding
  `provenance=true` to `.npmrc`.
