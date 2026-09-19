# Z Usage Monitor — Development Documentation

Developer and maintainer documentation for `z-usage@oss-singularity`.
The human-facing overview lives in the [root README](../README.md).

## Architecture

| File                          | Role                                                                                                                          |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `applet.js`                   | Applet UI: panel anchor, popup (pinned header/footer + scrollable content), settings bindings, notifications, screenshot copy |
| `z_usage.py`                  | Backend: reads the Z.ai usage monitor API and the ZCode plan balance endpoint, builds the applet snapshot JSON                |
| `usage-format.js`             | Shared formatting/layout helpers (rings, countdowns, charts, notifications)                                                   |
| `settings-schema.json`        | Cinnamon settings schema                                                                                                      |
| `scripts/package.py`          | Allowlisted user installation and deterministic Spices export                                                                 |
| `.github/social-preview-src/` | Deterministic social-preview renderer (see its [README](../.github/social-preview-src/README.md))                             |

### Data sources

1. **Coding Plan quotas** — `GET https://api.z.ai/api/monitor/usage/quota/limit`
   with the raw Coding Plan API key. The response's `CREDIT_LIMIT` entries map
   to the 5h/weekly windows (`unit` 3 = hours, 6 = weeks), `percentage` is the
   used share, `nextResetTime` (ms) the reset timestamp, `level` the plan name.
2. **ZCode plan buckets** — `GET
https://zcode.z.ai/api/v1/zcode-plan/billing/balance` via the
   ZCode backend (`Bearer` start-plan key plus ZCode's client header set),
   returning `plans[]` and `balances[]` per model with `total/used/remaining_units`
   and the bucket period. Mapped as one limit per plan-model pair
   (`source: "zcode-plan"`).

### Credential resolution (API-key-less)

1. the _Z.ai API key_ applet setting,
2. the `ZAI_API_KEY` environment variable,
3. `~/.config/cinnamon-z-usage/api-key`,
4. the Coding Plan API key cached by the signed-in ZCode app
   (`~/.zcode/v2/config.json`, provider `builtin:zai-coding-plan`).

The ZCode plan balance endpoint additionally uses the start-plan key from the
same cache, sent as `Bearer <key>` with ZCode's client headers.

## Fork relationship and backports

This repository is a fork of
[cinnamon-chatgpt-usage](https://github.com/oss-singularity/cinnamon-chatgpt-usage)
(`upstream` remote) sharing its git history. Upstream fixes flow in through a
normal merge:

```bash
git fetch upstream
git merge upstream/main
```

Divergence map, to keep conflicts small:

| Area           | Z-specific state                                                                                                                        |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Backend        | `z_usage.py` talks to the Z.ai monitor API and the ZCode plan balance endpoint; the Codex app-server transport is gone                  |
| Identity       | UUID `z-usage@oss-singularity`, gettext domain, metadata and icons                                                                      |
| Launch buttons | Z.ai chat, usage statistics, API keys, docs                                                                                             |
| Reset credits  | Dropped — Z.ai coding plans expose no reset-credit redemption yet (ZCode hints at `/api/v1/coding-plan/reset`; porting that is roadmap) |
| Path settings  | Dropped — there is no local Z.ai backend binary                                                                                         |
| Neutral code   | History, activity charts, notifications, popup layout and the settings widget classes stay byte-identical to upstream for clean merges  |

The account-level limit uses the id `zai` (constants `ACCOUNT_LIMIT_ID` in
`applet.js`/`usage-format.js`, `ACCOUNT_LIMIT_ID` in `z_usage.py`).

## Development

```bash
make check              # full suite: CJS regressions, Python unittests, schema,
                        # icon verification, translation template, ShellCheck
make translations       # regenerate po/z-usage@oss-singularity.pot
make social-preview     # render .github/social-preview.png
make install            # user installation (~/.local/share/cinnamon/applets)
```

Live iteration uses the `cinnamon-z-usage-live-sync` skill (copy-based install
plus a targeted `ReloadXlet`, never symlinks, never a Cinnamon restart); the
`cinnamon-z-usage-release` skill guards merges, tags and releases.

## Documentation map

### Product and contribution guides

- [Packaging README](../packaging/README.md) — the portable README shipped in
  the Cinnamon applet archive.
- [Translation instructions](../po/README.md) — gettext/POT workflow.
- [Security policy](../SECURITY.md)
- [Project attribution](../ATTRIBUTION.md)
- [Icon attribution and license notices](../icons/ATTRIBUTION.md)
- [License](../LICENSE)
- [Social-preview source notes](../.github/social-preview-src/README.md)

### Upstream historical records (inherited from the chatgpt fork)

- [Screenshot inventory](model-limits/inventory.json) and the capture PNGs in
  this directory — chatgpt-era documentation captures, kept as provenance.
- [Rights inventory](rights-inventory.json) — raster/vector coverage, hashes,
  licenses and provenance evidence.
- [Release receipts](releases/) — upstream 1.0.x validation checkpoints
  (`release-checkpoint.json`, `release-1.0.1` … `release-1.0.6`).
- [Drafts](drafts/) — upstream working notes.

## Testing

- `tests/test_z_usage.py` — snapshot normalisation, window mapping, credential
  resolution, history
- `tests/test_z_api.py` — real HTTP round trips against a local fixture of the
  monitor API
- `tests/test_z_*.py` / CJS suites — popup layout, rings, edge alignment,
  item width clamps, notification delivery
