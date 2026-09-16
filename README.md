<p align="center">
  <picture>
    <img src="icon.png" width="96" height="96" alt="Z Usage Monitor icon">
  </picture>
</p>

<h1 align="center">Z Usage Monitor for Cinnamon</h1>

<p align="center">
  Keep your <strong>Z.ai GLM Coding Plan</strong> beautifully in view — right in your Cinnamon panel.
</p>

<p align="center">
  <a href="https://github.com/oss-singularity/cinnamon-z-usage/actions/workflows/check.yml"><img alt="Checks" src="https://github.com/oss-singularity/cinnamon-z-usage/actions/workflows/check.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="License GPL-3.0-or-later" src="https://img.shields.io/badge/license-GPL--3.0--or--later-6f5bd5"></a>
  <img alt="Cinnamon 5.8 or newer supported" src="https://img.shields.io/badge/Cinnamon-5.8%2B%20supported-75c46b">
  <img alt="Z.ai monitor API" src="https://img.shields.io/badge/data-Z.ai%20usage%20monitor%20API-4f2fff">
</p>

<p align="center">
  <img src=".github/social-preview.png" alt="Z Usage Monitor — quota rings, plan buckets and activity chart" width="720">
</p>

## Why you will love it

- **Everything at a glance** — 5-hour and weekly quota windows as rings in the
  panel and the popup, with live reset countdowns.
- **All your plans, stacked** — the personal Coding Plan _plus_ the ZCode Start
  Plan and Global Build token buckets, each with its own collapsible section.
- **API-key-less by default** — no setup: the applet reuses the credentials of
  your signed-in ZCode app. It only performs read-only GET requests against
  `https://api.z.ai`.
- **Built for real panels** — horizontal and vertical panels, threshold
  colors, pinned header and action footer, and a scrollable popup that never
  lets content escape.
- **Sticky chrome** — title, quota rings and the action buttons stay visible
  while the details scroll beneath them.

## Installation

```bash
./install.sh
```

Then enable _Z Usage Monitor_ via _System Settings → Applets_ and add it to a
panel. Requires Python 3.10+ and Cinnamon 5.8 or newer.

**Credentials:** nothing to configure if the ZCode app is signed in — the
applet picks up its Coding Plan API key automatically. Optional overrides:
the _Z.ai API key_ setting, the `ZAI_API_KEY` environment variable, or the
file `~/.config/cinnamon-z-usage/api-key`.

## The popup

| Zone               | What you get                                                                                  |
| ------------------ | --------------------------------------------------------------------------------------------- |
| Header (pinned)    | Title, last-update stamp and the 5h / 7d quota rings                                          |
| Usage limits       | Coding Plan 5h/7d plus ZCode Start Plan and Global Build sections, each with reset countdowns |
| Recent consumption | 1h/4h/12h/24h observed consumption and a 24-hour activity chart                               |
| Plan / Credits     | Plan level, remaining credits and observed credit consumption                                 |
| Footer (pinned)    | Z.ai Chat, Usage dashboard, Refresh, API Keys, Z.ai and Docs                                  |

## Links

- **Development, architecture and the fork/backport guide:** [docs/README.md](docs/README.md)
- **Sibling applet:** [cinnamon-chatgpt-usage](https://github.com/oss-singularity/cinnamon-chatgpt-usage) (ChatGPT Work & Codex)

## Credits

Built with love by Claudiu & ZCode as part of
[OSS Singularity](https://github.com/oss-singularity). Forked from
[cinnamon-chatgpt-usage](https://github.com/oss-singularity/cinnamon-chatgpt-usage)
by Claudiu & Codex. All bundled icons are original OSS Singularity artwork
(GPL-3.0-or-later) except the bundled symbolic action icons from
[Ubuntu Yaru](https://github.com/ubuntu/yaru); see `icons/ATTRIBUTION.md`.

Licensed under [GPL-3.0-or-later](LICENSE).
