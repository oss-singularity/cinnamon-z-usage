# HANDOFF — Z Usage Monitor (oss-oo/z-usage-poc)

> **Repo-Migration 16.09. (nachts):** `oss-singularity/cinnamon-z-usage`
> ist jetzt der ECHTE GitHub-Fork von `cinnamon-chatgpt-usage`
> (`isFork: true`, Fork-Point = upstream main/1.0.6, Hash ae51b1e —
> identisch zum alten main). Der POC-Branch oss-oo/z-usage-poc (94efbf6)
> wurde verifiziert hinübergeschoben; das alte Nicht-Fork-Repo lebt
> weiter als `cinnamon-z-usage-old`(löschte Claudiu manuell; der
> `delete_repo`-Scope fehlt der headless gh-Auth). Draft-PR #1 wurde im
> neuen Repo neu erstellt. Offen manuell: Repo-Description/Topics und
> Social-Preview-Upload im GitHub-UI (wandern nicht mit; der Blockquote-Rahmen wurde lint-sauber nachgezogen).
>
> **Für die Schwester-Session:** Diese Datei ist der vollständige Kontext.
> Lies sie VOR allen Änderungen. Sie wird bei jedem Arbeitsstand aktualisiert.

---

## 1. Projekt-Überblick

Cinnamon-Applet `z-usage@oss-singularity`: zeigt Z.ai GLM Coding Plan Quotas
(5h/7d Ringe, Countdowns) + ZCode Start Plan / Global Build Token-Buckets im
Panel und Popup. Fork von `cinnamon-chatgpt-usage` 1.0.6 mit geteilter
Git-History (`upstream`-Remote) für Backports.

- **Repo:** `github.com/oss-singularity/cinnamon-z-usage`
- **Branch:** `oss-oo/z-usage-poc`(HEAD: siehe`git log --oneline -3`)
- **Live-Deployment:** `~/.local/share/cinnamon/applets/z-usage@oss-singularity`
  (Install: `./install.sh`, Reload: `ReloadXlet "z-usage@oss-singularity" APPLET`)
- **Panel-Verankerung:** `panel3:right:13:z-usage@oss-singularity:127`(unter
  chatgpt-usage auf Pos. 12, cornerbar auf 14) — vertikales Panel rechts.
- **Umgebung:** User hat ein **Top-Panel** (oben, ~30px) + das rechte Panel.
  Monitor 1920×1080, Text-Scale 1.0.

## 2. Aktueller Stand (was funktioniert — verifiziert)

- Multi-Plan: Coding Plan (5h/7d) + ZCode Start Plan + Global Build Buckets
  (Kollapsible Sections, Default expanded, Schalter im Settings).
- API-key-LESS: Setting →`ZAI_API_KEY`→`~/.config/cinnamon-z-usage/api-key`
  → ZCode-Cache (`~/.zcode/v2/config.json`, provider `builtin:z-usage`…
  genauer: `builtin:zai-coding-plan` options.apiKey). Der Balance-Endpoint
  (`zcode.z.ai/api/v1/zcode-plan/billing/balance`) nutzt `Bearer
<builtin:zai-start-plan apiKey>`+ ZCode-Client-Header (siehe
  `z_usage.py: zcode_source_headers()`).
- Sticky Chrome: Header (Titel + Updated + 5h/7d Ringe) und Action-Footer
  sind außerhalb des Scroll-Views gepinnt; Content scrollt dazwischen.
- Section-Disclosure-Pfeile: komplett entfernt (User-Entscheidung — der
  Auf/Zu-Zustand zeigt sich über die Zeilen).
- `make check`grün (44 Tests), Audit`EXPECTED=22 VALID=22`, Cinnamon-PID
  stabil über alle Reloads.

## 3. GELÖSTE BUGS (2026-09-16, Finale-Runde — beide isoliert bewiesen)

### Bug A — Blaue Header-Ringe wackeln beim Schließen nach links — GEFIXT

**Gemessener Mechanismus (isoliert, instrumentierter Close):** Die alte
`_normalizeRightPanelPopupCloseWidth`(Style-Reset,`set_width(-1)`-Dip,
`locked-1`-Trim) erzwang ein Close-Re-Layout: Actor 419→418, Header-/Box-
Allocation 419→418, Teleport +1px (Cinnamons `close()` repositioniert via
`_calculatePosition()` mit der NEUEN Breite). Zu diesem Zeitpunkt ist
`isOpen` bereits false → der Ring-Sync (`_syncContentRightEdges`, hängt an
`notify::allocation` des Footers) lief nicht mehr → die Ringe behielten ihre
Translation, während sich das Layout unter ihnen verschob.

**Fix:** Close ist jetzt breitenneutral — der Actor bleibt auf der Locked-
Width (419), kein Style-Reset, kein Natural-Dip, kein Trim (`POPUP_RIGHT_
PANEL_CLOSE_WIDTH_TRIM`entfernt); dazu ein letzter Ring-Sync in`close()`,
solange `isOpen`noch true ist. Beweis (Open → Toggle → Close → Re-Open →
Close): konstant`aX=1461, aW=419, hA=419`; beim Close-Slide bewegen sich
Popup/Ringe/Grid gemeinsam +11px (null Relativ-Drift); Re-Open exakt auf
`1461/63/419`.

### Bug B — Oberes Panel schneidet den Popup-Header ab — GEFIXT

**Wurzel (isoliert verifiziert):** `panelPosition`ist ein`PanelLoc`
(`top=0, bottom=1, left=2, right=3`— /usr/share/cinnamon/js/ui/panel.js).
Der alte Reserve-Check fragte`panelPosition !== 1`— also BOTTOM-Panels —
ab; das Top-Panel (0) floss nie ein. Popup 1058px, bottom-clamped bei y=22,
Top-Panel 0..40 → 18px Header verdeckt (Live-Messung: y1=22, Panel ~30).

**Fix:**`_clampPopupHeight` liest jetzt die echten Kanten sichtbarer Panels
des Monitors (`getPanelsInMonitor`+`get_transformed_position/size`;
`panelPosition === 0`→ topReserve = Unterkante − monitor.y + 16;`=== 1`→
bottomReserve). Isoliert: Popup`aY=63`(Top-Panel-Unterkante 40 + 16px
Reserve), Header vollständig sichtbar.

## 3b. RUNDE 2 (2026-09-16, Final-Check-Feedback — isoliert bewiesen)

### Scroll-Drift — Ringe springen bei wildem Scrollen unters Panel — GEFIXT

**Mechanismus:**`_syncActionColumnCentering` hing direkt an
`notify::allocation`des Footers und lief damit MITTEN im Relayout — die
gelesenen transformed-Positionen sind dann ein Mix aus alten/neuen
Allocations; ein solcher bogus-Delta wurde in die Ring-Translation
eingelatcht (und blieb, wenn danach keine Allocation mehr folgte).

**Fix:** Syncs laufen jetzt queued per`Mainloop.idle_add`
(`_queueActionEdgeSync` — eine Ausführung pro Frame, erst auf der
konsolidierten Layout-Basis; Sturm-Allocations koaleszieren). Dazu
`isOpen`-Guard im Centering (kein Re-Centering mehr im Close-Pfad) und
Delta-Klemmen in `_syncContentRightEdges` (Ring-Deltas > POPUP_WIDTH und
Chart-Breiten > 1.5×POPUP_WIDTH werden als Stale-Reads ignoriert).

**Beweis (isoliert, Realistik-Demo mit History-Charts + offenem Akkordeon):**
40 harte Scroll-Sprünge + Section-Toggles im Sturm → Ringe/Grid/Actor
konstant (`rX=1736..1848, gR=1847, aX=1461`); Close starr +10px gemeinsam;
Re-Open exakt.

### Weiße Submenu-Pfeile (Recent consumption) — ENTFERNT

Wie bei den Section-Arrows (bdd5c10): Das native Disclosure-Icon blieb beim
Zuklappen als Blitz stehen und kämpfte gegen das Grid. Das `_triangleBin`
wird versteckt (`hide()` — nicht destroy: Cinnamons SubMenu-Animation
referenziert das Icon weiter); das Sync-Loop für Pfeile ist weg.

### 3–5px-Scrollbalken im Default-View — GEFIXT

Der Frame-Chrome frass 8px des Viewport-Budgets (`maxMenu - header - footer

- 8`); Content, der nur 3–5px über dem Viewport lag, bekam deshalb einen
Scrollbalken. Jetzt liegt die Reserve bei 2px und der Viewport kann bis auf 2px an das Budget
heran; die 16px-Luft unter dem Top-Panel bleiben erhalten (Frame bleibt
≤ maxMenu). Messung:`viewport == contentNat`→`upper - page_size == 0`
  (kein Scrollbalken), Overflow-Fälle klappen weiter.

**Nachschub (live befunden):** Der Frame-Lock friert den Viewport pro Open
ein; Content, der NACH dem Lock ein paar px wächst (Countdown-Ticks,
Refresh-Labels), erzeugte trotzdem einen Scrollbalken — live exakt
`scrollOver=4`. Dafür gibt es jetzt `POPUP_VIEWPORT_PAD = 8`:
`viewport = min(contentNat + 8, budget - 2)`. Live nach Deploy:
`viewport=796, scrollOver=0`bei`aY=112`.

### Rest-Squeeze (~3px) beim Close — GEFIXT (Positions-Freeze)

Claudius Final-Check: beim Schließen rückt der gesamte Bereich inkl. Ringe
~3px nach links. Ursache: Cinnamons `close()` setzt die Position VOR dem
Slide neu (`set_position(_calculatePosition())`) — das Ergebnis hängt von
Preferred-Size und Theme-Margins ab und kann abweichen vom Open-Platz
(isoliert mit Default-Theme nicht reproduzierbar, live Theme-abhängig).
Fix: `_normalizeRightPanelPopupCloseWidth` friert die Position ein
(`menu._calculatePosition`wird für die Close-Dauer auf die aktuelle
[x, y] gepatcht; Restore im`menu-animated-closed`-Handler und sicherheitshalber
in `open()`). Der Slide-Ease läuft unverändert von der eingefrorenen Stelle.
Isoliert: Close jetzt exakt +12px starrer Slide, Re-Open exakt auf die
Open-Position.

### Runde 4 (2026-09-16, 60fps-Video-Analyse von IMG_8831.MOV + Feedback)

- **Grüne Ringe stabil, Graphen zogen noch nach links:** Ursache war der
  Close-Einstiegs-Sync selbst (`_syncContentRightEdges()`in close()) —
  live trug ein versteckter Countdown-Widget-Träger eine -94px-Alt-Translation
  (Live-Beweis: Snapshot A`c0Tx=-94`→ B`+8`direkt nach close()). Der Sync
  ist aus close() entfernt: **der Close berührt jetzt gar nichts mehr**,
  der nächste Open re-synced. Isoliert: Chart-Breite konstant 402, alles
  bewegt sich nur noch gemeinsam +9..12px mit dem Slide.
- **Credits-Zeile:**`Credits: ... · Consumed: ...`endet jetzt bündig auf
  der Button-Grid-Kante —`_creditsAlignRows`(row + tail-Label) wird im
  Idle-Sync wie die Ringe ausgerichtet. Isoliert:`credR == gR == 1847`.
- **Scrollen über aufgeklappten Akkordeon-Bereichen:** Das Leaf-StScrollView
  schluckt Wheel-Events (St-eigener Handler returnt true), auch wenn sein
  eigenes Adjustment inert ist. Fix: `_forwardLeafScroll`connected auf dem
  Leaf-Actor und setzt das HAUPT-Adjustment (step 48px, SMOOTH-Deltas
  unterstützt), returnt EVENT_STOP.
- Video-Analyse-Notiz: Handy-Video (IMG_8831.MOV, 60fps) — der Fade macht
  präzise Einzel-Element-Messung ab Frame ~3 der 9 Fade-Frames unmöglich
  (Background blutet durch); Allocation-Snapshots im Live-System sind die
  schärfere Quelle.
- **Nachschub (live: Graph sprang hunderte px):** Die Credits-Ausrichtung
  (row-Translation +73) koppelte in`_fitCreditConsumptionRow.availableWidth()`
  — die misst mit transformed-Koordinaten und sah die eigene Zeilen-
  Translation als schmaleres Budget → Font-Fit-Laufaway → Re-Layout-Ketten
  zerrten an den Charts. Fix: availableWidth rechnet die eigene
  row.translation_x heraus (übersetzungs-blind) und chartLimit auf
  POPUP_WIDTH + 96 gestrafft.
- **Nachschub 2 (live: Oszillation blieb):** fit() und Edge-Sync kämpften
  weiter um die Credits-Zeile (fit reagiert auf JEDE Chart-Allocation,
  zerrt via Re-Layout-Ketten an den Graphen). Fix: `_fitCreditConsumptionRow`
  liefert jetzt `{ fit, setArmed }`; der Fit ist nur bis zur Konvergenz
  (Credits-Delta ≤ 3px im Sync) bewaffnet, danach besitzt allein der Sync
  die Platzierung; Re-Arm bei jedem fresh open. Isoliert: credR==gR==1847
  konstant über open/settle/wheel/close/reopen, chW konstant 402.
- **Nachschub 3 (live, Screen-Recording 04.35.52 + Live-Poll):** Der große
  Graph-Sprung passiert bei DATEN-REFRESH mitten im offenen Popup:
  `_rebuildMenu` ersetzt alle Charts (min_width_set=false → Naturbreite!),
  und der eine queued Sync rennte der ersten Allocation der neuen Actors
  voraus und skipte (width > chartLimit) — danach lief nie wieder etwas
  (Live-Poll: chW 402 → 0, credTx 59 → 0 innerhalb von 0.4s). Fix: jede
  Chart-Allocation re-queued den Sync (`chart.connect("notify::allocation")`)
  - deferred Re-Queues (120ms/400ms) am Ende von `_rebuildMenu`. Isoliert:
    Rebuild bei offenem Popup konvergiert in <300ms zurück auf chW=402/
    credR==gR.
- **Nachschub 4 (live, Screen-Recording 04.41.32):** Das Delta-basierte
  Disarm war falsch — der Fit konnte NACH dem Disarm die Fontgröße noch
  ändern (Credits Ende wanderte), und der Sync übersetzte gegen die alte
  Geometrie. Neu: der Fit trackt seine Konvergenz selbst (zwei Pässe
  gleicher Fontgröße → `isConverged()`), der Sync übersetzt die
  Credits-Zeile erst NACH Konvergenz, Re-Arm pro fresh open.
- **Nachschub 7 (Close mit offenem Leaf — 12.40.44/20.27.56-Befund):** Beim
  Close schließen sich offene Akkordeon-Blaätter → `_syncPopupRightInsets`
  flippte die Row-Paddings (Expanded-Extra weg) → Re-Layout → die
  rechtsbündigen grünen Ringe sprangen ~+17px nach rechts, während der
  Pure-Fade schon lief (Sync isOpen-gated). Fix: Insets-Freeze während des
  Closes (`_syncPopupRightInsets`returnt bei`!isOpen && animating`).
  Isoliert mit offenem Leaf: tx/edge/chart-width frozen durch mid-close
  und LATE.
- **Grüne Ringe Wandern (20.27.56 + Isolier-Beweis):** Countdown-Label-
  Breite ändert sich pro Tick → Row re-layoutet → Ring-Layout-Position
  driftet, ohne dass der Sync läuft (kein Action-Frame-Alloc). Fix:
  Countdown-Actor + Header-Rings connecten `notify::allocation` → queued
  Sync (driftet nicht mehr; sichtbare Kante 386 konstant über Ticks).
  Zusätzlich Ring-Translation-Carry-over über Rebuilds
  (`_carriedRingTranslations`/`_carriedHeaderTx`).
- **Nachschub 8 (Version 1.0.0 + Buttons + Credits-Revert + Fokus):** Das Applet ist ein NEUES Applet — die erste Veröffentlichung ist **1.0.0** (metadata.json + CHANGELOG angepasst). Footer-Umbau: [Z.ai Chat] [ZCode] / [Refresh now] [Usage] / [Z.ai] [Docs]; der API-Keys-Button wanderte in den Konfigurationsdialog (settings-schema api-keys-page-button, type button → Applet-Callback on_open_api_keys_page_pressed → ZAI_API_KEYS_URL). ZCode-Icon: icons/zcode.svg (Custom-Artwork, `</>`auf dunklem Rounded-Square, Grün-Gradient + blauer Edge). Credits-Fit-Revert: der Grid-Kanten-Target maß mid-settle stale Werte (Zeile endete vor den Buttons) — der Fit misst wieder bis zur Plot-rechten Kante (Sync aligniert Plots AN die Grid-Kante). API-Key-Feld Fokus: Custom-Widget api_key_settings.py (ApiKeyEntryWidget extends JSONSettingsEntry) mit Gtk.GestureMultiPress (CAPTURE) am Top-Level-Window: Press außerhalb des Entries → window.set_focus(None) — der Mechanismus aus dem Upstream-Fix bbce0d5.

- **Crash-Untersuchung (16.09. ~04:29 + ~04:54):** Zwei Cinnamon-SIGSEGVs
  während Rapid-Toggle-Tests, Stacks jeweils in libmozjs (GC-Sweeping);
  parallel starb nemo in g_signal_emit — nemo führt Applet-Code nie aus,
  daher System-Event-Wahrscheinlichkeit; applet-seitig wurde der
  JSAPI-Sturm aus per-chart allocation-watchern als plausibelster Trigger
  entfernt (Härtung siehe oben). Coredumps liegen unter
  /var/lib/apport/coredump bzw. via coredumpctl (PIDs 2323/2218084).
  Rapid-Toggle-Restrisiko weiter beobachten.
- **Rapid-Toggle-Stresstest (isoliert, 16.09.):** 400×`on_applet_clicked`
  (rebuild+toggle, volle Animationen) auf dem gehärteten Stand — Cinnamon
  überlebt ohne Crash, Popup-State konsistent. Timeline der Live-Crashes:
  der 10:13-Crash von Claudiu fiel in das Fenster, in dem der
  per-chart allocation-watcher (1b12e6f) live war; beide bekannten
  Trigger (Watcher-Sturm, Close-Einstiegs-Sync) sind entfernt. Live-
  Bestätigung durch Claudius Rapid-Toggle-Test steht aus.
- **Close-Animation final (16.35.40-Analyse):** Die 12px-Rest-Slide lies
  die kantennahen Ringe noch unter dem Panel verschwinden. Final: während
  des Closes wird `menu.actor.ease`gewrappt und x/y aus den
  Ease-Parametern gestrichen → **reiner Opacity-Fade an der frozen
  Position** (Restore im animated-closed + Sicherheit in open()). Der
  Margin-Trick (ml=12) wurde revertiert — der verschob den Inhalt +12px.
  Isoliert: aX/gR/hX frozen durch den gesamten Close, Reopen exakt.
- **Hover-Flicker-Fix:** fit() blieb den ganzen Open über armed und
  feuerte auf jede Allocation (auch Hover-Tooltips) — jeder Pass
  re-applizierte erst BASE-Font dann shrunk er → sichtbares Text-Pulsieren
  beim ersten Hovern (mehrere Sekunden, seit den Deferred-Pässen länger).
  Fix:`converged` gated den fit-Einstieg (`if (!armed || converged ||
fitting) return`).
- **Grüne Ringe „verschwinden früher beim Close" (20.27.56):** Kein
  Positions-Bug — `_quotaRingOpacity`rendert S/G-Ringe ohne Quota-Usage
  mit opacity 128 (Halbtransparent als „nichts verbraucht"-Signal). Im
  Fade multipliziert sich das → visuelles Null bei ~50% des Fades.
  Fix: Close boostet alle Countdown-Areas auf opacity 255 (Farewell-Fade
  in voller Deckkraft); der nächste Rebuild stellt die Dim-Stufen wieder
  her.
- **Scroll-Dead-Zone WURZEL gefunden (mock-event-Test):**
  `_forwardContentWheel`las`this._scroll`— auf dem APPLET undefined
  (das Scrollview gehört zum Menü:`this.menu._scroll`)! Der Guard
  returnte immer PROPAGATE → das Forwarding war seit Einführung tot.
  Fix: `this.menu._scroll`. Verifiziert: Mock-DOWN-Event → Haupt-
  Adjustment +48/Schritt, three calls = +144, EVENT_STOP.
- **Gruen-Fade-Frust (20.27.56/12.40.44 + Isolier-Messung):** Die Countdown-Arcs zeichnen Glow (alpha 58) und Track (alpha 42) — beim Menu-Fade multipliziert das, der Glow kippt bei ~23% des Fades auf null (gruenue Ringe verschwinden frueher). Fix: waehrend des Closes zeichnen die Arcs mit geboosteter Alpha (Glow 174, Track 126 via `this._closing` im Paint). Isoliert: Gruen haelt ~60% des Fades.

## 3c. RUNDE 3 (2026-09-17, Refresh-Jump + Ring-Vanish — fd67671, isoliert bewiesen)

### Refresh-Satz + Verschwindende grüne Ringe — GEFIXT (drei Schichten)

**Claudius Befund:** Refresh-Button → Graphen+grüne Ringe machen einen Satz
zur Seite und zurück; manchmal (1. bis n-ter Refresh) verschwinden die
grünen Ringe komplett und kehren nie zurück.

**Wurzeln:** (1) Stale Sync-Pässe während der Rebuild-Allokations-Wellen
laschen bogus Anchor-/Ring-Deltas → der sichtbare Satz. (2) Wiederholte
bogus Writes akkumulieren über den ±POPUP_WIDTH-Guard — dessen Skip fror
die Ringe dann dauerhaft außerhalb ein; der Rebuild-Carry schleifte das
Gift weiter. (3) `z_usage.py` ließ bei Balance-Fetch-Fehlern (Rate-Limit
bei Rapid-Clicks!) die ZCode-Plan-Limits komplett weg → datenseitiges
Verschwinden ganzer Sektionen.

**Fixes (applet.js):**

- Menü-relativer Anker-Baseline-Guard (`_stableRelativeAnchor`, pro Open
  resettet): Die Grid-Kante fährt eine konstante Distanz zur Popup-Kante.
  Ein Pass, der eine andere Distanz liest, ist Mid-Relayout und wird
  KOMPLETT verworfen — inklusive Centering, das jetzt VOR dem Write
  gegen die Baseline validiert wird (kein Zero-then-Write-Flicker mehr).
- Two-Pass-Voting für Ring-Korrekturen > 64px (`POPUP_RING_DELTA_TRUST`):
  ehrliche Layout-Änderungen wiederholen ihr Delta im nächsten Pass,
  Garbage nicht. Tötet die Ein-Poll-Ganz-Block-Blitze (isoliert ±392px).
- Guard-Trip (|delta| > POPUP_WIDTH) snappt den Ring auf sein Design-Offset
  (`_usageHomeTx`: Header −13/−7, Countdown 0) statt ewig zu skippen —
  Self-Healing; vergiftete Translationen (> POPUP_WIDTH) wandern nicht
  mehr in den Rebuild-Carry.
- Zusage-Fail-Safe: `Math.abs(centering) > menuWidth` → Pass verwerfen.

**Fixes (z_usage.py):** Plan-Balance-Cache (`~/.local/state/cinnamon-z-usage/
plan-balances-cache.json`, 10min Grace, nur zukünftige Resets) — ein
fehlgeschlagener Balance-Fetch replayed die letzten bekannten Buckets,
statt die Sektionen zu leeren.

**Beweis (isoliertes Refresh-Protokoll, 8 echte Zyklen @150ms-Polling):**
ALT: Ganz-Block-Shift −65px bei Rebuild, nie korrigiert + Ring-Count-Drop.
NEU: Anker-Baseline konstant 33 (Grid-Kante 1847 = historischer Wert),
Ringe exakt drauf (bemalte Kante 1847), Null Blitze, Header konstant.
`make check` grün (49 Python-Tests + alle cjs-Suiten inkl. Refresh-Guard-,
Voting- und Carry-Tests). Live: Audit 24/24, PID unverändert.

**Werkzeug-Lektionen (Eval/Harness):** Im Cinnamon-Eval-Scope ist
`Mainloop` UNDEFINED — `imports.mainloop.timeout_add(ms, cb)` mit
true/false-Rückgaben nutzen; `GLib.timeout_add(0, …)` aus Eval friert die
Xvfb-Shell ein. Die 120ms-Spinner-Textanimation stanniert LLVMpipe/Xvfb
(Shell-Live-Lock; auf echter GPU unkritisch) — für Headless-Protokolle
auf der Instanz stubben. Wiederverwendbares Mini-Harness:
`/tmp/z-refresh-mini.sh` + `z-mini-inner.sh` + `z-mini-watcher.js`
(privater HOME, DCONF_PROFILE=Datei nötig, Applet nach
`$XDG_DATA_HOME/cinnamon/applets` stagen — XDG übersteuert ~/.local —,
ibus-daemon vor cinnamon starten, sonst inputMethod-TypeError).

## 3d. RUNDE 4 (2026-09-17 Abend, Close-Ringe wandern „voreilig" — fcd5709)

### Click-Close: grüne Ringe +40..62px zur Panel-Kante während des Fades — GEFIXT

**Claudius 60fps-Video (vid-2026-09-17_22.10.14.mp4, 65 Frames ausgewertet):**
Beim Schließen springt der grüne Countdown-Ring im ERSTEN Fade-Frame ~40px
nach rechts (bemalte Kante 1847 → ~1909, flush an die Popup-Außenkante) und
bleibt da; Titel/Text/blaue Ringe/Footer-Buttons bleiben +0px (Template-
Tracking über alle Frames).

**Wurzel (isoliert per Click-Pfad-Instrumentierung reproduziert):**
`on_applet_clicked` rebuilt VOR dem Toggle — auch beim SCHLIESSEN. Die
frischen Rows nehmen ihre erste Allokation mit aufgeblähter Natural-Breite
(Ring-Reihen 23..458 statt geclampter 23..396 — die bekannte Min-Width-
Inflation), und der Close gated ALLE Syncs, die das korrigieren würden →
die Overflow-Allokation ritt den ganzen Farewell-Fade mit. Die früheren
Repro-Versuche mit direktem `menu.close(true)` mussten leer laufen — der
Rebuild-davor ist der Punkt.

**Fixes (fcd5709):**

- Ein Klick, der schließt, tut NUR noch togglen — kein Rebuild. Das Fade
  zeigt die settle-outgerichteten Actors; der nächste Open rebuilt eh.
  (`_scheduleMenuRebuild` überspringt ebenfalls, wenn der Rebuild mitten
  in einen Fade landen würde — Refresh-Button + schnelles Schließen.)
- Härtung vom gleichen Fund: Anker-Toleranz 48→24px (ein Müll-Anker-Read
  33px zur Popup-Kante rutschte durch die alte Toleranz), Ring-Delta-
  Trust 64→32px, BEFORE_REDRAW-Alignment gated jetzt auf `_closing`.

**Beweis (isolierter Click-Close, 11 Snapshots):** ALT alloc 304..356 →
366..418 bei t8, starr verschoben durch den Fade; NEU konstant
304..356 / px 1796 / tx 8 — reiner Opacity-Fade 255→45, null Bewegung.
`make check` grün inkl. Click-Close-Regressions-Test + 33px-Anker-Reject.

## 3e. RUNDE 5 (2026-09-17 spät, Track wird beim Close weiß — 47556c5)

### Farewell-Boost entfernt: Close-Fade = reiner Opacity-Multiplikator

**Claudius zweites Video (22.45.25):** Der ungefärbte Ring-Track (bei grünen
UND blauen Ringen) hellt sich in den ersten Fade-Frames deutlich auf
(„weiß fast") — im Upstream bleibt die Farbe unverändert.

**Wurzel:** Unser eigener Farewell-Boost (660a797/c1dfaf9): Bei `_closing`
wurden Track- (42→126) und Glow-Alphas (58→174) verdreifacht und dimmte
S/G-Flächen auf 255 geflippt. Der Track ist Menü-Vordergrundfarbe — ×3
macht ihn fast weiß. Messung aus Claudius Video: Track-Mean 67.0 (open,
konstant) → 103+ bei Close-Start, Hintergrund noch voll abgedeckt.

**Fix (47556c5):** Beide Close-Zeit-Verfärbungen entfernt — konstante
Track-/Glow-Alphas in `_paintCircularProgress`, kein Area-Opacity-Flip im
Close-Pfad. Das Fade ist jetzt ein reiner Opacity-Multiplikator auf die
exakten Offen-Farben (Upstream-Verhalten); dimmte S/G-Ringe behalten ihre
128 durch den Fade. Trade-off bewusst gesetzt: Die transluzenten Anteile
erreichen visuell Null wieder etwas früher im Fade — Claudius explizite
Wahl gegen den Boost.

**Beweis (isolierte 60fps-Click-Close-Aufnahmen, A/B, gleiche Geometrie):**
ALT Track 57.7 → 69.2 → 81.7 über die ersten Fade-Frames (grüne Arc-Pixel
613→855 = heller); NEU 57.7 → 54.5 → 52.6, Arc monoton ab — nur die Menu-
Opacity ändert sich. `make check` grün.

## 3f. RUNDE 6 (2026-09-17 Nacht, Update-Transient + Credits-Ende — 043af8c)

### „Updated"-Moment: Ringe/Graphen vergrößern sich nach außen, Credits-Ende bleibt zu weit rechts — GEFIXT

**Claudius drittes Video (22.59.28):** Beim Refresh-Abschluss stoßen Ringe und
Graphen kurz nach außen und zurück; der „Consumed:"-Ende sitzt danach
dauerhaft rechts neben der Button-Grid-Kante. Upstream-Referenz: Während
eines Updates ist das gesamte UI absolut stabil.

**Wurzel (isoliert vermessen):** Dieselbe wie der Close-Shift — der
Rebuild nach der Fetch-Completion erzeugt frische Rows, deren ERSTE
Allokation mit aufgeblähter Natural-Breite läuft (23..458 statt
23..396). Bei offem Popup korrigieren die Syncs das nach 1–2 Frames =
der sichtbare Bump (Tall-Staging: Color-Extent 1865 gegen Settle-Anker
1845), und der Credits-Font-Fit konvergiert auf die Transient-Geometrie
(zu breite Plots → zu großer Font → Ende dauerhaft zu weit rechts, Fit
disarmed). Upstream rebuilt identisch (Flow gelesen) — die Stabilität
kommt von der Geometrie, nicht vom Flow.

**Fix (043af8c):** `_captureCarriedRowWidths` + `_applyCarriedRowWidths`:
Der Rebuild erfasst die gesetzten Breiten der alten Inset-Rows und pinnt
jede frische Row auf die Vorgänger-Breite (min/natural/width via
`_forceActorWidth`); nach der ersten Allokation der Row wird entpinnt
(set_width(-1), Flags frei), damit spätere Reflows unbehindert bleiben.
Erste Allokation = korrekte Geometrie → Ringe/Charts malen ab Frame 1
ausgerichtet, der Fit konvergiert auf Settled-Maße.

**Beweis (isolierte 60fps-Refresh-Aufnahmen, Tall-Staging = Bump-Bedingung):**
OLD Color-Extent 1865 > 1845 Anker beim Rebuild; NEW nie darüber
(1825 mid-rebuild, 1845 settled). Credits-Ende persistent konstant.
`make check` grün inkl. Row-Carry-Tests (Capture-Filter, Pin, Unpin-once).

## 3g. RUNDE 7 (2026-09-18 Nacht, Credits-Zeile springt beim Update — b08877b)

### „Consumed:" startet zu kurz / wächst nach dem Update — Ende jetzt IMMER flush

**Claudius viertes Video (23.34.06):** Der rote Consumed-Text startet zu
kurz, ist nach dem Update zu lang; das Ende soll IMMER bündig mit dem
Button-Grid-Ende sein. Messung: Ende ruhte 23px links der Kante (der Fit
kann nur schrumpfen, nie dehnen) und sprang beim Update (Base-Font-Neu-
start + Konvergenz auf Transient-Geometrie; Doppeltext-Frame = Font-/
Positions-Sprung mid-repaint).

**Wurzelkette (instrumentierte Rebuilds):** (1) Der Rebuild-while-open
lief NIE `_lockPopupLayoutWidth` — frische Items allozierten ungeclampt,
die Rows wuchsen auf 422px und BLIEBEN dort (nichts re-alloziert sie).
(2) Der Row-Breiten-Pin aus 043af8c entpinnt nach der ersten Allokation →
die Natural-Min-Inflation gewann zurück (373 → 422) → (3) der Credits-
Fit konvergierte auf die breite Row: Font 73.1 → 86.2 = „zu lang",
Start rückt links = „zu kurz".

**Fix (b08877b, vier Hebel):**

- `_lockPopupLayoutWidth` läuft jetzt IM Rebuild (vor der ersten
  Allokation der frischen Items) — Rows allozieren 373 und bleiben dort.
- Die Limit-Row-Labels sind ellipsized (EllipsizeMode.END) — deren
  Min-Breite kann das geclampte Item nicht mehr überlaufen.
- Der Credits-Font-Fit startet bei der konvergierten Größe des
  Vorgänger-Builds (`_lastCreditFontSize`, Ratio linear relativ, nach
  oben bis Base begrenzt) — kein Font-Sprung mehr beim Update.
- Der Edge-Sync right-anchored die Suffix-Gruppe (Separator+Consumed+
  Werte) rigid an die Grid-Kante; die Suffix-Translation wird über
  Rebuilds carryet — selbst der erste Paint nach einem Update ist flush.

**Beweis (instrumentierte Same-Data-Rebuilds):** ALT rowW 373/422/422 +
Font 73.1→86.2; NEU rowW konstant 373/373/373, Font 73.1→70.7 (einmalige
Anpassung, Anker kompensiert tx 39→45, Ende flush), danach stabil. Ende
1846 = Anker 1847 ±1 vor/nach dem Rebuild. `make check` grün inkl.
Suffix-Anchor-Tests (flush, rigid, idempotent).

## 3h. RUNDE 8 (2026-09-18 Nacht, Rest-Springen + Credits-Look — 85e54d6/2bf7c57)

### Zwei Restbefunde aus Claudius Doppel-Video + Referenz-Screenshots

**1) „Springt manchmal immer noch, 1. Versuch oft sauber":** Das Frame-
Diffing beider Videos zeigte KEINEN Positions-Sprung — was springt, ist
der **Content-Blink**: `removeAll()` leert das Popup für ~5 Frames, die
frischen Rows malen erst danach. Und der „1. Versuch sauber" passt exakt:
direkt nach dem Öffnen sind die Daten identisch zum angezeigten Stand —
der Rebuild ist dann rein waste. Fix: **Signature-Gate** —
`_menuSignature` (limits/credits/consumption/activity) wird gebaut und
mit `_builtMenuSignature` verglichen; `_scheduleMenuRebuild` skippt bei
Gleichheit. Beweis (isolierter Doppel-Refresh): Refresh 1 (Demo→Real)
rebuilt 1×, Refresh 2 (identisch) → Zähler bleibt 1, Popup bleibt offen.

**2) Credits-Zeile upstream-look:** Der Right-Anchor aus Runde 7 erzeugte
einen Gap nach dem Balance-Wert und der Suffix-Fit bottomete am Min-Font
(54%) aus — gequetscht statt natürlich. Per Referenz-Screenshot entfernt:
kein Right-Anchor, kein Suffix-TX-Carry — natürlicher Fluss. Stattdessen
skaliert der Fit jetzt die GANZE Zeile uniform (Base-Styles werden beim
Fit erfasst, nur der font-size-Anteil wird appended; die Ratio rechnet
über die Gesamt-Breite, Base-Cap). Live verifiziert: uniforme Schrift,
Separator sichtbar, kein Gap, Ende natürlich wie upstream.

## 4. Debug-Werkzeuge (erprobt)

### Isolierte Session (IMMER für Animation-/Layout-Analyse nutzen)

```bash
bash /home/claudiu/.zcode/skills/cinnamon-isolated-capture/scripts/run-isolated.sh \
  --stage-applet ~/.local/share/cinnamon/applets/z-usage@oss-singularity \
  --output /tmp/out.png --geometry 1920x1080x24 --settle-ms 45000 \
  -- bash <driver>.sh
```

- Beispiel-Treiber: `/tmp/z-arrow-driver.sh`(Stage + Arrow-Diagnose),
  `/tmp/z-final-verify-driver.sh`(Close-Instrumentierung, 60fps),
  `/tmp/z-final-scenario-driver.sh`(Toggle → Close → Re-Open-Szenario).
  Achtung:`--stage-applet`leitet den Zielordner aus dem Verzeichnis-
  Basename ab — Worktree-Code erst nach`/tmp/stage/z-usage@oss-singularity/`
  kopieren und von dort stagen.
- Isolier-Setup für beide Bugs: `panels-enabled "['1:0:top', '3:0:right']"`
  (Top-Panel: `panelPosition=0`, Höhe 40) + Demo-Snapshot mit ~14
  ZCode-Plan-Sections, damit der Content den Height-Clamp auslöst
  (`/tmp/z-final-demo.json`-Muster).
- 60fps-Recording im isolierten X11: `ffmpeg -y -f x11grab -framerate 60
-video_size 1920x1080 -i $DISPLAY -c:v libx264rgb -preset ultrafast -crf 0
out.mp4`(ffmpeg ist installiert).

### Eval-Messungen (gdbus an org.Cinnamon)

Timing-fest: Öffnen + Cinnamon-seitiger`Mainloop.timeout_add` + Ergebnis in
`global.zD`, dann zweiter Eval liest `global.zD`. WICHTIG: Eval-Callbacks
müssen einen String zurückgeben (`return "";`), sonst `(false,'{}')`— das
sieht aus wie ein Fehler, ist aber nur ein leerer Return. KEIN`return`auf
Eval-Top-Level (SyntaxError →`(false,'{}')`); der letzte Statement-Wert ist
der Rückgabewert — ein abschließender `"";` schluckt das Ergebnis.
Referenz-Snippets:

```js
// Popup-Zustand
var a = Main.AppletManager.getRunningInstancesForUuid(
  "z-usage@oss-singularity",
)[0];
JSON.stringify({
  open: a.menu.isOpen,
  top: Math.round(a.menu.actor.allocation.y1),
  H: Math.round(a.menu.actor.get_height()),
  scrollH: Math.round(a.menu._scroll.get_height()),
  contentW: Math.round(a.menu._content.actor.get_width()),
});
// Section togglen
var s = a._limitSections[0];
if (s) s.heading.activate();
("");
```

### Bekannte Fehl-Leitplanken (nicht wieder einfallen!)

- `get_preferred_height(-1)`UNTERSCHÄTZT die Höhe (Textumbruch bei realer
  Breite) → immer bei`this._popupWidth()`messen.
- Content-Height-Pin: war die Ursache für „ScrollView scrollt nicht" (fester
  Pin → adjustment upper 0) → KEIN Content-Pin; der ScrollView arbeitet auf
  der natürlichen Höhe. -`menu.actor`Außenbreite behalten; nur scroll/content/footer auf
  `_menuInnerWidth(outer)`(= outer − 24) klemmen — Theme-Node meldet 0
  Padding, daher fester 24px-Wert.
- Eval-Callbacks: ohne String-Return seen as failure. -`menu.close()`ohne Argument =`animate undefined`= Instant-Hide — für
  Close-Analysen immer`menu.close(true)`.
- Allocation-Snapshots sind blind gegen Position-Eases (`actor.x`ändert
  nicht`allocation.x1`synchron) — Animationen per Opacity-Probe und/oder
  60fps-Pixelmessung prüfen.

## 5. Release-Gate (nach User-„lesseegooo")

1.`make check` grün + Audit 22/22 (`cinnamon-z-usage-live-sync`Skill). 2. Squash-Merge`oss-oo/z-usage-poc`→`main`(GitHub PR, Squash). 3.`python3 scripts/package.py export --output <leer> --validate`→
`install.zip`+`SHA256SUMS`. 4. Tag `v0.2.0`(annotiert) auf final main + GitHub Release mit Assets. 5. Danach (separat): Upstream-Session im chatgpt-Repo
(Backport-Freundlichkeit + upstream Release) — User-FYI vom 15.09.

Skills:`cinnamon-z-usage-live-sync`, `cinnamon-z-usage-release`,
`cinnamon-isolated-capture`(mit`verify-popup-layout-driver.sh` im
live-sync-Scripts-Ordner).
