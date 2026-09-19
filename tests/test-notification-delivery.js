/* global imports, ARGV */

const GLib = imports.gi.GLib;
const ByteArray = imports.byteArray;
const [ok, contents] = GLib.file_get_contents(ARGV[0] || "applet.js");
if (!ok) throw new Error("Cannot read applet.js");
const [schemaOk, schemaContents] = GLib.file_get_contents("settings-schema.json");
if (!schemaOk) throw new Error("Cannot read settings schema");
const schema = JSON.parse(ByteArray.toString(schemaContents));
const [formatOk, formatContents] = GLib.file_get_contents("usage-format.js");
if (!formatOk) throw new Error("Cannot read event logic");
const UsageFormat = new Function("module", `${ByteArray.toString(formatContents)}; return module.exports;`)({ exports: {} });
const sources = [];
const notifications = [];
class Source {
    notify(notification) {
        if (!sources.includes(this)) throw new Error("Source not registered before delivery");
        notifications.push(notification);
    }
}
class Notification {
    constructor(source, title, body) { Object.assign(this, { source, title, body, isTransient: true }); }
    setTransient(value) { this.isTransient = value; }
}
const AppletClass = new Function("imports", "require",
    `${ByteArray.toString(contents)}\nreturn ZUsageApplet;`
)(
    { gettext: imports.gettext, format: imports.format, ui: {
        applet: { Applet: class {}, AppletPopupMenu: class {} },
        main: { messageTray: { add(source) { sources.push(source); } },
            notify() { throw new Error("Transient Main.notify delivery is forbidden"); } },
        messageTray: { SystemNotificationSource: Source, Notification }
    }, misc: {}, gi: {} },
    () => UsageFormat
);
const applet = Object.create(AppletClass.prototype);
applet._setDefaults();
for (const [key, property] of [
    ["notify-all-weekly-resets", "notifyAllWeeklyResets"],
    ["notify-codex-weekly-reset", "notifyCodexWeeklyReset"],
    ["notify-spark-weekly-reset", "notifySparkWeeklyReset"],
    ["enable-five-hour-low-notifications", "enableFiveHourLowNotifications"],
    ["enable-weekly-low-notifications", "enableWeeklyLowNotifications"]
]) {
    if (schema[key].default !== true || applet[property] !== true) throw new Error(`${key} must default on`);
}
function snapshot(value, reset = 100000) {
    return { limits: ["zai", "spark"].map(id => ({ id, label: id, windows: [300, 10080].map(durationMinutes =>
        ({ durationMinutes, remainingPercent: value, resetsAt: reset })) })) };
}
applet._showUsageNotifications(null, snapshot(40));
if (notifications.length) throw new Error("First refresh must stay silent");
applet._showUsageNotifications(snapshot(40), snapshot(25));
applet._showUsageNotifications(snapshot(25), snapshot(10));
applet._showUsageNotifications(snapshot(10), snapshot(100, 200000));
if (notifications.length !== 10) throw new Error("Expected four warnings, four critical alerts and two weekly resets");
if (notifications.some(notification => notification.isTransient !== false)) throw new Error("Notification will disappear from center");
applet._showUsageNotifications(snapshot(10), snapshot(10));
applet._showUsageNotifications(snapshot(100, 200000), snapshot(100, 200000));
if (notifications.length !== 10) throw new Error("Unchanged refresh duplicated notifications");
applet.notifyAllWeeklyResets = false;
applet.notifyCodexWeeklyReset = false;
applet.notifySparkWeeklyReset = false;
applet.enableFiveHourLowNotifications = false;
applet.enableWeeklyLowNotifications = false;
applet._showUsageNotifications(snapshot(40), snapshot(10));
applet._showUsageNotifications(snapshot(10), snapshot(100, 200000));
if (notifications.length !== 10) throw new Error("Disabled options were ignored");
print("Notifications: enabled defaults, non-transient delivery, duplicate suppression and opt-out passed.");
