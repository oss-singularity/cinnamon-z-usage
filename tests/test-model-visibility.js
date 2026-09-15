/* global imports */

const GLib = imports.gi.GLib;
const ByteArray = imports.byteArray;
const [ok, contents] = GLib.file_get_contents("applet.js");
if (!ok) throw new Error("Cannot read applet.js");
const AppletClass = new Function("imports", "require",
    `${ByteArray.toString(contents)}\nreturn ZUsageApplet;`
)(
    { gettext: imports.gettext, format: imports.format, ui: { applet: { Applet: class {}, AppletPopupMenu: class {} }, popupMenu: { PopupSeparatorMenuItem: class {} } }, misc: {}, gi: {} },
    () => ({
        formatDuration: value => `${value}m`,
        formatPercent: value => `${value}%`,
        hasRecentActivity: () => false
    })
);
function assert(value, message) { if (!value) throw new Error(message); }
const applet = Object.create(AppletClass.prototype);
applet.metadata = JSON.parse(ByteArray.toString(GLib.file_get_contents("metadata.json")[1]));
applet._setDefaults();
const limits = Object.freeze([
    Object.freeze({ id: "zai", label: "Z.ai", windows: [{ durationMinutes: 300, remainingPercent: 50 }] }),
    Object.freeze({ id: "spark", label: "Spark", windows: [{ durationMinutes: 300, remainingPercent: 20 }] }),
    Object.freeze({ id: "future-model", label: "Future", windows: [] })
]);
assert(applet.showModelSpecificLimits && applet._filterModelLimits(limits).length === 3, "Default must show all models");
applet.showModelSpecificLimits = false;
assert(applet._filterModelLimits(limits).length === 1 && applet._filterModelLimits(limits)[0] === limits[0], "Hidden models must not replace the account limit");
assert(applet._filterModelLimits(limits.slice(1)).length === 0, "Never fall back to hidden model limits");
assert(applet._filterModelLimits([{ durationMinutes: 300 }]).length === 1, "Legacy unlabelled history is the account limit");
applet._snapshot = { limits, history: { windows: limits.map(limit => ({ id: limit.id, label: limit.label })) } };
applet.set_applet_tooltip = text => { applet.tooltip = text; };
applet._updateTooltip([]);
assert(!applet.tooltip.includes("Spark") && !applet.tooltip.includes("Future") && applet.tooltip.includes("50%"), "Tooltip must honor visibility");
const renderedHistory = [];
applet.menu = { addMenuItem() {} };
applet._addSectionHeading = () => {};
applet._addHistoryWindow = window => renderedHistory.push(window.id);
applet._addHistoryItems();
assert(JSON.stringify(renderedHistory) === '["zai"]', "Hidden history sections must not render");
let historyOpened = false;
applet._historySubmenus = [{ id: "spark", submenu: { menu: { open() { historyOpened = true; } } } }];
applet._openActiveSparkHistory();
assert(!historyOpened, "Hidden Spark history must not auto-open");
let panelRebuilt = false;
let menuRebuilt = false;
applet._rebuildPanel = () => { panelRebuilt = true; };
applet._rebuildMenu = () => { menuRebuilt = true; };
applet._onModelVisibilityChanged();
assert(panelRebuilt && menuRebuilt, "Toggle must immediately rebuild menu and panel");
applet.showModelSpecificLimits = true;
applet._updateTooltip([]);
assert(applet.tooltip.includes("Spark") && limits.length === 3, "Re-enabling restores original data");
print("Model visibility: full filtering, history, tooltip, immediate rebuild and reversible display passed.");
