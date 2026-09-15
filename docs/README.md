# ChatGPT Usage Monitor — technical documentation

[Back to the project showcase](../README.md)

This is the maintainer and contributor hub for **ChatGPT Usage Monitor**. The
root README is intentionally a visual product overview; implementation details,
reproduction commands and release evidence live here.

## Documentation map

### Product and contribution guides

- [Packaging README](../packaging/README.md) — the portable README shipped in
  the Cinnamon applet archive.
- [Private Cinnamon capture workflow](../tests/ui/README.md) — isolated X11
  capture, native UI QA and public screenshot rules.
- [Translation instructions](../po/README.md) — gettext/POT workflow and
  translation scope.
- [Security policy](../SECURITY.md)
- [Project attribution](../ATTRIBUTION.md)
- [Icon attribution and license notices](../icons/ATTRIBUTION.md)
- [License](../LICENSE)
- [Social-preview source notes](../.github/social-preview-src/README.md)

### Current evidence and release records

- [Screenshot inventory](model-limits/inventory.json) — source hashes,
  geometry, fixture state and output hashes for the 22 public captures.
- [Rights inventory](rights-inventory.json) — current raster/vector coverage,
  hashes, licenses and provenance evidence.
- [Historical release checkpoint](releases/release-checkpoint.json) — the original
  1.0.0 validation checkpoint.

Versioned receipts are kept together under [`releases/`](releases/):

- [1.0.6 receipt](releases/release-1.0.6.json)
- [1.0.1 receipt](releases/release-1.0.1.json)
- [1.0.2 receipt](releases/release-1.0.2.json)
- [1.0.3 receipt](releases/release-1.0.3.json)
- [1.0.4 receipt](releases/release-1.0.4.json)
- [1.0.5 receipt](releases/release-1.0.5.json)

The receipts and historical checkpoint are immutable evidence records for the
source commit, package bytes, screenshots, validator and publication gates of
their respective versions.

### Inactive implementation drafts

- [Limit percentage decimal-display draft](drafts/limit-percent-decimal-display.patch)
  — inactive until the upstream API exposes reliable fractional
  `remainingPercent` values; it is not part of the installed package.

## Installation and backend configuration

```bash
git clone https://github.com/oss-singularity/cinnamon-chatgpt-usage.git
cd cinnamon-chatgpt-usage
./install.sh
```

Open **System Settings → Applets** and add **ChatGPT Usage Monitor** to a
panel. Requirements are Python 3.10 or newer, Cinnamon and either a current
[Codex CLI](https://learn.chatgpt.com/docs/codex/cli#getting-started) signed in
with ChatGPT or a supported ChatGPT desktop app package. The Linux ChatGPT
package can provide the local app-server backend by itself; the applet discovers
its bundled `resources/codex` binary when no configured or PATH CLI is available.
If neither option is installed, the native launch/install buttons remain
available as the initial setup choice.

Both optional path fields are available in setup and **General → Usage data**:

- **Codex CLI path** can remain empty for automatic limit-backend discovery.
- **ChatGPT path** selects the app for its launch button and bundled-backend
  fallback, for example `~/Applications/ChatGPT/chatgpt`.

**Save and check** stores the values in General settings and retries detection.
Closing a setup dialog leaves saved settings unchanged. Detected paths are gray
placeholders; focusing an entry hides its placeholder, and leaving it empty
restores the hint. **Recheck** refreshes automatic paths without changing manual
values or launching an app.

Backend priority is: explicit Codex backend path, installed Codex CLI, then the
configured or automatically detected ChatGPT app's `resources/codex` beside the
executable or one directory above. Packed AppImages can be launched but require
an extracted bundle for backend discovery. Paths with spaces work without
quotes; do not append command-line arguments. An invalid app override does not
fall back to another ChatGPT installation. Clearing it restores automatic
discovery and the `chatgpt.desktop` launcher.

Run `./install.sh` again after updates. `./uninstall.sh` removes the applet while
retaining its settings.

## Runtime behavior and data boundary

The helper makes one read-only `account/rateLimits/read` request through the
official local Codex app-server for normal refreshes and exits. An earned reset
is never consumed in the background: the confirmed popup action starts a
separate `account/rateLimitResetCredit/consume` request with one UUID
idempotency key and then refetches the complete usage snapshot.

There is no HTML scraping, API key, browser access or background daemon. To
calculate recent consumption, the applet stores only timestamps, window
durations, percentages, reset timestamps and sampled numeric credit balances
for eight days in
`$XDG_STATE_HOME/cinnamon-chatgpt-usage/history.json` (normally
`~/.local/state/...`, mode `0600`). A small
`weekly-reset-history.json` observation journal in the same directory contains
only model/window keys and reset timestamps so the 7d ring can retain an
observed reset across reloads. No prompts or credentials are recorded.

Reset-credit details are not part of usage history. An unresolved, explicitly
confirmed reset keeps its idempotency key, selected opaque credit ID and backend
path in a separate mode-0600 `reset-attempt.json`. It survives applet
removal/reload and is deleted only after a recognized result reaches the applet.
Retrying requires confirmation and reuses the same parameters; do not change
accounts while a reset outcome is unresolved.

Project code never reads Codex credential files. Authentication and networking
remain the responsibility of the selected local app-server backend.

The panel chooses the lowest remaining percentage for each duration; it does
not add one panel block for every model. The popup shows all visible windows.
The optional **Show credits in the panel** setting adds the available AIC
balance as one compact `AIC`/value block after the quota indicators. It is
disabled by default, uses the configured panel text color and does not change
the quota selection logic.
Numeric rolling totals cover `[now - 24h, now]` independently of the chart's
wall-clock-aligned buckets. All consumption is observed at sample times;
activity between samples is not recoverable.

History belongs to the desktop profile, not to an account. Before changing
accounts, resolve any pending reset, remove the applet from the panel, archive
or delete only `history.json`, switch accounts in the official app or CLI, then
add the applet again. Applet removal alone retains history. Automatic account
partitioning remains a release-readiness investigation.

## Compatibility and declared limits

Version 1.0.6 declares Cinnamon **5.8, 6.0, 6.2, 6.4 and 6.6**, following the
Cinnamon Spices compatibility convention. Native runtime validation on this
host is Cinnamon 6.6.9; the 5.8 settings-widget API was checked against the
official Cinnamon source, but no separate 5.8 live desktop is claimed here.

The tested presentation baseline is X11, Mint-Y/Mint-Y-Dark-Aqua, 100% display
scale and 100–200% text size. Larger text increases popup width proportionally;
the normal view stays 420 px wide. Long menus scroll on smaller screens, and
keyboard focus brings footer actions into view. Mixed-DPI/multiple monitors,
RTL translations, high-contrast shell themes and full screen-reader operation
are not certified by this first-release test baseline.

English is the fallback language. [gettext templates and contributor
instructions](../po/README.md) prepare future translations without claiming
completed language coverage.

## Development

Run the repository's normal checks from the repository root:

```bash
make check
make verify
python3 chatgpt_usage.py
```

`make verify` runs the offline suite, including real subprocess framing and
cancellation, uncertain-reset replay, discovery fixtures and package
round-trips. Development checks additionally require CJS, ShellCheck,
ImageMagick, `rsvg-convert` and Noto Sans. Private UI captures require
Cinnamon, Xvfb, D-Bus, xdotool and the selected themes; see the
[UI reproduction guide](../tests/ui/README.md). No test needs a signed-in
account or a real reset credit.

For a local submission tree plus deterministic install/submission archives:

```bash
python3 scripts/package.py export --output /tmp/chatgpt-usage-spices --validate
```

The output directory must be empty. `--validate` needs network access and
Pillow to run the pinned upstream structural validator. Exporting does not
publish anything and is not evidence of store acceptance. The package uses
[an explicit manifest](../packaging/files.json) shared with the installer.

The export contains the submission tree, `submission.zip`, `install.zip` and
`SHA256SUMS`. The ZIPs have sorted paths, fixed timestamps and regular-file
permissions. No binaries, credentials, state, cache, development tests or
installed executable are included. PNG artwork is included as listed in the
manifest; its presence in a structurally valid archive does not settle its
rights. The installer preserves unmanaged files during upgrade and refuses
symlink destinations; uninstall removes the selected applet directory but
retains external settings, history and unresolved-reset state.

## UI captures and public evidence

The [private capture guide](../tests/ui/README.md) is the source of truth for
the isolated X11 workflow. Public captures use synthetic data, the current
original project artwork and the reference transparent panel. The 22-image
inventory covers popup states, settings, native dialogs and four paired panel
states: the optional AIC + Codex-only 7d view, common Codex 5h+7d,
compact Codex-only 7d, and Codex+Spark. The AIC pair uses native crops so the
additional balance remains visible; the other paired panel anchors deliberately
keep common context crops (94×40 horizontally and 40×96 vertically), so they
remain directly comparable.

When runtime visuals, schemas or fixture behavior change, regenerate the
captures and update both [the screenshot inventory](model-limits/inventory.json)
and [the rights inventory](rights-inventory.json). A valid PNG alone is not
freshness proof. For public approval, show the final captures in the task before
pushing them.

## Release and Cinnamon Spices workflow

The versioned [release receipts](releases/) are the immutable evidence chain.
The guarded publication order is deliberately main-first:

1. Validate the isolated source tree, UI inventory, rights inventory and
   deterministic package.
2. Push a focused branch, pass the protected project checks and merge the
   project PR with a protected squash merge.
3. On the exact merged `main` commit, create and merge the versioned receipt
   PR. The receipt records package hashes, payload hashes, screenshot evidence,
   validator pin and live-copy state.
4. Run `scripts/check-release-base.py`, create the annotated version tag and
   verify its peeled target. Only then publish the GitHub release and assets.
5. Synchronize only this applet's directory into the existing Cinnamon Spices
   PR, run the pinned upstream validator and verify the remote head and checks.

A GitHub release, a Spices PR and catalog acceptance are separate milestones;
none implies the others.

## License, rights and security

The project is licensed under [GPL-3.0-or-later](../LICENSE). The bundled Yaru
action icons retain their CC-BY-SA-4.0 license; see
[icon attribution](../icons/ATTRIBUTION.md). The
[rights inventory](rights-inventory.json) records current artwork and
screenshot provenance and verifies exact asset hashes.

Report vulnerabilities privately as described in the
[security policy](../SECURITY.md). OpenAI, ChatGPT and Codex are trademarks of
OpenAI; this community project is independent and makes no endorsement claim.
