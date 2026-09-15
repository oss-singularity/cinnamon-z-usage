# Changelog

## Unreleased — 0.2.0 (planned)

- Sticky popup chrome: the header (title, updated stamp, quota rings) and
  the action footer are pinned outside the scroll view - the content scrolls
  beneath them, so title, rings and buttons stay visible in every scroll
  position. The popup never shows an empty chrome strip while scrolling.
- The action grid (Z.ai Chat / Usage / Refresh now / API Keys / Z.ai / Docs)
  is a pinned footer at the bottom of the popup: it lives outside the scroll
  view, so the buttons stay visible and clickable while the quota and history
  content scrolls behind them. The former empty reserve at the popup bottom is
  gone — the footer occupies it.
- Remove the content height pin entirely: the forced height disabled the
  scroll view's own adjustment (upper stayed 0), so nothing below the fold
  ever rendered. The scroll view now works on the content's natural height
  with clipping disabled on the content actor.
- Menu items are clamped to the popup's inner width: their inflated minimum
  widths (measured 492 px in a 419 px popup) made the scroll view allocate
  them past the popup edge, painting the countdown rings on the panel. The
  popup actor keeps its full outer width while scroll, content and footer are
  clamped to the inner width (outer minus the theme padding reserve).
- Countdown rings, disclosure arrows and plot widths align to a stable
  geometric anchor - the popup's own content right edge - instead of the
  footer action grid, whose allocation-dependent geometry let the rings
  wander under the popup scrollbar. Repeated syncs are idempotent.
- Flush scroll bottom: after the allocation pass the pinned content height is
  corrected to the real extent of its rows, so a fully scrolled popup ends
  directly above the footer instead of carrying an empty reserve.
- Root fix for the clipped action rows: the scroll view allocated the popup
  content at the viewport height, so everything below the fold (the button
  grid) was cut off entirely. The clamp now pins the content to its natural
  height measured at the real popup width (wrapping included), which makes
  the full action area scrollable.
- Second layout pass: the popup height is clamped before Cinnamon positions
  it so a fully expanded popup stays on screen, a fresh open starts at the
  header (the upstream active-Spark auto-open no longer fires for the new
  Start Plan badges), expanding a section scrolls its rows into view, and the
  recent-consumption accordion resets stale leaf heights on reopen.
- Popup layout hardening from live testing: the header rings stay the coding
  plan's 5h/7d overview (plan badges no longer collide with ring labels), the
  ZCode plan sections are expanded by default with a "Keep ZCode plan sections
  expanded" switch, the popup height is clamped to the monitor so the action
  rows scroll into view instead of disappearing, and recent-consumption
  submenus behave as an accordion so expanded content never overdraws.

- Show the stacked ZCode quota sources: Start Plan and Global Build token
  buckets are read from the signed-in ZCode app's billing balance endpoint and
  rendered as collapsible per-model limits with G/S badges below the coding
  plan limits. A new "Show ZCode plan quotas" switch controls them.
- Reverse-engineered the exact client header set ZCode sends
  (User-Agent, X-Title, X-Platform, X-Os-Category, X-Client-*,
  X-Device-Mid) so the applet reads the same data keylessly; the balance
  endpoint stays optional and never breaks the coding plan snapshot.

## 0.1.0 — 2026-09-15 (Z fork)

- Forked cinnamon-chatgpt-usage 1.0.6 into the Z Usage Monitor
  (`z-usage@oss-singularity`) with shared git history for upstream backports.
- New `z_usage.py` backend reading the Z.ai usage monitor API
  (`/api/monitor/usage/quota/limit`) with 5h and weekly credit windows,
  reset timestamps and the plan level.
- API-key-less credential resolution: applet setting, `ZAI_API_KEY`,
  `~/.config/cinnamon-z-usage/api-key`, then the Coding Plan API key cached by
  the signed-in ZCode app.
- Z.ai launch buttons, Plan/Credits rows, original Z ribbon icons; dropped the
  Codex app-server plumbing, ChatGPT path settings and the ChatGPT-only
  reset-credit flow.

## 1.0.6 — 2026-09-15

- Keep limit remaining percentages at the integer precision exposed by the
  current API; do not manufacture `.00%` values when a critical threshold is
  active. Credit balances retain their existing one-decimal display.
- Retune the primary documentation fixture into a readable chronological
  story: credit-only activity, a clean quota-usage phase, then credit-only
  activity again after the quota boundary.
- Keep the previously considered fractional limit display as an inactive
  implementation draft for a future API that exposes reliable fractional
  `remainingPercent` values.
- Add an opt-in `Show credits in the panel` setting that displays the available
  AIC balance as a compact, panel-colored value beside the quota indicators.

## 1.0.5 — 2026-09-09

- Show the peak credit consumption beside the 24-hour activity peak when
  observed credit usage exists, while keeping consumed windows as whole AIC
  values and the available balance at one decimal place.
- Add a compact upper-left Copy Screenshot action that copies the visible
  usage menu as PNG and briefly replaces the relative update label with its
  exact local timestamp during capture.
- Crop copied screenshots before the bottom action buttons and make the
  outside of the rounded popup corner transparent. Add a 7d quota-ring tooltip
  for the last observed reset, with a clearly marked next-reset estimate until
  an observation exists, and retain that observation across reloads.
- Keep the About description readable with an intentional companion line break.
- Make the private demo cover a reset-boundary transition from a pink-only
  credit bucket back to green quota usage, and preserve the approved 1.0.3
  panel-anchor images for the README.

## 1.0.4 — 2026-09-09

- Track observed credit-balance consumption over the last eight days and show
  the last 24 hours as a critical-color series stacked above quota activity.
- Keep available credit balances at one decimal place while rendering consumed
  credit periods as whole numbers with a compact, non-bold bullet separator.
- Preserve fractional remaining percentages below the configured critical
  threshold, use `<1%` only for positive sub-one-percent panel-ring values,
  and avoid replaying capped usage when reset timestamps drift.
- Keep synthetic UI captures aligned with the real exhausted-quota-to-credit
  fallback sequence.

## 1.0.3 — 2026-09-09

- Expand the declared Cinnamon compatibility from 6.6 only to Cinnamon 5.8,
  6.0, 6.2, 6.4 and 6.6. The custom settings-widget path is available in
  Cinnamon 5.8; native runtime validation remains on Cinnamon 6.6.9.
- Preserve distinct visual heights for nearby measured activity values instead
  of collapsing them into seven coarse relative bars.

## 1.0.2 — 2026-09-09

- Keep dependent notification switches and warning/critical thresholds visible
  in Cinnamon Settings while disabling the controls that are currently inactive;
  show per-model reset switches as effectively enabled when the master switch
  covers them without changing their stored individual values.
- Resolve gettext catalogs below the XDG user data directory so the Cinnamon
  Spices best-practices scanner does not report a hardcoded data path.

## 1.0.1 — 2026-09-08

- Restore automatic-path hints when clicking outside either executable-path field
  in settings, including labels and empty areas. Preserve focus while moving the
  pointer or editing inside the field, normal control actions, keyboard navigation
  and all manual path values. Add native GTK input regression coverage in CI.

## 1.0.0 — 2026-09-08

- Provide gettext for JavaScript, Python, metadata and settings, with a
  reproducible translation template and native catalog regression coverage.
  English remains the fallback; completed translations are not included yet.
- Let Cinnamon manage the popup lifecycle and menu stack. Keep 420 px at normal
  scale, accommodate larger text and display scale, and scroll long menus on
  small screens while keeping keyboard-focused actions visible.
- Respect disabled system animations for reset-expiry indicators and clean up
  the menu, tooltips and settings signals when the applet is removed.
- Align quota/reset rings, disclosure arrows and graph edges with the footer buttons when
  model-specific limits are shown, hidden or toggled; preserve alignment after
  rebuild and reopen, including larger text.
- Refresh documentation with the approved blue background, complete panel
  anchors, reference panel transparency, 48 px dialog gaps and independently
  checked 8 px crop margins. Check arrow bounds after their native rotation.

- Use ChatGPT Usage Monitor consistently in applet metadata, settings,
  documentation and release drafts; retain the descriptive popup heading
  ChatGPT Work & Codex usage.

- Remove the inferred date and preceding dash from the ChatGPT app tooltip;
  retain its detected version and the separate Codex tooltip behavior.

- Prepare the first Spices release as ChatGPT Usage Monitor for Cinnamon 6.6. Replace
  the OpenAI knot and desktop sprite with original, source-included quota,
  chat and terminal-robot artwork; retain the UUID and existing user state.
  Refresh the social preview and UI captures and record asset/license evidence.

- Add a separate optional ChatGPT app executable path for launching and bundled-backend fallback; preserve explicit-backend and installed Codex CLI priority. Offer both path overrides in the initial setup dialogs as well as settings, with detected-path placeholders and a read-only Recheck action.

- Add an applet-wide model visibility switch that hides additional quotas and history, including both Spark sections; clarify the optional backend path override.

- Require a fresh checkbox acknowledgment before enabling reset consumption or an unresolved-reset retry; relock when unchecked and prevent duplicate activation.

- Enable all notification options by default and retain usage alerts in Cinnamon's notification center after the banner timeout; preserve saved choices on upgrade.

- Add an enabled-by-default panel switch for warning and critical percentage colors, independent of menu coloring and the normal panel text color.

- Keep the popup at the same 420 px visible width on horizontal and vertical panels; verify native capture widths after rebuild and reopen.

- Bound JSON-lines app-server transport and local version probes; keep version
  discovery off Cinnamon's UI thread and share Python's backend path resolution.
- Preserve an unresolved, explicitly confirmed reset attempt through reloads,
  reuse its idempotency key on retry and clean up helper/backend processes.
- Calculate rolling 24-hour consumption independently of chart bucket alignment;
  reject missing and non-finite values instead of showing false availability.
- Derive secondary menu text, ring tracks and quota-glyph tint from the Cinnamon theme
  while preserving the configured quota palette and white panel default.
- Prepare deterministic Cinnamon Spices archives, an explicit shared installation
  manifest, complete notices and a portable installed README.
- Add real-process, reset-replay and packaging regression tests, and reproducible
  private screenshot fixtures with a source/hash inventory and Notifications.
- Update support/security documentation and the backend-neutral bug form.
  Catalog submission and 1.0.0 release gates remain tracked in issue #45.

## 0.3.12 — 2026-09-05

- Add a separate Panel text color setting, defaulting to white for panel
  percentages, window labels, separators and loading placeholders in both
  panel orientations and model display modes. Menu usage colors remain
  independently configurable.

## 0.3.11 — 2026-09-05

- Align all four model headings using equal-width icon slots; retain their
  existing shared font size and weight.
- Default normal usage to the existing blue quota-ring color. Share the
  configured normal, warning and critical colors between quota rings, their
  labels and remaining values in both panel display modes.
- Use one configurable critical color for the quota ring, its label and the
  remaining-usage text (10% or less by default). Default to the same static
  neon pink as an imminent reset expiry, with full popup text opacity.
- Fix the existing one-pixel leftward shift of all six action buttons after
  the first refresh by stabilizing popup-centering coordinate rounding.
- Bundle the Yaru symbolic icons for Refresh now, Analytics, ChatGPT and
  Codex Cloud so their shapes stay consistent across system icon themes.
- Use the bundled confirmation checkmark after refreshing, while preserving
  symbolic foreground colors, hover states and the busy indicator.
- Include the original icon attribution and CC-BY-SA-4.0 license.

## 0.3.10 — 2026-09-05

- Collapse the upper Spark quota rows by default when both windows have no
  consumption; open them when either window has positive usage, including
  fractional usage. The heading can be toggled with the mouse or keyboard.
- Mute both Spark header rings when neither quota window has consumption and
  restore their normal opacity as soon as either window is in use.
- Preserve a manual choice during an open-popup refresh and restore the
  usage-based default on the next opening. Keep the existing quota rows,
  countdown sizes and surrounding spacing unchanged.
- Refresh the default and expanded Spark screenshots using isolated Cinnamon
  sessions with horizontal and vertical panel geometry regression checks.

## 0.3.9 — 2026-09-04

- Add the Codex icon to model-labelled recent-consumption headings and give
  `Usage limits` and `Recent consumption` the same heading treatment as the
  popup title.
- Discover the app-server binary bundled with the ChatGPT desktop app when no
  explicit or PATH-based Codex CLI is available; the existing CLI preference
  and signed-in local-app-server flow remain unchanged. When neither backend
  exists, both native launch/install buttons remain available as the initial
  setup choice.
- Refresh the README's Cinnamon captures with visible panel anchors and
  model-specific panel indicators, including the common Codex-only 5h + 7d
  state alongside the horizontal, vertical, Spark and four-ring examples.

- Re-capture the complete README image series with the transparent panel
  treatment, keeping the desktop visible around the applet and preserving
  readable horizontal and vertical panel anchors.

## 0.3.8 — 2026-09-04

- Keep the `Limit resets` label, separator, expiry text and countdown in
  the same muted treatment as `Credits:` while retaining the bright reset
  count.
- Add native hover tooltips to every 5h and 7d reset-countdown circle, showing
  the elapsed percentage of that circle's own reset window and its remaining
  time.
- Add the explicit earned-reset confirmation dialog to the README as a
  privacy-safe, tightly cropped product screenshot.

## 0.3.7 — 2026-09-04

- Make an available earned rate-limit reset explicitly actionable from the
  popup, with a native confirmation dialog showing the available count and
  selected expiry when supplied.
- Consume a reset only after the user confirms, using the local Codex
  app-server, one UUID idempotency key per attempt and the selected opaque
  credit ID when detail rows are available.
- Refresh the full usage snapshot after every terminal consume response and
  keep success, stale-count, no-credit and error outcomes visible without
  adding background redemption or credential access.

## 0.3.6 — 2026-09-04

- Show the local expiry date and time of the next available earned rate-limit
  reset on the same compact line as its reset count, keeping the timestamp in
  the same regular text treatment as `expires` and adding a remaining
  `(~XdYh)` countdown when details are supplied.
- Color the expiry timestamp orange inside seven days and neon pink with a
  breathing alert inside 24 hours; omit the separator, timestamp and countdown
  entirely when no reset credit is available.

## 0.3.5 — 2026-09-01

- Interpret the ChatGPT desktop version date segment (`YY.MDD`) for the
  launch-button tooltip, with the local package/update date as a fallback for
  versions that do not match the observed format.

## 0.3.4 — 2026-09-01

- Derive the ChatGPT launch-button date dynamically from the installed
  executable's local package/update timestamp instead of hardcoding a version.
- Verify that the existing ChatGPT app button still brings a minimized app
  window to the foreground after the package update.

## 0.3.3 — 2026-09-01

- Show the installed ChatGPT package/version and Codex CLI version in the two
  launch-button tooltips, including known release dates separated by an em
  dash.
- Keep the button tooltips centered above the pointer with a 420 ms reveal
  delay, while leaving other applet tooltips unchanged.
- Report missing applications as `not installed` and unreadable versions as
  `version unavailable`.

## 0.3.2 — 2026-08-31

- Keep the nested Spark activity chart on its final horizontal insets from its
  first hidden layout frame, preventing an empty chart from shifting left when
  its manually opened details finish animating.

## 0.3.1 — 2026-08-31

- Supplement rounded-zero 7-day Spark activity buckets with a smallest-height,
  half-scale estimate from the more sensitive 5-hour history while preferring
  measured weekly activity whenever available.
- Replace the 5-hour history's reset-spanning 12-hour and Today values with its
  exact rolling 24-hour consumption total.
- Remove the internal collection-start diagnostic from Spark history details.
- Add refresh-only, deduplicated notifications for any weekly reset or separate
  Codex and Spark weekly resets, with one master switch taking precedence.
- Add independent 5-hour and 7-day low-limit notifications with configurable
  warning and critical thresholds, recovery-aware zone entry and strict
  critical-below-warning validation.
- Refresh the README's settings, popup, expanded-history, full-hour-tooltip and
  focused vertical-panel captures; document the conditional four-ring quota
  state and rebalance the Live Limits pill in the social preview.

## 0.3.0 — 2026-08-30

- Highlight credit balances and rate-limit reset counts with the same bright,
  bold treatment as the remaining-usage values.
- Show a compact, wrapped sign-in message when no ChatGPT login is available,
  explicitly accepting the Codex App or CLI, and discard stale usage
  immediately when a later refresh detects logout.
- Keep the Spark disclosure arrow at one stable horizontal position while its
  usage histories open and close.
- Refresh the complete README screenshot set around a consistent illustrative
  Spark 5h 82%, Spark 7d 76% and Codex 7d 62% demo state.

## 0.2.8 — 2026-08-29

- Keep expanded Spark history compact by sharing one 24-hour activity chart
  between its 5h and 7d summaries and opening the section automatically when
  Spark activity was observed during the last 24 hours.
- Hold the complete popup and its nested Spark content at a balanced 420 px
  from the first rendered frame, without a scrollbar, panel overlap, edge gap
  or late jump when the action buttons appear.
- Align the quota and reset-progress rings to one right edge, retain balanced
  chart margins and keep four-ring headers compact.
- Keep credit balances and reset counts compact by rounding them to whole
  numbers.

## 0.2.7 — 2026-08-29

- Keep the right-panel popup flush with its transparent panel throughout a
  smooth fade-only close, without a final jump, overlap seam or vertical gap.
- Cancel stale close callbacks during rapid open/close changes and safely
  restore Cinnamon's panel stacking after the animation completes.

## 0.2.6 — 2026-08-29

- Add the rolling consumed total directly to each `24h Activity` chart heading,
  while keeping `Today` as the separate local-calendar-day value.
- Keep account and model ChatGPT knots at one consistent size beside popup and
  history headings.

## 0.2.5 — 2026-08-29

- Use the same outlined, italic amber Spark badge beside panel and popup labels
  as in the quota rings, replacing the remaining white `S` markers.

## 0.2.4 — 2026-08-29

- Keep untouched 100%-remaining reset cycles at their exact full `5h` or `7d`
  label and empty progress ring until usage actually begins.
- Separate model markers from quota values with a distinct amber ring badge,
  making Spark's `S` unmistakable without reading it as part of `5h` or `7d`.

## 0.2.3 — 2026-08-28

- Replace the popup header's full update timestamp with a concise live age,
  from `Updated just now` through seconds, minutes, hours and days ago.

## 0.2.2 — 2026-08-28

- Balance the popup's right edge against its left text inset while keeping
  usage rings, activity charts and the Spark disclosure arrow clear of a
  vertical Cinnamon panel.
- Show a blue quota ring for every available account and model-specific usage
  window without collapsing equal 5h or 7d durations.
- Keep the refresh button's content at a stable height across Refresh now,
  Updating and Updated states.
- Align one-hour and two-hour activity buckets to local wall-clock boundaries
  and keep the current running bucket visually partial without a redundant
  tooltip suffix.
- Clamp activity tooltips to the active monitor and keep popup, charts,
  disclosure arrow and action grid perfectly stable while Spark details open.
- Use concise ChatGPT and Codex Cloud labels for the web shortcut buttons.

## 0.2.1 — 2026-08-28

- Keep quota and reset-progress rings plus 24-hour charts fully inside the
  popup when Cinnamon's native model-history submenu adds its scrollbar
  allocation.
- Keep the action-button grid exactly centered with stable button widths
  throughout native submenu animations.

## 0.2.0 — 2026-08-28

- Discover every named usage bucket exposed by the Codex app-server, including
  dedicated GPT-5.3-Codex-Spark 5h and 7d limits when enabled for the account,
  while keeping unnamed internal buckets hidden.
- Group account and model-specific limits and their observed histories clearly
  in the popup while retaining a compact account-only panel by default, with
  an option to add model-specific limits to the panel. Model histories use
  native expandable Cinnamon submenus with overlay scrollbars to keep the
  default popup compact and its width stable.
- Add paired circular indicators for every active 5h and 7d window: available
  quota in a cyan popup-header ring and green reset progress in its usage row,
  with no additional API requests.
- Add native Cinnamon hover details to every one-hour activity bucket with its
  local time range, observed consumption and partial/unknown state, using a
  responsive 120 ms reveal delay.
- Show the elapsed collection duration beside the absolute history start time.
- Add observed consumption for the last 1h, 4h, 12h and local calendar day,
  calculated separately for every active account or named model quota.
- Add a compact 24-hour activity bar timeline with time axis, configurable
  one-hour or two-hour buckets, peak scale and visually dimmed unknown history.
- Show safely observed consumption immediately in incomplete buckets as dimmed
  partial bars with an approximate (`~`) peak instead of hiding the activity.
- Persist only minimal credential-free samples for eight days in the user's XDG
  state directory with private file permissions.
- Treat resets as new quota generations, ignore falling rolling-window values
  and mark incomplete observation periods with `~`.
- Ignore one-minute reset-timestamp jitter so transient API rounding cannot
  create phantom consumption spikes.
- Add availability-aware ChatGPT App and Codex CLI launch buttons that open
  native installation guidance instead of becoming inactive when software is
  missing, plus direct links to ChatGPT, Codex Cloud and ChatGPT Analytics.
- Keep the popup open while `Refresh now` updates the displayed usage values
  with a click-blocking activity spinner, then briefly confirm successful
  updates in green.
- Enrich the native Cinnamon About dialog with a short project note and credits.

## 0.1.0 — 2026-08-27

- Read ChatGPT Work and Codex limits through the official local Codex
  `account/rateLimits/read` app-server method.
- Mirror the canonical account-level Analytics limits while excluding internal
  model-specific buckets that the web page does not show.
- Discover primary and optional secondary windows dynamically, including the
  five-hour window only for accounts that expose it.
- Allow hiding the 7d panel block whenever a 5h window is active.
- Show a bold click-menu title plus active reset times, credits and earned resets
  in clearly separated rows.
- Label the canonical click-menu section `Usage limits` instead of exposing its
  internal bucket name.
- Adapt automatically between compact horizontal and 40 px vertical layouts.
- Add configurable refresh interval, CLI path, labels, icon, separator, font,
  colors and remaining-usage thresholds.
- Default to a three-minute refresh interval and 100% panel font size.
- Use the original ChatGPT knot mark as an optically sized transparent white panel glyph.
- Follow Cinnamon's system 12 / 24-hour clock preference for menu timestamps.
- Add parser, formatting, JSON, SVG, shell and CI checks.
