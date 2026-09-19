/* global imports, ARGV */

const GLib = imports.gi.GLib;
const ByteArray = imports.byteArray;
const [ok, contents] = GLib.file_get_contents(ARGV[0] || "applet.js");
if (!ok) throw new Error("Cannot read applet.js");
class Actor {
    constructor(options) {
        Object.assign(this, options);
        this.children = [];
        this.clutter_text = { set_line_alignment() {} };
    }
    add_child(actor) { this.children.push(actor); }
}
const bindings = new Map();
const Icon = class extends Actor {};
const Gio = { File: { new_for_path() {} }, FileIcon: class {} };
const AppletClass = new Function("imports", "require",
    `${ByteArray.toString(contents)}\nreturn ZUsageApplet;`
)(
    {
        gettext: imports.gettext, format: imports.format, ui: {
            applet: { Applet: class {}, AppletPopupMenu: class {} },
            settings: { AppletSettings: class {
                bind(key, property, changed) { bindings.set(key, { property, changed }); }
            } }
        },
        misc: {},
        gi: {
            St: { BoxLayout: Actor, Label: Actor, Icon },
            Gio,
            Clutter: { ActorAlign: { CENTER: 0 } },
            Pango: { Alignment: { CENTER: 0 } }
        }
    },
    () => ({
        formatDuration: value => `${value}m`,
        formatPercent: value => `${value}%`,
        formatPanelPercent: value => `${value}%`,
        formatCreditNumber: value => String(value)
    })
);
const applet = Object.create(AppletClass.prototype);
applet._setDefaults();
applet.metadata = { path: "." };
applet.panelTextColor = "#abcdef";
applet.warningColor = "#fedcba";
applet.criticalColor = "#123456";
applet._bindSettings(1);
const binding = bindings.get("show-panel-threshold-colors");

for (const vertical of [false, true]) {
    applet._isVertical = vertical;
    for (const menuColors of [false, true]) {
        applet.showColors = menuColors;
        for (const enabled of [false, true]) {
            applet.showPanelThresholdColors = enabled;
            if (applet._remainingColor(5) !== (menuColors ? applet.criticalColor : applet.normalColor)) {
                throw new Error("Panel switch changed menu coloring");
            }
            for (const [remaining, zone] of [[100, "normal"], [25.01, "normal"], [25, "warning"],
                [10.01, "warning"], [10, "critical"], [0, "critical"], [NaN, "normal"], [null, "normal"]]) {
                const expected = !enabled || zone === "normal" ? applet.panelTextColor
                    : zone === "warning" ? applet.warningColor : applet.criticalColor;
                const actor = applet._createWindowActor({ durationMinutes: 300, remainingPercent: remaining }, false);
                const value = actor.children[actor.children.length - 1];
                if (!value.style.includes(`color: ${expected};`)) {
                    throw new Error(`Wrong panel color: vertical=${vertical}, menu=${menuColors}, enabled=${enabled}, remaining=${remaining}`);
                }
                const label = actor.children[0].children[0];
                if (!label.style.includes(`color: ${applet.panelTextColor};`)) throw new Error("Window label changed color");
            }
        }
    }
}
applet._isVertical = true;
const windowWithIcon = applet._createWindowActor({ id: "zai", durationMinutes: 10080, remainingPercent: 76 }, true);
if (!windowWithIcon.children[0].style.includes("min-width: 40px;")) {
    throw new Error("Vertical quota label rows must share the icon column");
}
if (!binding || binding.property !== "showPanelThresholdColors") throw new Error("Missing panel color binding");
let rebuilds = 0;
applet._rebuildPanel = () => rebuilds++;
binding.changed();
if (rebuilds !== 1) throw new Error("Panel color toggle must update immediately");
applet.showPanelThresholdColors = true;
applet.warningRemaining = 40;
applet.criticalRemaining = 15;
if (applet._panelRemainingColor(40) !== applet.warningColor || applet._panelRemainingColor(15) !== applet.criticalColor) {
    throw new Error("Custom panel thresholds ignored");
}
print("Panel colors: boundaries, custom palette/thresholds, orientations, toggle and menu independence passed.");
