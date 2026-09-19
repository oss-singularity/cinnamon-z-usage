---
name: cinnamon-z-usage-live-sync
description: Install Claudiu's cinnamon-z-usage checkout through its normal user installer, reload only that Cinnamon applet, and prove that the live regular-file deployment matches the repository. Use automatically after source changes, checkout changes, a pull or rebase, before live UI testing, or whenever the installed Z Usage Monitor applet may be stale; do not use symlinks or restart Cinnamon.
---

# Cinnamon Z Usage Live Sync

Keep the live applet on the same path a normal user exercises: `install.sh`
copies the current checkout into Cinnamon's per-user applet directory, then a
targeted `ReloadXlet` makes that copy live. Never replace this deployment with
development symlinks.

Treat this as the automatic completion step after every project source change.
Re-run the normal installer, targeted reload and post-audit before handing the
change back or releasing it.

## Fixed scope

- Project UUID: `z-usage@oss-singularity`; pass the selected isolated worktree
  explicitly to the audit when source changes are being tested.
- Canonical checkout (default only):
  `/home/claudiu/git/oss-singularity/cinnamon-z-usage`
- Applet UUID: `z-usage@oss-singularity`
- Installed directory:
  `/home/claudiu/.local/share/cinnamon/applets/z-usage@oss-singularity`
- Live panel anchor: `panel3:right` directly below the
  `chatgpt-usage@oss-singularity` instance (position 13; cornerbar sits at 14).
- Convenience helper:
  `/home/claudiu/git/oss-singularity/cinnamon-z-usage-restart.sh` (create it on
  demand from the canonical commands below if it is missing).

The helper runs the project's public `install.sh` and then calls Cinnamon's
targeted applet reload. Treat it as the preferred sync entry point. Do not
modify account data, history, settings, authentication state, enabled applets,
or unrelated Cinnamon components.

## Crash containment

- If the targeted reload or a live check produces a Cinnamon or panel crash,
  stop after the first failure. Do not restart Cinnamon repeatedly and do not
  use a whole-session replacement as an automatic fallback.
- Capture the exact D-Bus result, Cinnamon PID, applet PID/command line, and
  relevant `coredumpctl`/`journalctl` evidence before attempting recovery.
  Treat `mate-panel --replace` and `notification-area-applet` as separate
  fallback-panel processes, not as proof that this applet is the crashing
  component.
- If a diagnostic requires disabling this applet, save the exact
  `enabled-applets` entry, remove only that entry through a reversible targeted
  operation, and restore it only after the shell is stable. Never rewrite the
  whole setting or touch desklet settings.
- Use `cinnamon-isolated-capture` for visual QA after a live-shell incident.
  Its private display and bus avoid turning a screenshot into another shell
  recovery event.

## Audit before mutation

Run the bundled audit first:

```bash
python3 /home/claudiu/.zcode/skills/cinnamon-z-usage-live-sync/scripts/audit_deployment.py \
  --project <selected-worktree> \
  --installed /home/claudiu/.local/share/cinnamon/applets/z-usage@oss-singularity
```

The audit reads the complete managed-file allowlist from
`<selected-worktree>/packaging/files.json` (or the canonical checkout when
`--project` is omitted). Require every manifest destination to be a matching
regular file and reject symlinked destinations or parents. Extra legacy or
unmanaged installed files are outside the comparison and must remain
untouched. This keeps the audit in sync when the package grows or retired
artwork disappears; it must not carry a second hard-coded file list.

Also record the Cinnamon process ID before syncing:

```bash
pgrep -xo cinnamon
```

If the user requested only inspection or diagnosis, stop after this read-only
audit and report any drift. Do not install or reload.

## Sync the normal user deployment

When the user asked to apply changes, live-test, prepare a release, or
otherwise make the checkout current, run:

```bash
cd <selected-worktree>
./install.sh
gdbus call --session --dest org.Cinnamon --object-path /org/Cinnamon --method org.Cinnamon.ReloadXlet "z-usage@oss-singularity" "APPLET"
```

This is intentionally copy-based. Do not create symlinks. Do not restart the
whole Cinnamon session. For a first-time panel integration instead of an
update, add the exact `enabled-applets` entry (currently
`panel3:right:13:z-usage@oss-singularity:127`) through a targeted gsettings
change and let Cinnamon load it; then verify with the Looking Glass log line
`Loaded applet z-usage@oss-singularity`.

## Headless popup-layout validation

For layout verification without touching the live desktop, use the bundled
driver through `cinnamon-isolated-capture`:

```bash
bash /home/claudiu/.zcode/skills/cinnamon-isolated-capture/scripts/run-isolated.sh \
  --stage-applet ~/.local/share/cinnamon/applets/z-usage@oss-singularity \
  --output /tmp/z-popup.png --geometry 1920x1080x24 --settle-ms 50000 \
  -- bash <skill-dir>/scripts/verify-popup-layout-driver.sh
```

It stages a realistic demo snapshot (coding plan + ZCode plan limits with
history charts), opens the popup and scrolls to the bottom. Check the frame
for: header rings inside the popup, expanded plan sections, the accordion
leaves and the fully painted three-row action footer. See
`scripts/README.md`.

## Verify the live result

Run the audit again and require its success summary with a dynamic count:

```text
EXPECTED=<manifest-count> VALID=<manifest-count> SYMLINKS=0 MISMATCHES=0
```

Then require all of the following:

- the Cinnamon PID is unchanged;
- the applet is still enabled and its live instance exists;
- managed source and installed hashes match;
- the applet is no longer busy;
- the snapshot is healthy, or the explicit missing-key state is visible when
  that is the scenario being tested (the applet is API-key-less when a ZCode
  app is signed in; otherwise it expects a configured key);
- no new applet error is present.

For visual acceptance, inspect the real Cinnamon/X11 applet after proving the
artifact match. Follow the `cinnamon-ui-workflows` focus warning before any
action that can steal focus or input.

If targeted reload fails once, stop and inspect the D-Bus result, installed
artifact, and applet instance. Do not escalate automatically to restarting
Cinnamon.
