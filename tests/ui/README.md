# Private Cinnamon capture workflow (Z Usage Monitor)

The scripts run Xvfb, a private D-Bus session and a private HOME/XDG/dconf
environment. They never fall back to the live display, and they never touch
the user's real Cinnamon settings. The applet is staged through the regular
repository installer path into the private session, and the display snapshot
is replaced with an in-memory fixture — no account-backed request happens.

## Capture the README inventory

Run from the repository root:

```bash
python3 tests/ui/capture.py --output /tmp/z-usage-captures
```

Use `--only usage-menu topbar` to limit variants, `--theme Mint-Y` for the
light theme (default: Mint-Y-Dark-Aqua), and pass
`--extension /absolute/extension-directory` (plus optional
`--extension-config settings.json`) to reproduce a panel extension inside
the private session. A manifest with geometry, theme, locale, scale, source
hashes and the base commit is written next to the PNGs.

## Variants

- `usage-menu` — the primary vertical overview (critical 0% 5h case).
- `usage-menu-horizontal` — horizontal panel popup.
- `usage-menu-history` — history sections with 24h activity charts.
- `usage-menu-four-rings` — four-ring layout.
- `usage-menu` with `QA_MODEL_SPECIFIC_LIMITS=off` — coding-plan-only view.
- `bucket-tooltip` — hover tooltip on the last activity bucket.
- `topbar` / `vertical-panel` — panel icon states.
- `credits-panel` — panel with the credits block (`QA_SHOW_CREDITS_IN_PANEL=1`).
- `settings-general` / `settings-colors` — native xlet settings windows.

## QA switches

- `QA_PANEL_ALERTS=on|off` with `--only topbar vertical-panel`: threshold
  colors at the exact 25%/10% boundaries against the private fixture.
- `QA_ALIGNMENT=1`: toggles model-specific limits on/off/on and verifies
  visible ring/plot edges against the footer buttons after every rebuild.
- `QA_RELEASE_REVIEW=1`: content review pass over the composed captures.
- `QA_TEARDOWN=1`: exercises the native applet removal path and verifies
  timers, signals, cancellables and menu stack are cleared.

## Single variant / manual run

`capture.py` drives `capture-variant.sh` through
`tests/ui/run-isolated.sh`, but each piece runs standalone:

```bash
bash tests/ui/run-isolated.sh basic --output /tmp/out.png \
  --settle-ms 20000 -- bash tests/ui/capture-variant.sh basic \
  /tmp/geometry.txt vertical
```

Content and alignment checks (`check-popup-content.sh`,
`check-content-alignment.sh`) verify every popup capture after rebuild and
reopen; popup width must equal `419 × ui_scale × text_scale`.

Requirements: Cinnamon, CJS, Xvfb, dbus-run-session, gsettings, gdbus,
ImageMagick, xsetroot, xdotool, xdpyinfo, Python 3.10+.
