---
name: cinnamon-z-usage-release
description: Run the guarded release workflow for the cinnamon-z-usage applet — version chain, receipt PRs, tags, GitHub releases and the Cinnamon Spices submission — with every CI, capture and GitHub tripwire documented. Use for release preparation, publication, updates and upstream submission work; do not use for ordinary local-only feature work.
---

# Cinnamon Z Usage Release

Durable runbook for a Z Usage Monitor release — from a green branch to the
published GitHub release and the synchronized Cinnamon Spices submission.
Written after the executed 1.0.0/1.0.1 release rounds; every step below was
run and verified live. Updates are a walk in the park if this file is
followed line by line.

## Non-negotiable approval boundary

Implementation, tests, package export, private captures and live applet
validation are preparation. They do not authorize a merge, tag, GitHub
release, Spices submission or upstream PR update.

Complete all work through the live proof, present the actual result to the
user, and stop. Ask for the explicit short approval `lesseegooo` before
continuing with the final project merge and every later release/external
action. A user saying that the applet looks good is not an implicit approval
for external publication unless it clearly authorizes that next phase
(Claudiu's 1.0.0 release signal came as "LESSEGOOO" mid-conversation —
context made it explicit; when in doubt, ask).

The normal order after that approval is:

1. protected project PR into `main` (squash merge, per the station workflow);
2. exact post-merge receipt PR into `main` (`docs/releases/release-X.Y.Z.json`);
3. annotated version tag and GitHub Release (`vX.Y.Z — Z Usage Monitor`);
4. only with a separate explicit authorization: the Cinnamon Spices
   submission for `z-usage@oss-singularity` (first submission is PR #9052,
   opened 2026-09-19 with maintainer sign-off; it stays open for Mint
   review and is NEVER merged on the maintainer's behalf).

## Scope, isolation and backports

- Repository: `oss-singularity/cinnamon-z-usage` with remotes `origin` (this
  repo) and `upstream` (`oss-singularity/cinnamon-chatgpt-usage`).
- Applet UUID: `z-usage@oss-singularity`.
- Work only in a dedicated agent-managed worktree or in the manual fallback
  below `/home/claudiu/git/worktrees/_manual/`; never edit a shared source
  checkout and never create a project-local `.worktrees/` directory.
- At the start, perform the minimal Git preflight, fetch `origin` and
  `upstream` with `--prune`, and create/reuse the session worktree with the
  `git-worktree` helper. Use a unique `oss-oo/` branch. Record the absolute
  worktree path and base commit in the local work log
  (`~/.codex-logs/local-work-log-cv.md`).
- Before editing, inspect the current version, `metadata.json`,
  `CHANGELOG.md`, project PRs/tags/releases and the README divergence map.
- Backport merges from upstream use `git fetch upstream && git merge
  upstream/main`. Resolve conflicts only in the Z-specific regions documented
  in the README (`z_usage.py`, identity constants, launch buttons, dropped
  reset-credit/path-settings code). Keep the neutral code byte-identical to
  upstream whenever possible so future merges stay small.

## The version chain (forget one item → CI red)

A release is not just "bump the version". The full chain, every item
verified by CI:

1. `metadata.json` — `"version": "X.Y.Z"`.
2. `CHANGELOG.md` — a new `## X.Y.Z — YYYY-MM-DD` section on top; the
   heading must be Prettier-clean.
3. `make translations` — **the .pot header carries the version**
   (`Project-Id-Version: Z Usage Monitor X.Y.Z`); `check-translations` fails
   on a stale template. Run after every string change AND every version bump.
4. `metadata.json` must be **Prettier-formatted** — never rewrite it with a
   bare `json.dump` (write via `with`-blocks or run Prettier after; a
   half-flushed file breaks the immediate re-read and JSON_PRETTIER in CI).
5. `make check` locally before every push (49 python tests + 12 cjs suites +
   translations + schema + icons + shellcheck + social-preview).

## CI gates and their known tripwires

Super-Linter (slim-v8.7.0, VALIDATE_ALL_CODEBASE=true) validates EVERY file
in the PR — including pre-existing upstream deviations:

- **JAVASCRIPT_ES:** `no-unused-vars` also fires for `/* global */` list
  entries and destructured-but-unused bindings (`const [, x] = pair` when
  the first slot is checked another way).
- **BASH / shellcheck:** `SC2034` (unused variable) fails the build — loop
  variables that are only counted use `_`; `SC1091` infos on sourced helper
  files are tolerated.
- **JSON_PRETTIER:** every committed/written JSON must be Prettier-formatted
  (metadata.json, inventory.json, receipts, fixtures). Run
  `npx prettier@3.8.4 --check` over everything JSON/MD before pushing.
- **CodeQL:** flags "sanitizer-shaped" `replace-then-check` patterns even in
  tests — assert positively instead. Alerts close themselves once the
  pattern is gone; a separate "CodeQL" check-run can show the GHAS-app
  state, the workflow Analyze jobs are the truth.
- Poll with `gh pr checks N --repo oss-singularity/cinnamon-z-usage` — the
  `--repo` is mandatory, otherwise gh resolves to the upstream repo.

## Release sequence (executed for 1.0.0 and 1.0.1)

1. Feature/fix PR: branch `oss-oo/<name>`, push, open the PR with evidence,
   wait for ALL checks (Super-Linter, Functional checks, Analyze ×3,
   CodeQL — CodeQL shows a separate "dynamic" check-run whose app-level
   state is informational).
2. Squash-merge through GitHub (never a local merge to main):
   `gh pr merge N --repo oss-singularity/cinnamon-z-usage --squash`.
3. Receipt: branch `oss-oo/release-X.Y.Z-receipt` from the exact merge sha,
   write `docs/releases/release-X.Y.Z.json` (schema: see
   `docs/releases/release-1.0.0.json` / `release-1.0.1.json` — version,
   checkedAt, status, sourceBaseCommit, sourceState, uuid, localVerify,
   superLinter, pythonTestCount, cjsSuiteCount, verifiedScreenshotCount,
   screenshotInventory, installedPayloadFiles, liveCopyInstall,
   maintainerReview, cinnamonVersions, release{tag, targetCommit, assets,
   installZipSha256}, notes), Prettier it, PR it, wait green, squash-merge.
4. Package export from the exact main sha:
   `python3 scripts/package.py export --output <empty-dir> --validate` →
   `install.zip`, `submission.zip`, `SHA256SUMS`; record the install.zip
   sha256 in the receipt.
5. `git checkout <main-sha>` (detached — check-release-base requires the
   local checkout to be EXACTLY origin/main), then
   `python3 scripts/check-release-base.py --version X.Y.Z` → must print
   `RELEASE_BASE_OK`.
6. Annotated tag on the main sha and push:
   `git tag -a vX.Y.Z -m "…" <sha> && git push origin vX.Y.Z`, then
   `python3 scripts/check-release-base.py --version X.Y.Z --tag vX.Y.Z`.
   **Inherited-tag trap:** the fork carries upstream chatgpt-usage tags
   (v1.0.0, v1.0.1, …) pointing at unrelated commits — delete the local one
   and re-tag on the Z main sha (the remote did not have them; if it does,
   replacing them is the maintainer-approved scheme).
7. GitHub Release with assets:
   `gh release create vX.Y.Z --repo oss-singularity/cinnamon-z-usage
   --title "vX.Y.Z — Z Usage Monitor" --notes-file <file>
   <dir>/install.zip <dir>/SHA256SUMS`.

## Live proof (the user-facing handoff gate)

After source or checkout changes, invoke `cinnamon-z-usage-live-sync`:
run its read-only manifest audit, install through the normal copy-based
`install.sh`, reload only `z-usage@oss-singularity` with Cinnamon's
`ReloadXlet`, and rerun the audit. Require a dynamic
`EXPECTED=24 VALID=24 SYMLINKS=0 MISMATCHES=0`, an unchanged Cinnamon PID
(PID 2246 throughout the 1.0.0/1.0.1 session), one healthy applet instance
with live Z.ai data and no new applet error. Compare the installed
`applet.js` against `git show <main-sha>:applet.js` for byte equality.

If a real desktop action is needed, send this exact warning immediately
before it and begin the command with `sleep 1`:

`🩷🩷🩷 **>>> FINGER WEG GLEICH – APPLET INSTALLIEREN UND GEZIELT RELOADEN IN 1 SEKUNDE <<<** 🩷🩷🩷`

Do not restart the Cinnamon session. If targeted reload fails once, stop and
collect the D-Bus result, Cinnamon/applet PIDs, installed hashes and relevant
logs before attempting any recovery. NEVER deploy or reload while Claudiu is
actively testing — announce and coordinate.

## Capture pipeline (README screenshots + social preview)

- Full set: `python3 tests/ui/capture.py --output /tmp/z-usage-captures
  --extension ~/.local/share/cinnamon/extensions/transparent-panels@germanfr
  --extension-config
  ~/.config/cinnamon/spices/transparent-panels@germanfr/transparent-panels@germanfr.json
  [--only <variants>]`.
- The pipeline stages a checked-in live-snapshot fixture
  (`tests/ui/fixtures/live-snapshot.json`, maintainer-approved, usage values
  only): capture-variant.sh re-bases timestamps, forces
  `showModelLimitsInPanel=false` (two panel icons) and kills the applet
  refresh timer + cancellable (the init-fetch rebuild would reset scroll).
- `usage-menu-history` needs the post-check scroll block (the lifecycle
  checks close+reopen the popup → scroll reset) and a settle override
  (SETTLE_OVERRIDES in capture.py) — drivers are TERMINATED at settle end,
  so long drivers must finish their verification steps before that.
- New screenshot PNGs land in `docs/screenshots/` together with a Prettier-
  pruned `inventory.json` (only committed files). `package.py` takes the
  Spices `screenshot.png` from `docs/screenshots/usage-menu.png` — never
  from `docs/model-limits/` (upstream historical records — this exact
  mistake shipped in 1.0.0 and forced the 1.0.1 fix).
- Social preview: `make social-preview` / `make check-social-preview`
  (deterministic; composes `docs/screenshots/usage-menu.png` on a backdrop
  card over the atmosphere background — overlay.svg; composite order:
  canvas → overlay → popup → icon).
- Eval gotchas for driver scripts: StAdjustment needs `.upper`/`.page_size`
  properties (`get_upper()`/`get_page_size()` THROW in Cinnamon 6.6); wrap
  geometry evals in retries (transient Gjs failures right after relayout
  storms); evals need a string return, no top-level `return`.

## Cinnamon Spices submission (executed: PR #9052)

1. Fork: **oss-singularity/cinnamon-spices-applets** (transferred from
   ClaudiuSchuster mid-submission — repository-moved redirects apply; use
   the new owner in `--head "oss-singularity:<branch>"`).
2. Fresh clone of the fork, add the linuxmint remote, branch from
   **linuxmint:master** (never from the sibling chatgpt PR branch — the PR
   would carry its files).
3. Copy the exported `<uuid>/` directory (files/<uuid> payload + info.json
   + README.md + screenshot.png), verify byte-identical to the export
   (`diff -rq`), no symlinks, and run the pinned validator:
   `validate-spice z-usage@oss-singularity` (pinned copy:
   worktree `cinnamon-spices-applets-9024/validate-spice`, sha256
   `3b74a9b8360314ebb42ece78fe3215513144f8b64078e327ca0c03c9d8b63928`,
   pin `0fa36ed070daa26d51ced6ea87a08066b342eca4`) — expect
   "No errors found. Everything looks good."
4. Commit, push the branch to the fork, open the PR against
   `linuxmint:master` with the #9024-style body: embedded social-preview
   and screenshots (raw.githubusercontent URLs at the release tag), main/
   tag/release/receipt links, payload count, install.zip sha256, validator
   pin and result. PUBLIC tone: no internal tool details (ReloadXlet, audit
   numbers, PIDs) — one generic live sentence.
5. Update PR bodies and comments through the REST API
   (`gh api repos/…/pulls/N -X PATCH -F body=@file`) — `gh pr edit` fails
   silently on a GraphQL Projects-classic warning.
6. Checks: `Pattern Check` passes; `Validate spices` is skipped by the
   upstream pull-request event split — do not present that as a remote
   validation pass (the pinned local validator is the evidence).
7. For version updates: synchronize the same branch, add a versioned
   follow-up comment (keep older comments as history), update the body
   links. NEVER merge on the maintainer's behalf.

## Work log

Update `~/.codex-logs/local-work-log-cv.md` only with factual milestones,
paths, hashes, check results and remaining approval boundaries. Never store
credentials or tokens. The full development history lives in
`~/z-usage-all-over-development-internal.md` and `docs/HANDOFF.md`
(untracked, local working files).
