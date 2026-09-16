# HANDOFF — Z Usage Monitor (oss-oo/z-usage-poc)

> **Für die Schwester-Session:** Diese Datei ist der vollständige Kontext.
> Lies sie VOR allen Änderungen. Sie wird bei jedem Arbeitsstand aktualisiert.

---

## 1. Projekt-Überblick

Cinnamon-Applet `z-usage@oss-singularity`: zeigt Z.ai GLM Coding Plan Quotas
(5h/7d Ringe, Countdowns) + ZCode Start Plan / Global Build Token-Buckets im
Panel und Popup. Fork von `cinnamon-chatgpt-usage` 1.0.6 mit geteilter
Git-History (`upstream`-Remote) für Backports.

- **Repo:** `github.com/oss-singularity/cinnamon-z-usage`
- **Branch:** `oss-oo/z-usage-poc` (HEAD: siehe `git log --oneline -3`)
- **Live-Deployment:** `~/.local/share/cinnamon/applets/z-usage@oss-singularity`
  (Install: `./install.sh`, Reload: `ReloadXlet "z-usage@oss-singularity" APPLET`)
- **Panel-Verankerung:** `panel3:right:13:z-usage@oss-singularity:127` (unter
  chatgpt-usage auf Pos. 12, cornerbar auf 14) — vertikales Panel rechts.
- **Umgebung:** User hat ein **Top-Panel** (oben, ~30px) + das rechte Panel.
  Monitor 1920×1080, Text-Scale 1.0.

## 2. Aktueller Stand (was funktioniert — verifiziert)

- Multi-Plan: Coding Plan (5h/7d) + ZCode Start Plan + Global Build Buckets
  (Kollapsible Sections, Default expanded, Schalter im Settings).
- API-key-LESS: Setting → `ZAI_API_KEY` → `~/.config/cinnamon-z-usage/api-key`
  → ZCode-Cache (`~/.zcode/v2/config.json`, provider `builtin:z-usage`…
  genauer: `builtin:zai-coding-plan` options.apiKey). Der Balance-Endpoint
  (`zcode.z.ai/api/v1/zcode-plan/billing/balance`) nutzt `Bearer
  <builtin:zai-start-plan apiKey>` + ZCode-Client-Header (siehe
  `z_usage.py: zcode_source_headers()`).
- Sticky Chrome: Header (Titel + Updated + 5h/7d Ringe) und Action-Footer
  sind außerhalb des Scroll-Views gepinnt; Content scrollt dazwischen.
- Section-Disclosure-Pfeile: komplett entfernt (User-Entscheidung — der
  Auf/Zu-Zustand zeigt sich über die Zeilen).
- `make check` grün (44 Tests), Audit `EXPECTED=22 VALID=22`, Cinnamon-PID
  stabil über alle Reloads.

## 3. GELÖSTE BUGS (2026-09-16, Finale-Runde — beide isoliert bewiesen)

### Bug A — Blaue Header-Ringe wackeln beim Schließen nach links — GEFIXT

**Gemessener Mechanismus (isoliert, instrumentierter Close):** Die alte
`_normalizeRightPanelPopupCloseWidth` (Style-Reset, `set_width(-1)`-Dip,
`locked-1`-Trim) erzwang ein Close-Re-Layout: Actor 419→418, Header-/Box-
Allocation 419→418, Teleport +1px (Cinnamons `close()` repositioniert via
`_calculatePosition()` mit der NEUEN Breite). Zu diesem Zeitpunkt ist
`isOpen` bereits false → der Ring-Sync (`_syncContentRightEdges`, hängt an
`notify::allocation` des Footers) lief nicht mehr → die Ringe behielten ihre
Translation, während sich das Layout unter ihnen verschob.

**Fix:** Close ist jetzt breitenneutral — der Actor bleibt auf der Locked-
Width (419), kein Style-Reset, kein Natural-Dip, kein Trim (`POPUP_RIGHT_
PANEL_CLOSE_WIDTH_TRIM` entfernt); dazu ein letzter Ring-Sync in `close()`,
solange `isOpen` noch true ist. Beweis (Open → Toggle → Close → Re-Open →
Close): konstant `aX=1461, aW=419, hA=419`; beim Close-Slide bewegen sich
Popup/Ringe/Grid gemeinsam +11px (null Relativ-Drift); Re-Open exakt auf
`1461/63/419`.

### Bug B — Oberes Panel schneidet den Popup-Header ab — GEFIXT

**Wurzel (isoliert verifiziert):** `panelPosition` ist ein `PanelLoc`
(`top=0, bottom=1, left=2, right=3` — /usr/share/cinnamon/js/ui/panel.js).
Der alte Reserve-Check fragte `panelPosition !== 1` — also BOTTOM-Panels —
ab; das Top-Panel (0) floss nie ein. Popup 1058px, bottom-clamped bei y=22,
Top-Panel 0..40 → 18px Header verdeckt (Live-Messung: y1=22, Panel ~30).

**Fix:** `_clampPopupHeight` liest jetzt die echten Kanten sichtbarer Panels
des Monitors (`getPanelsInMonitor` + `get_transformed_position/size`;
`panelPosition === 0` → topReserve = Unterkante − monitor.y + 16; `=== 1` →
bottomReserve). Isoliert: Popup `aY=63` (Top-Panel-Unterkante 40 + 16px
Reserve), Header vollständig sichtbar.

## 3b. RUNDE 2 (2026-09-16, Final-Check-Feedback — isoliert bewiesen)

### Scroll-Drift — Ringe springen bei wildem Scrollen unters Panel — GEFIXT

**Mechanismus:** `_syncActionColumnCentering` hing direkt an
`notify::allocation` des Footers und lief damit MITTEN im Relayout — die
gelesenen transformed-Positionen sind dann ein Mix aus alten/neuen
Allocations; ein solcher bogus-Delta wurde in die Ring-Translation
eingelatcht (und blieb, wenn danach keine Allocation mehr folgte).

**Fix:** Syncs laufen jetzt queued per `Mainloop.idle_add`
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
Scrollbalken. Jetzt `- 2` — der Viewport kann bis auf 2px an das Budget
heran; die 16px-Luft unter dem Top-Panel bleiben erhalten (Frame bleibt
≤ maxMenu). Messung: `viewport == contentNat` → `upper - page_size == 0`
(kein Scrollbalken), Overflow-Fälle klappen weiter.

**Nachschub (live befunden):** Der Frame-Lock friert den Viewport pro Open
ein; Content, der NACH dem Lock ein paar px wächst (Countdown-Ticks,
Refresh-Labels), erzeugte trotzdem einen Scrollbalken — live exakt
`scrollOver=4`. Dafür gibt es jetzt `POPUP_VIEWPORT_PAD = 8`:
`viewport = min(contentNat + 8, budget - 2)`. Live nach Deploy:
`viewport=796, scrollOver=0` bei `aY=112`.

### Rest-Squeeze (~3px) beim Close — GEFIXT (Positions-Freeze)

Claudius Final-Check: beim Schließen rückt der gesamte Bereich inkl. Ringe
~3px nach links. Ursache: Cinnamons `close()` setzt die Position VOR dem
Slide neu (`set_position(_calculatePosition())`) — das Ergebnis hängt von
Preferred-Size und Theme-Margins ab und kann abweichen vom Open-Platz
(isoliert mit Default-Theme nicht reproduzierbar, live Theme-abhängig).
Fix: `_normalizeRightPanelPopupCloseWidth` friert die Position ein
(`menu._calculatePosition` wird für die Close-Dauer auf die aktuelle
[x, y] gepatcht; Restore im `menu-animated-closed`-Handler und sicherheitshalber
in `open()`). Der Slide-Ease läuft unverändert von der eingefrorenen Stelle.
Isoliert: Close jetzt exakt +12px starrer Slide, Re-Open exakt auf die
Open-Position.

### Runde 4 (2026-09-16, 60fps-Video-Analyse von IMG_8831.MOV + Feedback)

- **Grüne Ringe stabil, Graphen zogen noch nach links:** Ursache war der
  Close-Einstiegs-Sync selbst (`_syncContentRightEdges()` in close()) —
  live trug ein versteckter Countdown-Widget-Träger eine -94px-Alt-Translation
  (Live-Beweis: Snapshot A `c0Tx=-94` → B `+8` direkt nach close()). Der Sync
  ist aus close() entfernt: **der Close berührt jetzt gar nichts mehr**,
  der nächste Open re-synced. Isoliert: Chart-Breite konstant 402, alles
  bewegt sich nur noch gemeinsam +9..12px mit dem Slide.
- **Credits-Zeile:** `Credits: ... · Consumed: ...` endet jetzt bündig auf
  der Button-Grid-Kante — `_creditsAlignRows` (row + tail-Label) wird im
  Idle-Sync wie die Ringe ausgerichtet. Isoliert: `credR == gR == 1847`.
- **Scrollen über aufgeklappten Akkordeon-Bereichen:** Das Leaf-StScrollView
  schluckt Wheel-Events (St-eigener Handler returnt true), auch wenn sein
  eigenes Adjustment inert ist. Fix: `_forwardLeafScroll` connected auf dem
  Leaf-Actor und setzt das HAUPT-Adjustment (step 48px, SMOOTH-Deltas
  unterstützt), returnt EVENT_STOP.
- Video-Analyse-Notiz: Handy-Video (IMG_8831.MOV, 60fps) — der Fade macht
  präzise Einzel-Element-Messung ab Frame ~3 der 9 Fade-Frames unmöglich
  (Background blutet durch); Allocation-Snapshots im Live-System sind die
  schärfere Quelle.
- **Nachschub (live: Graph sprang hunderte px):** Die Credits-Ausrichtung
  (row-Translation +73) koppelte in `_fitCreditConsumptionRow.availableWidth()`
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
  + deferred Re-Queues (120ms/400ms) am Ende von `_rebuildMenu`. Isoliert:
  Rebuild bei offenem Popup konvergiert in <300ms zurück auf chW=402/
  credR==gR.
- **Nachschub 4 (live, Screen-Recording 04.41.32):** Das Delta-basierte
  Disarm war falsch — der Fit konnte NACH dem Disarm die Fontgröße noch
  ändern (Credits Ende wanderte), und der Sync übersetzte gegen die alte
  Geometrie. Neu: der Fit trackt seine Konvergenz selbst (zwei Pässe
  gleicher Fontgröße → `isConverged()`), der Sync übersetzt die
  Credits-Zeile erst NACH Konvergenz, Re-Arm pro fresh open.

- **Crash-Untersuchung (16.09. ~04:29 + ~04:54):** Zwei Cinnamon-SIGSEGVs
  während Rapid-Toggle-Tests, Stacks jeweils in libmozjs (GC-Sweeping);
  parallel starb nemo in g_signal_emit — nemo führt Applet-Code nie aus,
  daher System-Event-Wahrscheinlichkeit; applet-seitig wurde der
  JSAPI-Sturm aus per-chart allocation-watchern als plausibelster Trigger
  entfernt (Härtung siehe oben). Coredumps liegen unter
  /var/lib/apport/coredump bzw. via coredumpctl (PIDs 2323/2218084).
  Rapid-Toggle-Restrisiko weiter beobachten.

## 4. Debug-Werkzeuge (erprobt)


### Isolierte Session (IMMER für Animation-/Layout-Analyse nutzen)

```bash
bash /home/claudiu/.zcode/skills/cinnamon-isolated-capture/scripts/run-isolated.sh \
  --stage-applet ~/.local/share/cinnamon/applets/z-usage@oss-singularity \
  --output /tmp/out.png --geometry 1920x1080x24 --settle-ms 45000 \
  -- bash <driver>.sh
```

- Beispiel-Treiber: `/tmp/z-arrow-driver.sh` (Stage + Arrow-Diagnose),
  `/tmp/z-final-verify-driver.sh` (Close-Instrumentierung, 60fps),
  `/tmp/z-final-scenario-driver.sh` (Toggle → Close → Re-Open-Szenario).
  Achtung: `--stage-applet` leitet den Zielordner aus dem Verzeichnis-
  Basename ab — Worktree-Code erst nach `/tmp/stage/z-usage@oss-singularity/`
  kopieren und von dort stagen.
- Isolier-Setup für beide Bugs: `panels-enabled "['1:0:top', '3:0:right']"`
  (Top-Panel: `panelPosition=0`, Höhe 40) + Demo-Snapshot mit ~14
  ZCode-Plan-Sections, damit der Content den Height-Clamp auslöst
  (`/tmp/z-final-demo.json`-Muster).
- 60fps-Recording im isolierten X11: `ffmpeg -y -f x11grab -framerate 60
  -video_size 1920x1080 -i $DISPLAY -c:v libx264rgb -preset ultrafast -crf 0
  out.mp4` (ffmpeg ist installiert).

### Eval-Messungen (gdbus an org.Cinnamon)

Timing-fest: Öffnen + Cinnamon-seitiger `Mainloop.timeout_add` + Ergebnis in
`global.zD`, dann zweiter Eval liest `global.zD`. WICHTIG: Eval-Callbacks
müssen einen String zurückgeben (`return "";`), sonst `(false,'{}')` — das
sieht aus wie ein Fehler, ist aber nur ein leerer Return. KEIN `return` auf
Eval-Top-Level (SyntaxError → `(false,'{}')`); der letzte Statement-Wert ist
der Rückgabewert — ein abschließender `"";` schluckt das Ergebnis.
Referenz-Snippets:

```js
// Popup-Zustand
var a=Main.AppletManager.getRunningInstancesForUuid("z-usage@oss-singularity")[0];
JSON.stringify({open:a.menu.isOpen, top:Math.round(a.menu.actor.allocation.y1),
  H:Math.round(a.menu.actor.get_height()), scrollH:Math.round(a.menu._scroll.get_height()),
  contentW:Math.round(a.menu._content.actor.get_width())});
// Section togglen
var s=a._limitSections[0]; if(s) s.heading.activate(); "";
```

### Bekannte Fehl-Leitplanken (nicht wieder einfallen!)

- `get_preferred_height(-1)` UNTERSCHÄTZT die Höhe (Textumbruch bei realer
  Breite) → immer bei `this._popupWidth()` messen.
- Content-Height-Pin: war die Ursache für „ScrollView scrollt nicht" (fester
  Pin → adjustment upper 0) → KEIN Content-Pin; der ScrollView arbeitet auf
  der natürlichen Höhe.
- `menu.actor` Außenbreite behalten; nur scroll/content/footer auf
  `_menuInnerWidth(outer)` (= outer − 24) klemmen — Theme-Node meldet 0
  Padding, daher fester 24px-Wert.
- Eval-Callbacks: ohne String-Return seen as failure.
- `menu.close()` ohne Argument = `animate undefined` = Instant-Hide — für
  Close-Analysen immer `menu.close(true)`.
- Allocation-Snapshots sind blind gegen Position-Eases (`actor.x` ändert
  nicht `allocation.x1` synchron) — Animationen per Opacity-Probe und/oder
  60fps-Pixelmessung prüfen.

## 5. Release-Gate (nach User-„lesseegooo")

1. `make check` grün + Audit 22/22 (`cinnamon-z-usage-live-sync` Skill).
2. Squash-Merge `oss-oo/z-usage-poc` → `main` (GitHub PR, Squash).
3. `python3 scripts/package.py export --output <leer> --validate` →
   `install.zip` + `SHA256SUMS`.
4. Tag `v0.2.0` (annotiert) auf final main + GitHub Release mit Assets.
5. Danach (separat): Upstream-Session im chatgpt-Repo
   (Backport-Freundlichkeit + upstream Release) — User-FYI vom 15.09.

Skills: `cinnamon-z-usage-live-sync`, `cinnamon-z-usage-release`,
`cinnamon-isolated-capture` (mit `verify-popup-layout-driver.sh` im
live-sync-Scripts-Ordner).
