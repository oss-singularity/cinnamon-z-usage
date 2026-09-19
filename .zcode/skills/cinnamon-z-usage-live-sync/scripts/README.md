# verify-popup-layout-driver.sh

Headless validation driver for the Z Usage Monitor popup. Run it through
`cinnamon-isolated-capture`'s `run-isolated.sh` (never against the live
session):

```bash
bash /home/claudiu/.zcode/skills/cinnamon-isolated-capture/scripts/run-isolated.sh \
  --stage-applet ~/.local/share/cinnamon/applets/z-usage@oss-singularity \
  --output /tmp/z-popup.png \
  --geometry 1920x1080x24 \
  --settle-ms 50000 \
  -- bash <this-directory>/verify-popup-layout-driver.sh
```

The driver stages a realistic demo snapshot (coding plan 5h/7d + ZCode Start
Plan and Global Build limits with history charts), opens the popup, scrolls to
the bottom and holds the frame. Assertions to eyeball or measure on the
captured root frame:

- header rings inside the popup, aligned with the row countdown rings;
- every ZCode plan section expanded by default;
- all three accordion leaves present below the recent-consumption charts;
- the three action rows fully painted at the popup bottom.

`driver-debug.sh`-style diagnostics (isOpen, pin/scroll heights, mapped
counts) can be added ad hoc; keep them out of captured deliverables.
