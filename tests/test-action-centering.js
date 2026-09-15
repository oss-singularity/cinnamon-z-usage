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
                get_stage() { return true; },
                get_transformed_position() {
                    return [menuX + 48 + error + this.translation_x, 0];
                },
                get_transformed_size() { return [352 + error, 122]; }
            };
            const applet = Object.create(AppletClass.prototype);
            applet.menu = { actor: {
                get_transformed_position() { return [menuX - error, 0]; },
                get_transformed_size() { return [menuWidth - error, 665]; }
            } };
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

// Model visibility changes native column minimums. Rings, disclosure arrows
// and the plot edge align to the popup's own content right edge (a stable
// geometric anchor), repeated syncs must be idempotent.
for (const scale of [1, 1.25, 2]) {
    for (const menuX of [1461, 900]) {
        for (const naturalShift of [0, -28, 15]) {
            const ring = {
                translation_x: -14,
                get_transformed_position() { return [390 + naturalShift + this.translation_x, 0]; },
                get_transformed_size() { return [52, 52]; }
            };
            const chart = {
                width: 374 + naturalShift,
                get_transformed_position() { return [110, 0]; },
                get_theme_node() { return { get_padding() { return 39; } }; },
                set_width(width) { this.width = width; }
            };
            const arrows = [10, 12].map((width, index) => ({
                translation_x: 0,
                rotation_angle_z: index ? 90 : 0,
                get_transformed_position() {
                    return [480 + naturalShift + this.translation_x + (this.rotation_angle_z ? width : 0), 0];
                },
                get_abs_allocation_vertices() {
                    const x = 480 + naturalShift + this.translation_x;
                    return [{ x }, { x: x + width }, { x }, { x: x + width }];
                },
                get_transformed_size() { return [width, width]; }
            }));
            const applet = Object.create(AppletClass.prototype);
            applet.menu = {
                actor: { allocation: { x1: menuX + 48 } },
                isOpen: true,
                _content: { actor: {
                    get_transformed_position() { return [menuX + 60, 0]; },
                    get_transformed_size() { return [395, 0]; }
                } }
            };
            const right = menuX + 60 + 395 - 17;
            Object.assign(applet, {
                _countdownWidgets: [{ actor: ring }],
                _limitSections: [{ heading: { arrow: arrows[0] } }],
                _submenuTriangles: [arrows[1]],
                _activityCharts: [{ chart }]
            });
            for (let rebuild = 0; rebuild < 3; rebuild++) {
                applet._syncContentRightEdges();
                if (ring.translation_x !== -14 || chart.width !== right - 110 + 39) {
                    throw new Error(
                        `Content edge drift after model/layout change: scale=${scale}, ` +
                        `menuX=${menuX}, shift=${naturalShift}, ringTX=${ring.translation_x}, ` +
                        `chartWidth=${chart.width}`
                    );
                }
                for (const arrow of arrows) {
                    if (arrow.translation_x !== 0) {
                        throw new Error(`Disclosure drift: scale=${scale}, shift=${naturalShift}`);
                    }
                }
            }
        }
    }
}
print("Content alignment: rings and arrows keep their designed positions, the plot edge follows the button grid.");
