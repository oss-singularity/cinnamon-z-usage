/* global imports, ARGV */

// Setup-help coverage: the ZCode launch button must offer an
// installation modal (with the optional-API-key note) when the CLI is
// missing, and launch the CLI when it is present. Runs the production
// applet code against stubbed ModalDialog/Dialog/GLib/Util worlds,
// mirroring tests/test-popup-width.js.

const ByteArray = imports.byteArray;
const GLib = imports.gi.GLib;
const [ok, contents] = GLib.file_get_contents(ARGV[0] || "applet.js");
if (!ok) throw new Error("Cannot read applet.js");

const dialogs = [];
const spawns = [];
let zcodeOnPath = false;

class Actor {
    constructor() {
        this.width = -1;
    }
    get_style() { return ""; }
    set_width(value) { this.width = value; }
    remove_child() {}
    add_child() {}
}

class Scroll extends Actor {
    constructor() {
        super();
        this.vscrollbar = new Actor();
    }
    connect() { return 1; }
    get_vscroll_bar() { return this.vscrollbar; }
}

class Menu {
    constructor() {
        this.actor = new Actor();
        this.box = new Actor();
        this._scroll = new Scroll();
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

class ContentLayout {
    add_child() {}
}

class ModalDialogStub {
    constructor() {
        this.contentLayout = new ContentLayout();
        this.buttons = null;
        this.opened = false;
        this.destroyed = false;
        dialogs.push(this);
    }
    setButtons(buttons) {
        this.buttons = buttons;
    }
    open() {
        this.opened = true;
    }
    destroy() {
        this.destroyed = true;
    }
}

const dialogContents = [];

class MessageDialogContent {
    constructor({ title, description }) {
        this.title = title;
        this.description = description;
        dialogContents.push(this);
    }
}

const AppletClass = new Function("imports", "require", "global",
    `${ByteArray.toString(contents)}\nreturn ZUsageApplet;`
)(
    {
        gettext: imports.gettext,
        format: imports.format,
        ui: {
            applet: { Applet: class {}, AppletPopupMenu: Menu },
            popupMenu: {
                PopupMenuManager: class { addMenu() {} },
                PopupMenuSection: class { constructor() { this.actor = new Actor(); } }
            },
            main: {},
            modalDialog: { ModalDialog: ModalDialogStub },
            dialog: { MessageDialogContent }
        },
        misc: {
            util: {
                spawn: argv => spawns.push(argv)
            }
        },
        gi: {
            GLib: {
                find_program_in_path: name => (zcodeOnPath && name === "zcode"
                    ? "/usr/bin/zcode"
                    : null)
            },
            Clutter: { KEY_Escape: 65307 },
            St: {
                PolicyType: { AUTOMATIC: 1, NEVER: 0 },
                ScrollView: class extends Actor { set_policy() {} add_actor() {} connect() { return 1; } },
                BoxLayout: class extends Actor { add_child() {} remove_all_children() {} get_children() { return []; } }
            }
        }
    },
    () => ({}),
    { ui_scale: 1, stage: { connect() { return 1; } } }
);

function freshApplet() {
    const applet = Object.create(AppletClass.prototype);
    applet._installHelpDialog = null;
    return applet;
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

// Missing CLI: clicking ZCode opens the installation help modal.
zcodeOnPath = false;
let applet = freshApplet();
applet._launchZCode();
assert(dialogs.length === 1, "install-help dialog opened for missing CLI");
const help = dialogs[0];
assert(help.opened, "dialog is open");
assert(!help.destroyed, "dialog stays open until a button acts");
const [closeButton, guideButton] = help.buttons;
assert(closeButton.label === "Close", "close button present");
assert(closeButton.key === 65307, "close button bound to Escape");
assert(guideButton.default === true, "guide button is the default action");
spawns.length = 0;
guideButton.action();
assert(help.destroyed, "guide button closes the dialog");
assert(
    spawns.length === 1 && spawns[0][0] === "xdg-open" &&
        spawns[0][1] === "https://zcode.z.ai",
    `guide button opens the ZCode install page, got ${JSON.stringify(spawns)}`
);

// The modal content carries the optional-API-key note and the keyless
// credential hint (Claudiu's requirement for the initial-setup story).
const helpText = dialogContents[0];
assert(helpText.title === "Install ZCode", "help title names ZCode");
assert(
    /API key/.test(helpText.description) && /optional/.test(helpText.description),
    `help description mentions the optional API key, got: ${helpText.description}`
);
assert(
    /credential/.test(helpText.description),
    "help description mentions the keyless credential path"
);

// The applet tracks the open dialog.
assert(applet._installHelpDialog === null, "dialog reference cleared on close");

// Installed CLI: clicking ZCode spawns it, no dialog at all.
zcodeOnPath = true;
applet = freshApplet();
spawns.length = 0;
applet._launchZCode();
assert(
    spawns.length === 1 && spawns[0][0] === "zcode",
    `installed CLI launches directly, got ${JSON.stringify(spawns)}`
);
assert(dialogs.length === 1, "no dialog while the CLI is installed");

// Repeated missing-CLI clicks replace the previous dialog instead of
// stacking modals.
zcodeOnPath = false;
applet = freshApplet();
applet._launchZCode();
assert(dialogs.length === 2, "replacement dialog opens");
applet._launchZCode();
assert(dialogs.length === 3, "another dialog opens on repeat click");
assert(dialogs[1].destroyed, "previous dialog was destroyed on replace");

print("Install help: missing CLI opens the guide modal with the optional API-key note; installed CLI launches directly.");
