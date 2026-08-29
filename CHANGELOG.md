# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `slskit run` and `slskit deploy` ask what to act on — everything, one service, or a
  single function — and accept `--service`, `--function` and `--all` to skip the
  question. A scoped run serves a template containing only those functions, so SAM
  builds only those.
- Watch mode: `slskit run` rebuilds on save, rebuilding only the function that
  changed. `--no-watch` turns it off.
- `slskit deploy` reports each stack's API Gateway URL when it finishes.
- Variables can be added by editing `.env.<environment>` directly; `run` and `deploy`
  reconcile the templates with the current set of names before calling SAM.
- `COMMAND.md`: a full command reference.

### Changed

- Every project is now a root stack nesting one template per service under
  `templates/`, so the root file stays short as the project grows.
- `--shared-api` now decides only where the API Gateway lives, not the file layout.
  It defaults to `no` (one API per service).
- With a shared API, `slskit run` serves a flattened template generated from
  `slskit.json`, because SAM local cannot resolve an API held in a parent stack.
- The manifest is `slskit.json`. A project still holding `sless.json` is read as
  before and migrated on the next write.
- Serverless Framework support was removed; generated projects are AWS SAM only.

### Fixed

- `slskit function` no longer wipes every environment except `dev` from
  `slskit.json` — regions, profiles and variables are preserved.
- A function name reused in another service is refused instead of silently
  overwriting the first function in the template.
- Parameter values containing spaces are no longer truncated on their way to SAM.
- `DATABASE_URL` reached deployed functions as the literal string `DatabaseUrl`.

## [0.1.0]

- Initial release.
