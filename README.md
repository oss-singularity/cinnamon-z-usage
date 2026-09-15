<p align="center">
  <picture>
    <img src="icon.png" width="96" height="96" alt="ChatGPT Usage Monitor icon">
  </picture>
</p>

<h1 align="center">ChatGPT Usage Monitor for Cinnamon</h1>

<p align="center">
  Keep ChatGPT Work, Codex and Codex Spark usage beautifully in view — right in
  your Cinnamon panel.
</p>

<p align="center">
  <a href="https://github.com/oss-singularity/cinnamon-chatgpt-usage/actions/workflows/check.yml"><img alt="Checks" src="https://github.com/oss-singularity/cinnamon-chatgpt-usage/actions/workflows/check.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="License GPL-3.0-or-later" src="https://img.shields.io/badge/license-GPL--3.0--or--later-6f5bd5"></a>
  <img alt="Cinnamon 5.8 or newer supported" src="https://img.shields.io/badge/Cinnamon-5.8%2B%20supported-75c46b">
  <img alt="Codex app-server" src="https://img.shields.io/badge/data-Codex%20app--server-111111">
</p>

![ChatGPT Usage Monitor for Cinnamon — live limits, reset times and 24-hour history](.github/social-preview.png)

## See it in action

| Common Codex-only two-window details                                                                                                   | AIC balance in the detailed usage view                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| ![Codex-only usage menu with 5h and 7d quota rings and the vertical panel anchor visible](docs/model-limits/usage-menu-codex-only.png) | ![Codex-only usage menu with the optional AIC balance displayed in the panel](docs/model-limits/usage-menu-credits.png) |

<p align="center"><sub>The opt-in AIC balance is also included in the detailed usage view, while the quota and activity sections remain unchanged.</sub></p>

| Panel state               | Horizontal panel                                                                                               | 40 px vertical panel                                                                                                 |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Common Codex-only 5h + 7d | ![Common Codex-only horizontal panel with 5h and 7d indicators](docs/model-limits/topbar-codex-two.png)        | ![Common Codex-only vertical panel with 5h and 7d indicators](docs/model-limits/vertical-panel-codex-two.png)        |
| Default Codex 7d          | ![Default horizontal panel with only the Codex 7d indicator](docs/model-limits/topbar-codex-only.png)          | ![Default vertical panel with only the Codex 7d indicator](docs/model-limits/vertical-panel-codex-only.png)          |
| Codex 7d + Spark          | ![Codex and Spark limits in a horizontal top bar with both panel indicators](docs/model-limits/topbar.png)     | ![Codex and Spark limits in a vertical panel with both panel indicators](docs/model-limits/vertical-panel.png)       |
| Optional AIC + Codex 7d   | ![Horizontal panel with the optional AIC balance and Codex 7d indicator](docs/model-limits/topbar-credits.png) | ![Vertical panel with the optional AIC balance and Codex 7d indicator](docs/model-limits/vertical-panel-credits.png) |

<p align="center"><sub>Typical Plus and standard Business accounts use the common two-window state; the 5x Business variant is separate. The compact default keeps only account-wide Codex 7d, while the AIC row requires <em>Show credits in the panel</em> and places our usage icon before the balance.</sub></p>

| Usage overview                                                                                          | Spark quotas and recent activity                                                                                                            |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| ![Usage menu with model-specific panel indicators and hourly history](docs/model-limits/usage-menu.png) | ![Expanded Spark 5h and 7d demo histories sharing one activity chart with the panel anchor visible](docs/model-limits/usage-menu-spark.png) |

<p align="center"><sub>Native horizontal and vertical layouts keep the panel indicators visible as a visual anchor while the popup expands to show the details.</sub></p>

| Default overview on a horizontal panel                                                                                                   | Conditional four-ring quota state                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ![Horizontal-panel default with muted unused Spark rings and both Spark sections collapsed](docs/model-limits/usage-menu-horizontal.png) | ![Usage menu with account-wide Codex 5h and 7d plus Spark 5h and 7d quota rings and the vertical panel anchor visible](docs/model-limits/usage-menu-four-rings.png) |

<table>
  <tr style="background-color: transparent;">
    <td rowspan="2" align="center" valign="top">
      <strong>Precise hourly bucket details</strong><br>
      <img src="docs/model-limits/bucket-tooltip.png" width="467" alt="Hourly bucket hover details beside both model-specific panel indicators">
    </td>
    <td align="center" valign="top">
      <strong>Explicit earned-reset confirmation</strong><br>
      <img src="docs/model-limits/reset-confirmation.png" width="393" alt="Native confirmation dialog before using an earned limit reset with the vertical panel anchor and both model-specific indicators visible">
    </td>
  </tr>
  <tr style="background-color: transparent;">
    <td align="center" valign="top">
      <strong>Every active quota at a glance</strong><br>
      <img src="docs/model-limits/panel-tooltip.png" width="278" alt="Compact panel hover summary beside both model-specific panel indicators">
    </td>
  </tr>
</table>

| ChatGPT desktop app guidance                                                                                        | Codex CLI guidance                                                                                              |
| ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| ![ChatGPT App installation help beside both model-specific panel indicators](docs/model-limits/install-chatgpt.png) | ![Codex CLI installation help beside both model-specific panel indicators](docs/model-limits/install-codex.png) |

| General settings with model-specific panel limits enabled                                            | Colors and thresholds beside both model-specific panel indicators                                    |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| ![General settings with model-specific panel limits enabled](docs/model-limits/settings-general.png) | ![Color settings beside both model-specific panel indicators](docs/model-limits/settings-colors.png) |

![Notification settings with weekly refresh and optional low-limit alerts](docs/model-limits/settings-notifications.png)

## Why it feels at home

- Live remaining usage, reset countdowns, credits and earned-reset status in a
  compact native Cinnamon popup.
- Clear 5h and 7d rings, observed 24-hour activity, hourly bucket details and
  helpful reset tooltips.
- Automatic Codex Spark discovery with an uncluttered default that can show only
  the account-wide Codex 7d indicator in the panel.
- Optional compact AIC credit-balance display beside the panel quota indicators.
- One polished layout for horizontal panels and real 40 px vertical panels,
  with configurable colors, thresholds, labels and text size.
- Native ChatGPT App and Codex CLI launch guidance, configurable backend paths,
  notifications and a Copy Screenshot action.
- Local-first by design: no browser scraping, API key, hosted account service,
  prompt storage or background daemon.

## Get started

```bash
git clone https://github.com/oss-singularity/cinnamon-chatgpt-usage.git
cd cinnamon-chatgpt-usage
./install.sh
```

Then open **System Settings → Applets** and add **ChatGPT Usage Monitor** to a
panel. Use a signed-in Codex CLI or a supported ChatGPT desktop app as the local
backend; the applet does not install either product.

## Documentation

The [technical documentation hub](docs/README.md) contains backend and settings
details, privacy boundaries, testing and capture reproduction, package
validation, release receipts and the Cinnamon Spices handoff.

Useful entry points:

- [Technical and maintainer documentation](docs/README.md)
- [Security policy](SECURITY.md)
- [Attribution](ATTRIBUTION.md) and [icon notices](icons/ATTRIBUTION.md)
- [License](LICENSE)

## Trust and attribution

The applet talks to the user's locally installed Codex app-server and stores
only the small local history needed for its charts. Credentials and prompts are
never read or bundled. Earned resets always require an explicit confirmation.

Made with love by Claudiu & Codex. 🩷

Licensed under GPL-3.0-or-later. OpenAI, ChatGPT and Codex are trademarks of
OpenAI; this independent community project is not affiliated with or endorsed
by OpenAI.
