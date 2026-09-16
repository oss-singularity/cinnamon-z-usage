/* global imports, ARGV */

const GLib = imports.gi.GLib;
const ByteArray = imports.byteArray;
const [ok, contents] = GLib.file_get_contents(ARGV[0] || "applet.js");
if (!ok) throw new Error("Cannot read applet.js");

class Actor {
    constructor() { this.width = -1; }
    get_style() { return ""; }
    set_width(value) { this.width = value; }
    remove_child() {}
    add_child() {}
}

class Menu {
    constructor() {
        this.actor = new Actor();
        this.box = new Actor();
        this.isOpen = false;
    }
    connect() { return 1; }
    open() {
        this.isOpen = true;
        if (this.actor.width < 0) this.actor.width = 448;
    }
    close() { this.isOpen = false; }
    addMenuItem() {}
}

const AppletClass = new Function("imports", "require", "global",
    `${ByteArray.toString(contents)}\nreturn ZUsageApplet;`
)(
    {
        gettext: imports.gettext, format: imports.format, ui: {
            applet: { Applet: class {}, AppletPopupMenu: Menu },
            popupMenu: {
                PopupMenuManager: class { addMenu() {} },
                PopupMenuSection: class { constructor() { this.actor = new Actor(); } }
            },
            main: {}
        },
        misc: {},
        gi: { St: {
            PolicyType: { AUTOMATIC: 1, NEVER: 0 },
            ScrollView: class extends Actor { set_policy() {} add_actor() {} },
            BoxLayout: class extends Actor { add_child() {} remove_all_children() {} get_children() { return []; } }
        } }
    },
    () => ({}),
    { ui_scale: 1, stage: { connect() { return 1; } } }
);

// Exercise the production open wrapper and rebuild layout callback with
// the horizontal menu's observed 448 px natural size. Native captures cover
// the actual Cinnamon allocation, clipping and visual contents separately.
for (const textScale of [1, 1.25, 1.5, 2]) {
for (const orientation of ["top", "bottom", "left", "right"]) {
    const applet = Object.create(AppletClass.prototype);
    Object.assign(applet, {
        _isRightPanel: orientation === "right",
        _popupTextScale: textScale,
        _rightPanelPopupLockedWidth: 0,
        _historySubmenus: [],
        _limitSections: [],
        _popupRightInsetRows: [],
        _activityCharts: [],
        _rebuildMenu() {},
        _openActiveSparkHistory() {}
    });
    applet._buildMenu(orientation);
    for (let cycle = 0; cycle < 3; cycle++) {
        applet.menu.open(false);
        if (applet.menu.actor.width !== Math.round(419 * textScale) || applet.menu.box.width !== Math.round(419 * textScale)) {
            throw new Error(`${orientation}: popup grew on open cycle ${cycle}`);
        }
        applet.menu.actor.width = 448;
        applet.menu.box.width = 448;
        applet._syncPopupRightInsets();
        if (applet.menu.actor.width !== Math.round(419 * textScale) || applet.menu.box.width !== Math.round(419 * textScale)) {
            throw new Error(`${orientation}: popup grew during rebuild cycle ${cycle}`);
        }
        // Model the shell releasing its allocation after a completed close.
        applet.menu.isOpen = false;
        applet.menu.actor.width = -1;
    }
}
}
print("Popup width: all panel orientations preserve normal width and accommodate 125–200% text through rebuild/reopen.");
