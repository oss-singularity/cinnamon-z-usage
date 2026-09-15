/* global imports */

// Exercise the production disclosure and rebuild methods without a desktop.
// Real actor allocation and input are covered by isolated Cinnamon captures.
const GLib = imports.gi.GLib;
const ByteArray = imports.byteArray;
function read(path) {
    const [ok, contents] = GLib.file_get_contents(path);
    if (!ok) throw new Error(`Cannot read ${path}`);
    return ByteArray.toString(contents);
}
const localModule = { exports: {} };
new Function("module", "imports", read("usage-format.js"))(localModule, imports);
const Clutter = { KEY_Left: 1, KEY_Right: 2 };
const Atk = { StateType: { EXPANDABLE: 1, EXPANDED: 2 } };
const AppletClass = new Function("imports", "require",
    `${read("applet.js")}\nreturn ZUsageApplet;`
)(
    {
        gettext: imports.gettext, format: imports.format, ui: {
            applet: { Applet: class {}, AppletPopupMenu: class {} },
            popupMenu: { PopupSeparatorMenuItem: class {} }
        },
        misc: {},
        gi: { GLib, Clutter, Atk, St: { TextDirection: { RTL: 1 } } }
    },
    () => localModule.exports
);

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

const applet = Object.create(AppletClass.prototype);
Object.assign(applet, {
    actor: { grab_key_focus() {} },
    menu: { isOpen: false, removeAll() {}, addMenuItem() {} },
    _historySubmenus: [],
    _limitSections: [],
    _snapshot: { limits: [{ id: "spark", label: "Start Plan · GLM-5.3",
        windows: [{ usedPercent: 0 }, { usedPercent: 0 }] }] },
    _addIconHeading() {
        const states = new Set();
        const heading = { arrow: {}, actor: {
            add_accessible_state(state) { states.add(state); },
            remove_accessible_state(state) { states.delete(state); },
            connect(signal, callback) { heading.onKey = callback; },
            get_direction() { return 0; }
        }, states };
        return heading;
    },
    _addLimitWindowItem() { return { actor: { visible: true } }; },
    _addSectionHeading() { return { actor: {} }; }
});
for (const method of ["_stopResetExpiryBreathing", "_stopRefreshSpinner",
    "_addHeaderItem", "_addHistoryItems", "_addCreditItems", "_addLaunchButtons"]) {
    applet[method] = () => {};
}

applet._rebuildMenu();
let section = applet._limitSections[0];
const sparkRing = { limitId: "spark", limitLabel: "Start Plan · GLM-5.3" };
assert(applet._quotaRingOpacity(sparkRing) === 128,
    "Unused secondary plan rings must be muted");
assert(applet._quotaRingOpacity({ limitId: "zai" }) === 255,
    "Z.ai header rings must retain their normal opacity");
assert(!section.expanded && section.rows.every(row => !row.actor.visible),
    "Unused secondary plan must start collapsed with both rows hidden");
assert(section.heading.states.has(Atk.StateType.EXPANDABLE),
    "Assistive technology must recognize the disclosure");
applet.menu.isOpen = true;
section.heading.activate();
assert(section.expanded && applet.menu.isOpen &&
    section.heading.states.has(Atk.StateType.EXPANDED),
"Activating Spark must expose rows without closing the popup");
applet._rebuildMenu();
section = applet._limitSections[0];
assert(section.expanded, "Refreshing an open popup must preserve manual expansion");
section.heading.onKey(section.heading.actor, { get_key_symbol: () => Clutter.KEY_Left });
assert(!section.expanded, "Left arrow must collapse the section");
section.heading.onKey(section.heading.actor, { get_key_symbol: () => Clutter.KEY_Right });
assert(section.expanded, "Right arrow must expand the section");
applet.menu.isOpen = false;
applet._rebuildMenu();
assert(!applet._limitSections[0].expanded,
    "A fresh opening must restore the unused default");
applet._snapshot.limits[0].windows[1].usedPercent = 0.001;
applet._rebuildMenu();
assert(applet._quotaRingOpacity(sparkRing) === 255,
    "Any positive Spark usage must restore both header rings");
assert(applet._limitSections[0].expanded,
    "Positive weekly use must open Spark without recent-history data");
applet.menu.isOpen = true;
applet._limitSections[0].heading.activate();
applet._rebuildMenu();
assert(!applet._limitSections[0].expanded,
    "Refreshing must also preserve manual collapse of an active quota");
print("Spark disclosure regression tests passed.");
