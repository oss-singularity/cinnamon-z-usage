/* global imports */

const ByteArray = imports.byteArray;
const GLib = imports.gi.GLib;

const [ok, contents] = GLib.file_get_contents("settings-schema.json");
if (!ok) throw new Error("Cannot read settings-schema.json");
const schema = JSON.parse(ByteArray.toString(contents));
if (schema["api-key"].default !== "" ||
    !schema.layout["data-section"].keys.includes("api-key") ||
    schema.layout["data-section"].keys.includes("installation-paths")) {
    throw new Error("Optional Z.ai API key must default to automatic detection in Usage data");
}
if (schema["show-model-specific-limits"].default !== true ||
    schema["show-model-limits-in-panel"].dependency !== "show-model-specific-limits") {
    throw new Error("Model visibility must default on and control the panel-only option");
}
if (schema.layout["display-section"].keys.includes("show-credits-in-panel") ||
    schema["show-credits-in-panel"]) {
    throw new Error("The AIC credits-in-panel switch is retired and must stay removed");
}

if (!schema.layout["panel-color-section"].keys.includes("show-panel-threshold-colors")) {
    throw new Error("Panel threshold color switch is outside the Panel text section");
}
if (schema["show-panel-threshold-colors"].default !== true || schema["show-panel-threshold-colors"].dependency) {
    throw new Error("Panel threshold colors must default on independently of menu coloring");
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(`${message}: expected ${expected}, got ${actual}`);
    }
}

if (!schema.layout.pages.includes("notifications-page")) {
    throw new Error("Notifications page is missing from the settings layout");
}
assertEqual(
    schema["notify-all-weekly-resets"].description,
    "Notify when any model 7d limit refreshes",
    "Master weekly refresh label"
);
assertEqual(
    schema["notify-codex-weekly-reset"].description,
    "Notify when 7d limits reset",
    "Codex weekly reset label"
);
assertEqual(
    schema["notify-spark-weekly-reset"].description,
    "Notify when 7d Spark limits reset",
    "Spark weekly reset label"
);
assertEqual(
    schema["enable-five-hour-low-notifications"].default,
    true,
    "Five-hour notifications default on"
);
assertEqual(
    schema["enable-weekly-low-notifications"].default,
    true,
    "Weekly notifications default on"
);

for (const prefix of ["five-hour", "weekly"]) {
    const warning = schema[`${prefix}-warning-remaining`];
    const critical = schema[`${prefix}-critical-remaining`];
    assertEqual(warning.default, 25, `${prefix} warning default`);
    assertEqual(critical.default, 10, `${prefix} critical default`);
    assertEqual(warning.min, 1, `${prefix} warning lower bound`);
    assertEqual(critical.max, 99, `${prefix} critical upper bound`);
}

function assertVisibleDependentControl(controlKey, settingKey, dependencyKey, inverted, widget, message) {
    const layoutKeys = schema.layout["reset-notification-section"].keys
        .concat(schema.layout["low-notification-section"].keys);
    const control = schema[controlKey];
    assertEqual(layoutKeys.includes(controlKey), true, `${message} is in the layout`);
    assertEqual(layoutKeys.includes(settingKey), false, `${message} does not duplicate the native setting`);
    assertEqual(control.type, "custom", `${message} uses a custom visible control`);
    assertEqual(control.file, "notification_settings.py", `${message} widget file`);
    assertEqual(control.widget, widget, `${message} widget class`);
    assertEqual(control.default, "", `${message} has a UI-only default`);
    assertEqual(control["setting-key"], settingKey, `${message} native setting key`);
    assertEqual(control["dependency-key"], dependencyKey, `${message} dependency key`);
    assertEqual(control["dependency-invert"] === true, inverted, `${message} dependency direction`);
    assertEqual(schema[settingKey].dependency, undefined, `${message} native setting is not hidden`);
}

assertVisibleDependentControl(
    "notify-codex-weekly-reset-control",
    "notify-codex-weekly-reset",
    "notify-all-weekly-resets",
    true,
    "NotificationSwitchWidget",
    "Codex weekly reset control"
);
assertVisibleDependentControl(
    "notify-spark-weekly-reset-control",
    "notify-spark-weekly-reset",
    "notify-all-weekly-resets",
    true,
    "NotificationSwitchWidget",
    "Spark weekly reset control"
);
for (const prefix of ["five-hour", "weekly"]) {
    const enabledKey = prefix === "five-hour"
        ? "enable-five-hour-low-notifications"
        : "enable-weekly-low-notifications";
    for (const level of ["warning", "critical"]) {
        assertVisibleDependentControl(
            `${prefix}-${level}-remaining-control`,
            `${prefix}-${level}-remaining`,
            enabledKey,
            false,
            "NotificationThresholdWidget",
            `${prefix} ${level} threshold control`
        );
    }
}

print("Settings schema tests passed.");
