<p align="center">
  <picture>
    <img src="icon.png" width="96" height="96" alt="Z Usage Monitor icon">
  </picture>
</p>

<h1 align="center">Z Usage Monitor for Cinnamon</h1>

<p align="center">
  Keep your Z.ai GLM Coding Plan usage beautifully in view — right in your
  Cinnamon panel.
</p>

<p align="center">
  <a href="https://github.com/oss-singularity/cinnamon-z-usage/actions/workflows/check.yml"><img alt="Checks" src="https://github.com/oss-singularity/cinnamon-z-usage/actions/workflows/check.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="License GPL-3.0-or-later" src="https://img.shields.io/badge/license-GPL--3.0--or--later-6f5bd5"></a>
  <img alt="Cinnamon 5.8 or newer supported" src="https://img.shields.io/badge/Cinnamon-5.8%2B%20supported-75c46b">
  <img alt="Z.ai monitor API" src="https://img.shields.io/badge/data-Z.ai%20usage%20monitor%20API-4f2fff">
</p>

`z-usage@oss-singularity` is a Cinnamon applet that shows the 5-hour and weekly
quota windows of a Z.ai GLM Coding Plan directly in the panel: remaining usage,
reset countdowns, per-window credit consumption and a 24-hour activity chart.
It is the Z.ai sibling of
[cinnamon-chatgpt-usage](https://github.com/oss-singularity/cinnamon-chatgpt-usage)
and shares its git history so upstream improvements can be backported.

## Features

- **Panel display** for horizontal and vertical panels with the 5h and 7d
  windows, threshold colors and an optional credit balance.
- **Usage popup** with quota rings, reset countdowns, observed consumption
  (1h/4h/12h/24h/today), a 24-hour activity chart and plan information.
- **API-key-less by default.** The backend resolves the Coding Plan API key the
  same way the Codex applet finds its app-server:
  1. the *Z.ai API key* applet setting (optional),
  2. the `ZAI_API_KEY` environment variable,
  3. `~/.config/cinnamon-z-usage/api-key` (recommended for a manual override),
  4. the Coding Plan API key cached by the signed-in
     [ZCode](https://zcode.z.ai) app in `~/.zcode/v2/config.json`.
- **Weekly reset notifications** and optional low-usage notifications with
  configurable warning/critical thresholds.
- **Launch buttons** for the Z.ai chat, the usage statistics dashboard, the API
  key list and the developer docs.

## Installation

```bash
./install.sh          # or: make install
make uninstall
```

The installer copies the applet to `~/.local/share/cinnamon/applets/z-usage@oss-singularity`.
Enable it via *System Settings → Applets*, or add it to a panel with Cinnamon's
applet management. Requires Python 3.10+; the applet never installs a backend
and only performs read-only GET requests against `https://api.z.ai`.

## Fork relationship and backports

This repository is a fork of
[cinnamon-chatgpt-usage](https://github.com/oss-singularity/cinnamon-chatgpt-usage)
(`upstream` remote). Upstream fixes flow in through a normal merge:

```bash
git fetch upstream
git merge upstream/main     # resolve conflicts in the Z-specific regions
```

Divergence map, to keep conflicts small:

| Area | Z-specific state |
| --- | --- |
| Backend | `z_usage.py` talks to the Z.ai monitor API; the Codex app-server transport is gone. |
| Identity | UUID `z-usage@oss-singularity`, gettext domain, metadata and icons. |
| Launch buttons | Z.ai chat, usage statistics, API keys, docs. |
| Reset credits | Dropped — Z.ai coding plans expose no reset-credit redemption (ZCode hints at `/api/v1/coding-plan/reset`; porting that is roadmap). |
| Path settings | Dropped — there is no local Z.ai backend binary. |
| Neutral code | History, activity charts, notifications, popup layout, settings widget classes are intentionally unchanged for clean merges. |

The account-level limit uses the id `zai` (constant `ACCOUNT_LIMIT_ID` in
`applet.js`/`usage-format.js`).

## Development

```bash
make check        # cjs regression suites, python unittest suite, schema,
                  # icon verification, translation template, shellcheck
make translations # regenerate po/z-usage@oss-singularity.pot
```

## Credits

Built with love by Claudiu & ZCode as part of
[OSS Singularity](https://github.com/oss-singularity). Forked from
[cinnamon-chatgpt-usage](https://github.com/oss-singularity/cinnamon-chatgpt-usage)
by Claudiu & Codex. All bundled icons are original OSS Singularity artwork
(GPL-3.0-or-later) except the bundled symbolic action icons from
[Ubuntu Yaru](https://github.com/ubuntu/yaru); see `icons/ATTRIBUTION.md`.

Licensed under [GPL-3.0-or-later](LICENSE).
