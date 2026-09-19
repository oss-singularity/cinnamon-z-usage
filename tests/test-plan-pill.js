/* global imports, ARGV */

// Plan-pill gradient markup: Clutter/St lets the label color win over the
// markup's first span, so glyph 0 ("P") painted white while every later
// letter took its gradient. The markup must lead with an invisible space
// span that absorbs the override, and every visible letter keeps its
// per-letter gradient span.

const ByteArray = imports.byteArray;
const GLib = imports.gi.GLib;
const [ok, contents] = GLib.file_get_contents(ARGV[0] || "applet.js");
if (!ok) throw new Error("Cannot read applet.js");

class Actor {
    constructor() {
        this.width = -1;
    }
    get_style() { return ""; }
    set_width(value) { this.width = value; }
    remove_child() {}
    add_child() {}
}

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
        gi: { St: {} }
    },
    () => ({}),
    {}
);

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

const applet = Object.create(AppletClass.prototype);
const from = { red: 0x84, green: 0xd8, blue: 0xf8 };
const to = { red: 0x7d, green: 0xf2, blue: 0xb6 };

const markup = applet._planPillGradientMarkup("Plan: max", from, to);

// The leading absorber span: first gradient color, invisible space, and it
// must come before any visible glyph so the override lands on it.
assert(
    markup.startsWith('<span foreground="#84d8f8"> </span>'),
    `markup must lead with the absorber space span, got: ${markup.slice(0, 60)}`
);

// Every visible letter keeps its own span, starting with "P" in the
// gradient's start color.
assert(
    markup.includes('<span foreground="#84d8f8">P</span>'),
    "the first visible letter must carry the start color span"
);

// The gradient ends on the last letter with the end color.
assert(
    markup.endsWith('<span foreground="#7df2b6">x</span>'),
    "the last letter must carry the end color span"
);

// Interpolation still walks the full gradient (the middle glyph ":"
// sits at t=0.5 between the endpoints, not at a flat color).
assert(
    markup.includes('<span foreground="#81e5d7">:</span>'),
    "mid gradient glyphs must interpolate between the endpoints"
);

// Markup special characters stay escaped inside their spans.
const escaped = applet._planPillGradientMarkup("<a>&", from, to);
assert(
    escaped.includes("&lt;") && escaped.includes("&gt;") &&
        escaped.includes("&amp;"),
    "markup specials must be escaped"
);
assert(
    !escaped.includes("<a>"),
    "raw markup must never survive verbatim in the escaped output"
);

// A single-character plan still renders (no divide by zero on t).
const single = applet._planPillGradientMarkup("m", from, to);
assert(
    single === '<span foreground="#84d8f8"> </span><span foreground="#84d8f8">m</span>',
    `single-letter plan must render at the start color, got: ${single}`
);

// The header brand gradient leaves glyph 0 unspanned (the label color
// carries it - the Clutter override paints glyph 0 with the label color),
// interpolates the rest of the brand, and wraps the tail in the base color.
const branded = applet._brandPrefixGradientMarkup(
    "Z.ai GLM usage",
    4,
    from,
    to,
    "#e6e6e6"
);
assert(
    branded === 'Z<span foreground="#82e1e2">.</span>' +
        '<span foreground="#7fe9cc">a</span>' +
        '<span foreground="#7df2b6">i</span>' +
        '<span foreground="#e6e6e6"> GLM usage</span>',
    `header brand markup mismatch: ${branded}`
);

print("Plan pill: absorber space span leads the markup and every visible letter keeps its gradient.");
