/* global imports */

const GLib = imports.gi.GLib;
const ByteArray = imports.byteArray;
const [ok, contents] = GLib.file_get_contents("applet.js");
if (!ok) throw new Error("Cannot read applet.js");
const AppletClass = new Function("imports", "require",
    `${ByteArray.toString(contents)}\nreturn ZUsageApplet;`
)(
    { gettext: imports.gettext, format: imports.format, ui: { applet: { Applet: class {}, AppletPopupMenu: class {} } }, misc: {}, gi: { St: { Side: { RIGHT: 1 } } } },
    () => ({})
);

// Cinnamon's transformed float coordinates straddle half-pixel rounding
// boundaries on the first refresh. Exercise the production centering method
// with both signs of that noise, repeated calls and a secondary monitor.
for (const menuX of [1461, 900]) {
    for (const menuWidth of [419, 448]) {
        for (const error of [-0.0001220703125, 0, 0.0001220703125]) {
            const frame = {
                translation_x: 37,
                is_finalized() { return false; },
                get_stage() { return true; },
                get_transformed_position() {
                    return [menuX + 48 + error + this.translation_x, 0];
                },
                get_transformed_size() { return [352 + error, 122]; }
            };
            const applet = Object.create(AppletClass.prototype);
            applet.menu = {
                isOpen: true,
                actor: {
                    is_finalized() { return false; },
                    get_transformed_position() { return [menuX - error, 0]; },
                    get_transformed_size() { return [menuWidth - error, 665]; }
                }
            };
            applet._actionWidthFrame = frame;
            const expected = menuWidth === 419 ? -14 : 0;
            for (let refresh = 0; refresh < 3; refresh++) {
                applet._syncActionColumnCentering();
                if (frame.translation_x !== expected) {
                    throw new Error(
                        `Action grid drift: width=${menuWidth}, error=${error}, ` +
                        `refresh=${refresh}, expected=${expected}, ` +
                        `actual=${frame.translation_x}`
                    );
                }
            }
        }
    }
}

print("Action centering regression tests passed.");

// Model visibility changes native column minimums. Rings and the plot edge
// align to the popup's own content right edge (a stable geometric anchor);
// repeated syncs must be idempotent and stale mid-layout reads are ignored.
// Every mock lives inside the popup's own coordinate space, like real
// allocations - offsets wider than the popup cannot be real alignments and
// are ignored by production (the wild-scroll guard).
for (const scale of [1, 1.25, 2]) {
    for (const menuX of [1461, 900]) {
        for (const naturalShift of [0, -28, 15]) {
            const ring = {
                translation_x: -14,
                is_finalized() { return false; },
                get_transformed_position() {
                    return [menuX + 348 + naturalShift + this.translation_x, 0];
                },
                get_transformed_size() { return [52, 52]; }
            };
            const chart = {
                width: 374 + naturalShift,
                is_finalized() { return false; },
                get_transformed_position() { return [menuX + 110, 0]; },
                get_theme_node() { return { get_padding() { return 39; } }; },
                set_width(width) { this.width = width; }
            };
            const applet = Object.create(AppletClass.prototype);
            applet.menu = {
                actor: {
                    allocation: { x1: menuX + 48 },
                    is_finalized() { return false; },
                    get_transformed_position() { return [menuX, 0]; },
                    get_transformed_size() { return [419, 0]; }
                },
                isOpen: true
            };
            const right = menuX + 48 + 352;
            Object.assign(applet, {
                _actionWidthFrame: {
                    is_finalized() { return false; },
                    get_transformed_position() { return [menuX + 48, 0]; },
                    get_transformed_size() { return [352, 0]; }
                },
                _countdownWidgets: [{ actor: ring }],
                _lastChartWidths: [],
                _activityCharts: [{ chart }]
            });
            for (let rebuild = 0; rebuild < 3; rebuild++) {
                applet._syncContentRightEdges();
                const ringRight = ring.get_transformed_position()[0] + 51;
                if (ringRight !== right || chart.width !== right - (menuX + 110) + 39) {
                    throw new Error(
                        `Content edge drift after model/layout change: scale=${scale}, ` +
                        `menuX=${menuX}, shift=${naturalShift}, ringRight=${ringRight}, ` +
                        `expected=${right}`
                    );
                }
            }
        }
    }
}
print("Content alignment: rings keep their designed positions, the plot edge follows the button grid.");

// Refresh-while-open regression (2026-09-17): a sync pass that reads the
// anchor mid-relayout sees a different menu-relative distance and must not
// write ring or chart alignments - that write WAS the visible refresh jump.
// Repeated stale writes used to accumulate past the per-ring guard, whose
// skip then left the green rings invisible for good. The guard now rejects
// the whole pass, and a ring flung beyond the popup width snaps back to its
// designed offset instead of staying vanished.
{
    const menuX = 1461;
    const grid = { x: menuX + 48 };
    const right = menuX + 400;
    const ring = {
        translation_x: 0,
        _usageHomeTx: 0,
        is_finalized() { return false; },
        get_transformed_position() { return [menuX + 348 + this.translation_x, 0]; },
        get_transformed_size() { return [52, 52]; }
    };
    const chart = {
        width: 374,
        is_finalized() { return false; },
        get_transformed_position() { return [menuX + 110, 0]; },
        get_theme_node() { return { get_padding() { return 39; } }; },
        set_width(width) { this.width = width; }
    };
    const applet = Object.create(AppletClass.prototype);
    applet.menu = {
        actor: {
            is_finalized() { return false; },
            get_transformed_position() { return [menuX, 0]; },
            get_transformed_size() { return [419, 0]; }
        },
        isOpen: true
    };
    Object.assign(applet, {
        _actionWidthFrame: {
            is_finalized() { return false; },
            get_transformed_position() { return [grid.x, 0]; },
            get_transformed_size() { return [352, 0]; }
        },
        _countdownWidgets: [{ actor: ring }],
        _lastChartWidths: [],
        _activityCharts: [{ chart }]
    });

    // Settle: the ring aligns and the anchor baseline is established.
    applet._syncContentRightEdges();
    if (ring.translation_x !== 1) {
        throw new Error(`Settle alignment failed: tx=${ring.translation_x}, expected=1`);
    }

    // Mid-relayout pass: the anchor reads 200px off. The pass must be
    // rejected wholesale - no ring translation, no chart width write.
    grid.x += 200;
    applet._syncContentRightEdges();
    if (ring.translation_x !== 1 || chart.width !== 329) {
        throw new Error(
            `Stale anchor pass wrote alignments: tx=${ring.translation_x}, ` +
            `chartWidth=${chart.width}`
        );
    }

    // Recovery: with the anchor back, alignment stays exact (idempotent).
    grid.x -= 200;
    applet._syncContentRightEdges();
    if (ring.translation_x !== 1 || chart.width !== 329) {
        throw new Error(
            `Recovery pass drifted: tx=${ring.translation_x}, chartWidth=${chart.width}`
        );
    }

    // A ring flung beyond the popup width (poison from old builds) snaps
    // back to its designed offset on the next pass and realigns after.
    const flung = {
        translation_x: 600,
        _usageHomeTx: 0,
        is_finalized() { return false; },
        get_transformed_position() { return [menuX + 348 + this.translation_x, 0]; },
        get_transformed_size() { return [52, 52]; }
    };
    applet._countdownWidgets = [{ actor: flung }];
    applet._syncContentRightEdges();
    if (flung.translation_x !== 0) {
        throw new Error(`Fling reset failed: tx=${flung.translation_x}, expected=0 (home)`);
    }
    applet._syncContentRightEdges();
    if (flung.translation_x !== 1) {
        throw new Error(`Fling recovery failed: tx=${flung.translation_x}, expected=1`);
    }

    // Header rings carry their designed left shift as the home offset.
    const header = {
        translation_x: 600,
        _usageHomeTx: -13,
        is_finalized() { return false; },
        get_transformed_position() { return [menuX + 348 + this.translation_x, 0]; },
        get_transformed_size() { return [52, 52]; }
    };
    applet._countdownWidgets = [];
    applet._headerRings = header;
    applet._syncContentRightEdges();
    if (header.translation_x !== -13) {
        throw new Error(`Header home reset failed: tx=${header.translation_x}, expected=-13`);
    }
    applet._syncContentRightEdges();
    if (header.translation_x !== 1) {
        throw new Error(`Header recovery failed: tx=${header.translation_x}, expected=1`);
    }
}
print("Refresh guard: stale anchor passes are rejected, flung rings self-heal.");

// Poisoned translations must not survive a rebuild: the carry-over drops
// anything beyond the popup width so a vanished ring cannot be carried
// into the fresh build (it would start vanished and stay vanished).
{
    const finalized = { is_finalized() { return false; } };
    const applet = Object.create(AppletClass.prototype);
    applet._countdownWidgets = [
        { actor: Object.assign({ translation_x: 8 }, finalized) },
        { actor: Object.assign({ translation_x: 600 }, finalized) },
        { actor: null },
        { actor: Object.assign({ translation_x: -20 }, finalized) }
    ];
    applet._headerRings = Object.assign({ translation_x: -7 }, finalized);
    const carried = applet._captureCarriedRingTranslations();
    if (JSON.stringify(carried) !== JSON.stringify([8, null, null, -20])) {
        throw new Error(`Ring carry validation failed: ${JSON.stringify(carried)}`);
    }
    if (applet._captureCarriedHeaderTranslation() !== -7) {
        throw new Error("Header carry validation failed for a sane value");
    }
    applet._headerRings = Object.assign({ translation_x: 600 }, finalized);
    if (applet._captureCarriedHeaderTranslation() !== null) {
        throw new Error("Header carry validation failed: poison value was carried");
    }
}
print("Carry-over validation: poisoned translations are dropped.");

// A single stale pass may read a plausible-but-wrong ring position while
// the anchor itself is stable. Honest layout changes repeat the delta on
// the next pass; garbage does not. Large corrections therefore need two
// agreeing passes (the one-poll refresh flash of the green rings).
{
    const menuX = 1461;
    const right = menuX + 400;
    const ring = {
        translation_x: 0,
        _usageHomeTx: 0,
        is_finalized() { return false; },
        // Offset models a stale read: whatever `bias` is, the ring reports
        // its painted edge there.
        bias: 0,
        get_transformed_position() { return [menuX + 348 + this.translation_x + this.bias, 0]; },
        get_transformed_size() { return [52, 52]; }
    };
    const applet = Object.create(AppletClass.prototype);
    applet.menu = {
        actor: {
            is_finalized() { return false; },
            get_transformed_position() { return [menuX, 0]; },
            get_transformed_size() { return [419, 0]; }
        },
        isOpen: true
    };
    Object.assign(applet, {
        _actionWidthFrame: {
            is_finalized() { return false; },
            get_transformed_position() { return [menuX + 48, 0]; },
            get_transformed_size() { return [352, 0]; }
        },
        _countdownWidgets: [{ actor: ring }],
        _lastChartWidths: [],
        _activityCharts: []
    });

    // Settle normally.
    applet._syncContentRightEdges();
    if (ring.translation_x !== 1) {
        throw new Error(`voting settle failed: tx=${ring.translation_x}`);
    }

    // One stale pass reads a 300px error: NOT applied.
    ring.bias = 300;
    applet._syncContentRightEdges();
    if (ring.translation_x !== 1) {
        throw new Error(`one-pass garbage was applied: tx=${ring.translation_x}`);
    }

    // The same wrong delta repeats: an honest layout change - applied.
    applet._syncContentRightEdges();
    if (ring.translation_x !== -299) {
        throw new Error(`repeated honest delta not applied: tx=${ring.translation_x}`);
    }

    // Back to sanity: the 300px correction back needs two agreeing passes.
    ring.bias = 0;
    applet._syncContentRightEdges();
    if (ring.translation_x !== -299) {
        throw new Error(`first correction pass applied early: tx=${ring.translation_x}`);
    }
    applet._syncContentRightEdges();
    if (ring.translation_x !== 1) {
        throw new Error(`recovery after voting failed: tx=${ring.translation_x}`);
    }
}
print("Two-pass voting: single-pass garbage deltas are never applied.");
