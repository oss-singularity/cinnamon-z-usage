/* global imports, ARGV, Mainloop */

// Credits-row baseline: the font fit scales only the suffix labels, and
// the row mixed default and CENTER alignment, so the "Used:" group rode
// visibly lower than "Credits:". The fit must translation-correct every
// follower onto the prefix label's Pango baseline (and skip garbage
// mid-relayout reads). Runs the production fit against stub actors,
// mirroring the test-popup-width stub world.

const ByteArray = imports.byteArray;
const GLib = imports.gi.GLib;
const [ok, contents] = GLib.file_get_contents(ARGV[0] || "applet.js");
if (!ok) throw new Error("Cannot read applet.js");

const mainloopStub = {
    idle_add(callback) {
        callback();
        return 0;
    }
};

class Actor {
    constructor() {
        this.width = -1;
    }
    get_style() { return ""; }
    set_width(value) { this.width = value; }
    remove_child() {}
    add_child() {}
}

function makeLabel({ y1, y2, baselinePx, preferredWidth }) {
    const label = {
        style: "",
        opacity: 255,
        translation_y: 0,
        allocation: { x1: 24, y1, x2: 400, y2 },
        handlers: {},
        connect(signal, callback) {
            label.handlers[signal] = callback;
            return 1;
        },
        get_preferred_width: () => [preferredWidth, preferredWidth],
        get_width: () => 376,
        clutter_text: {
            get_layout: () => ({
                get_baseline: () => baselinePx * 1024,
                get_pixel_extents: () => [
                    { x: 0, y: 0, width: preferredWidth, height: y2 - y1 },
                    { x: 0, y: 0, width: preferredWidth, height: y2 - y1 }
                ]
            })
        }
    };
    return label;
}

// Row-local geometry: the row spans y 100..160; each label's baseline
// offset inside the row is (y1 - rowY1) + baselinePx.
const ROW_Y = 100;
const labelActor = makeLabel({ y1: 110, y2: 134, baselinePx: 18, preferredWidth: 60 });
const valueLabel = makeLabel({ y1: 108, y2: 136, baselinePx: 21, preferredWidth: 40 });
const separatorLabel = makeLabel({ y1: 116, y2: 132, baselinePx: 10, preferredWidth: 10 });
const expiresLabel = makeLabel({ y1: 112, y2: 138, baselinePx: 23, preferredWidth: 30 });
const expiryDateLabel = makeLabel({ y1: 106, y2: 142, baselinePx: 28, preferredWidth: 100 });

const row = {
    allocation: { x1: 0, y1: ROW_Y, x2: 373, y2: ROW_Y + 60 },
    handlers: {},
    connect(signal, callback) {
        row.handlers[signal] = callback;
        return 1;
    },
    get_width: () => 373
};
const itemActor = {
    allocation: { x1: 0, y1: 84, x2: 419, y2: 176 },
    handlers: {},
    connect(signal, callback) {
        itemActor.handlers[signal] = callback;
        return 1;
    }
};

const AppletClass = new Function("imports", "require", "global",
    `${ByteArray.toString(contents)}\nreturn ZUsageApplet;`
)(
    {
        gettext: imports.gettext,
        format: imports.format,
        ui: {
            applet: { Applet: class {}, AppletPopupMenu: class {} },
            popupMenu: {
                PopupMenuManager: class { addMenu() {} },
                PopupMenuSection: class { constructor() { this.actor = new Actor(); } }
            },
            main: {}
        },
        misc: {},
        mainloop: mainloopStub,
        gi: {
            St: {},
            Pango: { SCALE: 1024 },
            GLib: { SOURCE_REMOVE: 0 }
        }
    },
    () => ({}),
    {}
);

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

const applet = Object.create(AppletClass.prototype);
Object.assign(applet, {
    _menuColor: () => "rgb(255, 255, 255)",
    normalColor: "#62c7f5",
    _lastCreditFontSize: null,
    _actionWidthFrame: {
        is_finalized: () => false,
        allocation: { x1: 48, y1: 0, x2: 400, y2: 40 }
    },
    menu: { actor: { is_finalized: () => false } }
});

const fitApi = applet._fitCreditConsumptionRow(
    { actor: itemActor },
    row,
    labelActor,
    valueLabel,
    separatorLabel,
    expiresLabel,
    expiryDateLabel,
    "#7df2b6",
    "#62c7f5",
    true
);

// The creation idle already ran fit + baseline sync against the initial
// geometry. "Credits:" sits at row offset 10 + baseline 18 = 28.
assert(
    Math.abs(valueLabel.translation_y - (-1)) < 0.01,
    `value label must rise 1px onto the prefix baseline, got ${valueLabel.translation_y}`
);
assert(
    Math.abs(separatorLabel.translation_y - 2) < 0.01,
    `separator must drop 2px onto the baseline, got ${separatorLabel.translation_y}`
);
assert(
    Math.abs(expiresLabel.translation_y - (-7)) < 0.01,
    `"Used:" must rise 7px onto the prefix baseline, got ${expiresLabel.translation_y}`
);
assert(
    Math.abs(expiryDateLabel.translation_y - (-6)) < 0.01,
    `markup value must rise 6px onto the prefix baseline, got ${expiryDateLabel.translation_y}`
);
assert(
    labelActor.translation_y === 0,
    "the anchor label must never be translated"
);

// Idempotent: re-firing the same allocation re-derives the same offsets.
row.handlers["notify::allocation"]();
assert(
    Math.abs(expiresLabel.translation_y - (-7)) < 0.01 &&
        Math.abs(expiryDateLabel.translation_y - (-6)) < 0.01,
    "re-firing the same allocation must keep the offsets stable"
);

// A mid-relayout garbage read (delta 50px) must be skipped, not latched.
expiryDateLabel.allocation = { x1: 24, y1: 50, x2: 400, y2: 86 };
row.handlers["notify::allocation"]();
assert(
    Math.abs(expiryDateLabel.translation_y - (-6)) < 0.01,
    `garbage deltas must be skipped, got ${expiryDateLabel.translation_y}`
);

// The fit itself still converges on the stub geometry.
assert(
    fitApi.getFontSize() === 102,
    `fit must stay functional beside the baseline sync, got ${fitApi.getFontSize()}`
);

print("Credits baseline: suffix group rides exactly on the prefix baseline; garbage reads are skipped.");
