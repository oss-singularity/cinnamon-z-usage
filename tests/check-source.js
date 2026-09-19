/* global imports, ARGV */

const ByteArray = imports.byteArray;
const GLib = imports.gi.GLib;

for (const path of ARGV) {
    const [ok, contents] = GLib.file_get_contents(path);
    if (!ok) throw new Error(`Cannot read ${path}`);
    const source = ByteArray.toString(contents);
    new Function(source);
    if (path.endsWith("applet.js") && source.includes("collecting since")) {
        throw new Error("Spark history must not expose internal collection-start text");
    }
    if (path.endsWith("applet.js")) {
        const initialNestedChartStyle =
            /chart\.style = this\._activityChartStyle\(nested, false\);[\s\S]*this\._activityCharts\.push\(\{\s*chart,\s*nested\s*\}\);/;
        if (!initialNestedChartStyle.test(source)) {
            throw new Error(
                "Nested activity charts must receive their final inset style before registration"
            );
        }
        const synchronizedNestedChartStyle =
            /entry\.chart\.style = this\._activityChartStyle\(\s*entry\.nested,\s*expandedWithScrollbar\s*\);/;
        if (!synchronizedNestedChartStyle.test(source)) {
            throw new Error(
                "Initial and synchronized activity-chart insets must share one layout path"
            );
        }
        const requiredUiPaths = [
            'this._addSectionHeading(_("Usage limits"))',
            'this._addSectionHeading(_("Recent consumption"))',
            "this._addIconHeading(\n                window,",
            "_usageHelperPath()"
        ];
        for (const snippet of requiredUiPaths) {
            if (!source.includes(snippet)) {
                throw new Error(`Missing required UI path: ${snippet}`);
            }
        }
    }
}
