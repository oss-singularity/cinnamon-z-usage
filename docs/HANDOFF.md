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

## 3. OFFENE BUGS (Live-Applet, noch nicht behoben)

### Bug A — Blaue Header-Ringe wackeln beim Schließen nach links

Beim Schließen des Popups verschieben sich die zwei blauen Header-Ringe
(5h/7d) kurz nach links. Messungen (isoliert): `hrTx: -13, hrX: 1459` STABIL
über Section-Toggles — der Drift tritt also nur im **Close-Pfad** auf.

**Mechanismus-Verdacht:** `close()` (Right-Panel-Pfad) ruft
`_normalizeRightPanelPopupCloseWidth(1)`:
1. `menu.actor.style = _rightPanelMenuStyleBase` — wirft `min-width: 419` weg,
2. `set_width(-1)` → natural,
3. `set_width(locked - 1)`.
Der Style-Reset + die Breiten-Änderung triggern ein Re-Layout: die Header-Ringe
(und ggf. andere rechtsbündige Elemente) springen. **Weiterer Verdacht:**
`_lockPopupLayoutWidth` erzwingt box=outer(419) während der menu.actor nach
dem Reset nur 418 hat → 1px+ Overflow.

**Fix-Ansätze (ungetestet):**
- In `_normalizeRightPanelPopupCloseWidth` die Locked-Width MINUS dem gleichen
  Theme-Chrome wie in `_menuInnerWidth` (24px) verwenden.
- Oder: nach dem Close-Normalize `_lockPopupLayoutWidth()` erneut aufrufen.
- Oder: den Style-Reset nicht machen (min-width behalten).

### Bug B — Oberes Panel schneidet den Popup-Header ab

Popup `allocation.y1 = 22`; das Top-Panel endet bei ~30 → die ersten ~8px des
Headers (Titelzeile + obere Ring-Hälfte) sind verdeckt.

**Wurzel:** `_clampPopupHeight` nutzt `maxMenu = monitor.height - 16` — die
Top-Panel-Höhe (~30) fehlt in der Rechnung. Der bisherige Reserve-Code prüft
`panel.panelPosition !== 1` — **verifiziere die echte panelPosition des
Top-Panels live** (kann 0 statt 1 sein!):

```js
Main.panelManager.panels.map(p => [p.panelPosition, p.actor.get_height(),
  Math.round(p.actor.get_transformed_position()[1])])
```

**Fix-Ansatz:** `maxMenu = monitor.height - topPanelBottom - 12` (topPanelBottom
= Unterkante des obersten Panels im oberen Bereich, gemessen über
`get_transformed_position()[1] + get_height()`), dann positioniert Cinnamon
das Popup automatisch darunter. Zusätzlich das Menu-Actor-Höhen-Fixieren
beibehalten (`menu.actor.set_height(popupFrame)` in `_clampPopupHeight`).

## 4. Debug-Werkzeuge (erprobt)

### Isolierte Session (IMMER für Animation-/Layout-Analyse nutzen)

```bash
bash /home/claudiu/.zcode/skills/cinnamon-isolated-capture/scripts/run-isolated.sh \
  --stage-applet ~/.local/share/cinnamon/applets/z-usage@oss-singularity \
  --output /tmp/out.png --geometry 1920x1080x24 --settle-ms 45000 \
  -- bash <driver>.sh
```

- Beispiel-Treiber: `/tmp/z-arrow-driver.sh` (Stage + Arrow-Diagnose),
  `/tmp/z-close-rec3.sh` (Staging + Close + 60fps-Recording),
  `/tmp/z-toggle-driver.sh`-Muster (Toggle-Sequenz + Messung).
- 60fps-Recording im isolierten X11: `ffmpeg -y -f x11grab -framerate 60
  -video_size 1920x1080 -i $DISPLAY -c:v libx264rgb -preset ultrafast -crf 0
  out.mp4` (ffmpeg ist installiert).

### Eval-Messungen (gdbus an org.Cinnamon)

Timing-fest: Öffnen + Cinnamon-seitiger `Mainloop.timeout_add` + Ergebnis in
`global.zD`, dann zweiter Eval liest `global.zD`. WICHTIG: Eval-Callbacks
müssen einen String zurückgeben (`return "";`), sonst `(false,'{}')` — das
sieht aus wie ein Fehler, ist aber nur ein leerer Return. Referenz-Snippets:

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
