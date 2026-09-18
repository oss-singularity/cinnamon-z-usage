/* global imports */

const ByteArray = imports.byteArray;
const GLib = imports.gi.GLib;

const [ok, contents] = GLib.file_get_contents("usage-format.js");
if (!ok) throw new Error("Cannot read usage-format.js");

const localModule = { exports: {} };
new Function("module", "exports", ByteArray.toString(contents))(
    localModule,
    localModule.exports
);
const UsageFormat = localModule.exports;

for (const [windows, expected, message] of [
    [null, false, "Missing quota windows stay collapsed"],
    [[], false, "Empty quota windows stay collapsed"],
    [[{ usedPercent: 0 }, { usedPercent: 0 }], false, "Unused Spark stays collapsed"],
    [[{ usedPercent: 0.001 }, { usedPercent: 0 }], true, "Fractional 5h use opens Spark"],
    [[{ usedPercent: 0 }, { usedPercent: 1 }], true, "Weekly-only use opens Spark"],
    [[{}, { usedPercent: null }, { usedPercent: NaN }], false, "Unknown is not usage"],
    [[{ usedPercent: -1 }, { usedPercent: Infinity }], false, "Invalid is not usage"]
]) {
    assertEqual(UsageFormat.hasQuotaUsage(windows), expected, message);
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(`${message}: expected ${expected}, got ${actual}`);
    }
}

function assertClose(actual, expected, message, tolerance = 1e-9) {
    if (Math.abs(actual - expected) > tolerance) {
        throw new Error(`${message}: expected ${expected}, got ${actual}`);
    }
}

const summaries = UsageFormat.summarizeWindows([
    {
        id: "zai",
        label: "Z.ai",
        windows: [
            { durationMinutes: 10080, remainingPercent: 87, resetsAt: 100 }
        ]
    },
    {
        id: "zai_model",
        label: "Model",
        windows: [
            { durationMinutes: 300, remainingPercent: 100, resetsAt: 200 },
            { durationMinutes: 10080, remainingPercent: 92, resetsAt: 300 }
        ]
    }
]);

assertEqual(summaries.length, 2, "Summary window count");
assertEqual(summaries[0].durationMinutes, 300, "Shortest window first");
assertEqual(summaries[0].remainingPercent, 100, "Five-hour remaining usage");
assertEqual(summaries[1].remainingPercent, 87, "Most constrained weekly bucket");
assertEqual(
    UsageFormat.summarizeWindows([
        {
            id: "zai",
            label: "Z.ai",
            windows: [{ durationMinutes: 10080, remainingPercent: 87, lastResetAt: 123456 }]
        }
    ])[0].lastResetAt,
    123456,
    "Summary keeps an observed last-reset timestamp"
);
const quotaWindows = UsageFormat.listQuotaWindows([
    {
        id: "zai",
        label: "Z.ai",
        windows: [
            { durationMinutes: 10080, remainingPercent: 87, resetsAt: 100 }
        ]
    },
    {
        id: "zai_model",
        label: "Model",
        windows: [
            { durationMinutes: 10080, remainingPercent: 92, resetsAt: 300 },
            { durationMinutes: 300, remainingPercent: 100, resetsAt: 200 }
        ]
    }
]);
assertEqual(quotaWindows.length, 3, "Keep quota windows from every limit");
assertEqual(quotaWindows[0].durationMinutes, 300, "Sort model windows shortest first");
assertEqual(quotaWindows[1].limitId, "zai_model", "Keep duplicate durations");
assertEqual(quotaWindows[2].limitId, "zai", "Place account limits after models");
assertEqual(
    UsageFormat.selectPanelWindows(summaries, false).length,
    1,
    "Hide weekly window alongside five-hour window"
);
assertEqual(
    UsageFormat.selectPanelWindows([summaries[1]], false).length,
    1,
    "Keep weekly window when no five-hour window exists"
);
assertEqual(
    UsageFormat.selectPanelWindows(summaries, true).length,
    2,
    "Show all windows when weekly display is enabled"
);
assertEqual(UsageFormat.formatDuration(300), "5h", "Five-hour label");
assertEqual(UsageFormat.formatDuration(10080), "7d", "Weekly label");
assertEqual(UsageFormat.formatDuration(90), "90m", "Non-integral hour label");
assertEqual(
    UsageFormat.formatElapsedDuration(1000, 1000 + (8 * 3600) + (31 * 60)),
    "8h 31m",
    "Elapsed collection duration"
);
assertEqual(
    UsageFormat.formatElapsedDuration(1000, 1000 + (42 * 60)),
    "42m",
    "Sub-hour collection duration"
);
assertEqual(
    UsageFormat.formatElapsedDuration(1000, 1000 + (26 * 3600)),
    "26h",
    "Multi-day collection duration in hours"
);
assertEqual(
    UsageFormat.formatElapsedDuration(2000, 1000),
    "?",
    "Invalid collection duration"
);
assertEqual(UsageFormat.formatPercent(99.6), "100%", "Percentage rounding");
assertEqual(UsageFormat.formatPercent(-2), "0%", "Percentage lower clamp");
assertEqual(UsageFormat.formatPercent(0), "0%", "Exact zero percentage stays zero");
assertEqual(UsageFormat.formatPanelPercent(0), "0%", "Panel zero percentage stays zero");
assertEqual(
    UsageFormat.formatPanelPercent(0.01),
    "<1%",
    "Panel tiny positive percentages stay compact"
);
assertEqual(
    UsageFormat.formatPanelPercent(0.99),
    "<1%",
    "Panel sub-one percentages stay compact"
);
assertEqual(UsageFormat.formatPanelPercent(1), "1%", "Panel one percent stays numeric");
assertEqual(
    UsageFormat.formatPercent(0),
    "0%",
    "Exact zero remains an integer percentage"
);
assertEqual(
    UsageFormat.formatPercent(0.01),
    "0%",
    "API-scale fractional percentages round to the reported integer precision"
);
assertEqual(
    UsageFormat.formatPercent(0.49),
    "0%",
    "Sub-half-percent values remain the API-compatible zero display"
);
assertEqual(
    UsageFormat.formatPercent(14.99),
    "15%",
    "Critical percentages use whole values"
);
assertEqual(
    UsageFormat.formatPercent(15),
    "15%",
    "Critical threshold itself uses normal rounding"
);
assertEqual(
    UsageFormat.formatConsumedPercent({ consumedPercent: 2.25, complete: true }),
    "2.3%",
    "Precise observed consumption"
);
assertEqual(
    UsageFormat.formatConsumedPercent({ consumedPercent: 2, complete: false }),
    "~2%",
    "Partial observed consumption"
);

const fiveHourCountdown = UsageFormat.buildResetCountdown(
    { durationMinutes: 300, resetsAt: 10000 },
    1000
);
assertEqual(fiveHourCountdown.valid, true, "Five-hour countdown validity");
assertEqual(fiveHourCountdown.remainingSeconds, 9000, "Five-hour seconds remaining");
assertEqual(fiveHourCountdown.fractionRemaining, 0.5, "Five-hour ring fraction");
assertEqual(fiveHourCountdown.fractionElapsed, 0.5, "Five-hour elapsed fraction");
assertEqual(fiveHourCountdown.label, "2h\n30m", "Five-hour countdown label");
assertEqual(
    UsageFormat.formatResetCountdownTooltip(
        { durationMinutes: 300, resetsAt: 10000 },
        1000
    ),
    "Reset window: 5h\nElapsed: 50%\nRemaining: 2h 30m",
    "Five-hour reset tooltip"
);

const earlyFiveHourCountdown = UsageFormat.buildResetCountdown(
    { durationMinutes: 300, resetsAt: 1000 + (4 * 3600) },
    1000
);
assertClose(
    earlyFiveHourCountdown.fractionElapsed,
    0.2,
    "Reset progress starts near empty and fills toward reset"
);

const unusedFiveHourCountdown = UsageFormat.buildResetCountdown(
    {
        durationMinutes: 300,
        remainingPercent: 100,
        resetsAt: 1000 + (5 * 3600)
    },
    1002
);
assertEqual(
    unusedFiveHourCountdown.label,
    "5h",
    "Unused five-hour cycle keeps its full duration"
);
assertEqual(
    unusedFiveHourCountdown.fractionElapsed,
    0,
    "Unused five-hour cycle has no reset progress"
);
assertEqual(
    UsageFormat.formatResetCountdownTooltip(
        {
            durationMinutes: 300,
            remainingPercent: 100,
            resetsAt: 1000 + (5 * 3600)
        },
        1002
    ),
    "Reset window: 5h\nElapsed: 0%\nRemaining: 5h",
    "Unused five-hour reset tooltip"
);

const unusedWeeklyCountdown = UsageFormat.buildResetCountdown(
    {
        durationMinutes: 10080,
        remainingPercent: 100,
        resetsAt: 1000 + (7 * 86400)
    },
    1002
);
assertEqual(
    unusedWeeklyCountdown.label,
    "7d",
    "Unused weekly cycle keeps its full duration"
);
assertEqual(
    unusedWeeklyCountdown.fractionElapsed,
    0,
    "Unused weekly cycle has no reset progress"
);

assertEqual(
    UsageFormat.buildResetCountdown(
        {
            durationMinutes: 300,
            remainingPercent: 99.9,
            resetsAt: 1000 + (5 * 3600)
        },
        1002
    ).label,
    "4h\n59m",
    "Started cycle keeps counting down"
);

const weeklyCountdown = UsageFormat.buildResetCountdown(
    { durationMinutes: 10080, resetsAt: 1000 + (3 * 86400) + (4 * 3600) },
    1000
);
assertEqual(weeklyCountdown.label, "3d\n4h", "Weekly countdown label");
assertEqual(
    UsageFormat.buildResetCountdown(
        { durationMinutes: 300, resetsAt: 1000 + (42 * 60) + 7 },
        1000
    ).label,
    "42m\n7s",
    "Minute countdown label"
);
assertEqual(
    UsageFormat.buildResetCountdown(
        { durationMinutes: 300, resetsAt: 999 },
        1000
    ).label,
    "now",
    "Expired countdown label"
);
assertEqual(
    UsageFormat.buildResetCountdown({ durationMinutes: 300, resetsAt: null }, 1000).valid,
    false,
    "Missing reset countdown"
);
assertEqual(
    UsageFormat.formatResetCountdownTooltip(
        { durationMinutes: 10080, resetsAt: null },
        1000
    ),
    "Reset window: 7d\nElapsed: unavailable",
    "Invalid reset tooltip"
);
const exactLastResetTooltip = UsageFormat.formatLastResetTooltip(
    { durationMinutes: 10080 },
    1700000000,
    true,
    false
);
if (!exactLastResetTooltip.startsWith("Last 7d reset: ") || /estimated/.test(exactLastResetTooltip)) {
    throw new Error(`Expected exact last-reset tooltip, got ${exactLastResetTooltip}`);
}
const estimatedLastResetTooltip = UsageFormat.formatLastResetTooltip(
    { durationMinutes: 10080 },
    1700000000,
    true,
    true
);
if (!estimatedLastResetTooltip.includes("(estimated from next reset)")) {
    throw new Error(`Expected estimated last-reset tooltip, got ${estimatedLastResetTooltip}`);
}
assertEqual(
    UsageFormat.formatLastResetTooltip({ durationMinutes: 10080 }, null),
    "Last 7d reset: unavailable",
    "Missing last-reset timestamp stays explicit"
);
const weeklyQuota = UsageFormat.buildQuotaIndicator({
    durationMinutes: 10080,
    remainingPercent: 60
});
assertEqual(weeklyQuota.valid, true, "Weekly quota ring validity");
assertEqual(weeklyQuota.durationLabel, "7d", "Weekly quota ring duration");
assertEqual(weeklyQuota.percentLabel, "60%", "Weekly quota ring percentage");
assertEqual(weeklyQuota.fractionRemaining, 0.6, "Weekly quota ring fraction");
assertEqual(
    UsageFormat.buildQuotaIndicator({ durationMinutes: 300, remainingPercent: 120 })
        .fractionRemaining,
    1,
    "Quota ring upper clamp"
);
assertEqual(
    UsageFormat.buildActivityChart([null, 0, 1, 2]).knownCount,
    3,
    "Activity chart known bucket count"
);
const chart = UsageFormat.buildActivityChart([null, 0, 1, 2]);
assertEqual(chart.peakPercent, 2, "Activity chart peak");
assertEqual(chart.totalPercent, 3, "Activity chart rolling total");
assertEqual(chart.totalComplete, false, "Unknown bucket makes total partial");
assertEqual(chart.bars[0].known, false, "Unknown activity bucket");
assertEqual(chart.bars[1].intensity, 0, "Zero-consumption bucket");
assertEqual(chart.bars[2].intensity, 4, "Relative activity intensity");
assertEqual(chart.bars[3].intensity, 7, "Peak activity intensity");

const unevenChart = UsageFormat.buildActivityChart([1, 2, 14]);
assertEqual(
    UsageFormat.activityBarHeight(unevenChart.bars[0], unevenChart.peakPercent),
    9,
    "One-percent activity keeps a distinct bar height"
);
assertEqual(
    UsageFormat.activityBarHeight(unevenChart.bars[1], unevenChart.peakPercent),
    11,
    "Two-percent activity keeps a distinct bar height"
);
assertEqual(
    UsageFormat.activityBarHeight(unevenChart.bars[0], unevenChart.peakPercent) <
        UsageFormat.activityBarHeight(unevenChart.bars[1], unevenChart.peakPercent),
    true,
    "Nearby measured activity values do not collapse to one height"
);
assertEqual(
    UsageFormat.activityBarHeight(unevenChart.bars[2], unevenChart.peakPercent),
    26,
    "Activity peak keeps the maximum bar height"
);

const partialChart = UsageFormat.buildActivityChart([
    { consumedPercent: 0, complete: false },
    { consumedPercent: 4, complete: false }
]);
assertEqual(partialChart.knownCount, 1, "Partial zero remains unknown");
assertEqual(partialChart.bars[0].known, false, "Unknown partial zero bucket");
assertEqual(partialChart.bars[1].partial, true, "Observed partial activity bucket");
assertEqual(partialChart.bars[1].intensity, 7, "Partial peak intensity");
assertEqual(partialChart.peakComplete, false, "Partial peak marker");
assertEqual(partialChart.totalPercent, 4, "Partial activity total");
assertEqual(partialChart.totalComplete, false, "Partial bucket makes total partial");

const completeChart = UsageFormat.buildActivityChart([0, 1, 2]);
assertEqual(completeChart.totalPercent, 3, "Complete activity total");
assertEqual(completeChart.totalComplete, true, "Fully observed total is complete");

const observedZeroChart = UsageFormat.buildActivityChart([
    { consumedPercent: 0, complete: false, observed: true }
]);
assertEqual(observedZeroChart.bars[0].known, true, "Observed zero bucket is known");
assertEqual(observedZeroChart.bars[0].partial, true, "Observed running bucket is partial");
assertEqual(
    UsageFormat.hasRecentActivity([
        { consumedPercent: 0, complete: true, observed: true },
        { consumedPercent: 2, complete: false, observed: true }
    ]),
    true,
    "Positive activity opens recent details"
);
assertEqual(
    UsageFormat.hasRecentActivity([
        null,
        { consumedPercent: 0, complete: true, observed: true }
    ]),
    false,
    "Observed zero activity keeps recent details closed"
);
assertEqual(
    UsageFormat.hasRecentActivity(null),
    false,
    "Missing activity keeps recent details closed"
);
assertEqual(
    UsageFormat.historyPeriodKeys(300).join(","),
    "1h,4h,24h",
    "Five-hour history replaces reset-spanning periods with a rolling day"
);
assertEqual(
    UsageFormat.historyPeriodKeys(10080).join(","),
    "1h,4h,12h,today",
    "Weekly history keeps the longer consumption periods"
);
const fiveHourActivityHistory = {
    durationMinutes: 300,
    activity24h: [
        { consumedPercent: 0, complete: true, observed: true },
        { consumedPercent: 1, complete: true, observed: true }
    ]
};
const weeklyActivityHistory = {
    durationMinutes: 10080,
    activity24h: [
        { consumedPercent: 0, complete: true, observed: true },
        { consumedPercent: 0, complete: true, observed: true }
    ]
};
const sharedActivityValues = UsageFormat.buildSharedActivityValues([
    weeklyActivityHistory,
    fiveHourActivityHistory
], 0.5);
assertEqual(
    sharedActivityValues[1].consumedPercent,
    0.5,
    "Shared Spark chart estimates rounded weekly activity at half scale"
);
assertEqual(
    sharedActivityValues[1].estimated,
    true,
    "Rounded weekly activity remains marked as estimated"
);
const sharedActivityChart = UsageFormat.buildActivityChart(sharedActivityValues);
const fiveHourActivityTotal = UsageFormat.buildActivityTotalPeriod(
    fiveHourActivityHistory.activity24h
);
assertEqual(
    UsageFormat.formatConsumedPercent(fiveHourActivityTotal),
    "1%",
    "Five-hour history exposes its exact rolling-day activity"
);
assertEqual(
    sharedActivityChart.totalPercent,
    0.5,
    "Shared Spark chart keeps the estimated weekly deduction"
);
assertEqual(
    sharedActivityChart.totalEstimated,
    true,
    "Shared Spark chart exposes its estimated total"
);
assertEqual(
    sharedActivityChart.bars[1].intensity,
    1,
    "Estimated sub-percent weekly activity stays at the smallest visible bar"
);
assertEqual(
    UsageFormat.hasRecentActivity(sharedActivityValues),
    true,
    "Shared Spark chart stays aligned with the auto-open activity signal"
);
const estimatedActivityTooltip = UsageFormat.formatActivityBucketTooltip(
    sharedActivityChart.bars[1],
    1,
    2,
    60,
    1700000000,
    true
);
if (!estimatedActivityTooltip.includes("~0.5% consumed · estimated")) {
    throw new Error(
        `Expected estimated weekly deduction tooltip, got ${estimatedActivityTooltip}`
    );
}
const measuredWeeklyActivity = UsageFormat.buildSharedActivityValues([
    fiveHourActivityHistory,
    {
        durationMinutes: 10080,
        activity24h: [
            { consumedPercent: 0, complete: true, observed: true },
            { consumedPercent: 1, complete: true, observed: true }
        ]
    }
], 0.5);
assertEqual(
    measuredWeeklyActivity[1].consumedPercent,
    1,
    "Measured weekly activity takes precedence over the estimate"
);
assertEqual(
    Boolean(measuredWeeklyActivity[1].estimated),
    false,
    "Measured weekly activity is not marked as estimated"
);
assertEqual(
    UsageFormat.formatWholeNumber("250.0000000000"),
    "250",
    "Whole credit balance omits decimal zeroes"
);
assertEqual(
    UsageFormat.formatWholeNumber("239.071181"),
    "239",
    "Fractional credit balance rounds to a whole number"
);
assertEqual(
    UsageFormat.formatWholeNumber("239.8"),
    "240",
    "Credit balance uses conventional whole-number rounding"
);
assertEqual(
    UsageFormat.formatWholeNumber(null),
    "unavailable",
    "Missing credit balance stays unavailable"
);
assertEqual(
    UsageFormat.formatCompactConsumedCredits({ consumed: 2.4, complete: true }),
    "<0.5k",
    "Consumed credits use compact magnitude tokens"
);
assertEqual(
    UsageFormat.formatCompactConsumedCredits({ consumed: 7849, complete: true }),
    "8k",
    "Thousands round to the nearest k token"
);
assertEqual(
    UsageFormat.formatCompactConsumedCredits({ consumed: 2499, complete: false }),
    "2k",
    "Partial consumed credits round to the nearest k token"
);
assertEqual(
    UsageFormat.formatCompactConsumedCredits({ consumed: 999, complete: true }),
    "<1k",
    "Sub-thousand consumed credits keep the below-one-k token"
);
assertEqual(
    UsageFormat.formatCompactConsumedCredits({ consumed: 249, complete: true }),
    "<0.5k",
    "Sub-half-k consumed credits keep the below-half token"
);
assertEqual(
    UsageFormat.formatCreditNumber("158.04"),
    "158.0",
    "Credit balances show one decimal place"
);
assertEqual(
    UsageFormat.formatCreditNumber("0.0"),
    "0",
    "Zero credit balance stays compact without a decimal place"
);
assertEqual(
    UsageFormat.formatCreditNumber("239.071181"),
    "239.1",
    "Fractional credit balances round to one decimal place"
);
assertEqual(
    UsageFormat.formatCreditNumber(null),
    "unavailable",
    "Missing fractional credit balance stays unavailable"
);
assertEqual(
    UsageFormat.formatCreditNumber("115785.0"),
    "115785",
    "Whole credit balances drop the decimal tail"
);
assertEqual(
    UsageFormat.formatCreditConsumption({
        "24h": { consumed: 6296, complete: true },
        "12h": { consumed: 2499, complete: true },
        "4h": { consumed: 880, complete: true },
        "1h": { consumed: 120, complete: true }
    }),
    "24h 6k  ·  12h 2k  ·  4h <1k  ·  1h <0.5k",
    "Credit consumption periods use the requested order"
);
assertEqual(
    UsageFormat.formatCreditConsumptionMarkup({
        "24h": { consumed: 6296, complete: true },
        "12h": { consumed: 2499, complete: true },
        "4h": { consumed: 880, complete: true },
        "1h": { consumed: 120, complete: true }
    }, "periods"),
    "<i>24h</i> 6k&#160;&#160;·&#160;&#160;<i>12h</i> 2k&#160;&#160;·&#160;&#160;<i>4h</i> <1k&#160;&#160;·&#160;&#160;<i>1h</i> <0.5k",
    "Period labels can be italicized in the credit consumption markup"
);
assertEqual(
    UsageFormat.formatCreditConsumptionMarkup({
        "24h": { consumed: 6296, complete: true },
        "12h": { consumed: 2499, complete: true },
        "4h": { consumed: 880, complete: true },
        "1h": { consumed: 120, complete: true }
    }, "credits"),
    "24h <i>6k</i>&#160;&#160;·&#160;&#160;12h <i>2k</i>&#160;&#160;·&#160;&#160;4h <i><1k</i>&#160;&#160;·&#160;&#160;1h <i><0.5k</i>",
    "Credit values can be italicized in the credit consumption markup"
);
assertEqual(
    UsageFormat.formatCreditConsumptionMarkup({
        "24h": { consumed: 6296, complete: true },
        "12h": { consumed: 2499, complete: true },
        "4h": { consumed: 880, complete: true },
        "1h": { consumed: 120, complete: true }
    }, "numbers"),
    "24h <span weight=\"bold\">6</span>k&#160;&#160;·&#160;&#160;12h <span weight=\"bold\">2</span>k&#160;&#160;·&#160;&#160;4h &lt;<span weight=\"bold\">1</span>k&#160;&#160;·&#160;&#160;1h &lt;<span weight=\"bold\">0.5</span>k",
    "Credit-only emphasis keeps periods and label unbolded"
);
assertEqual(
    UsageFormat.formatCreditConsumption({
        "24h": { consumed: 0, complete: true },
        "12h": { consumed: 0, complete: true },
        "4h": { consumed: 0, complete: true },
        "1h": { consumed: 0, complete: true }
    }),
    null,
    "Unused credits stay off the compact balance line"
);
const creditActivityChart = UsageFormat.buildCreditActivityChart([
    { consumed: 0, complete: true, observed: true },
    { consumed: 3, complete: true, observed: true }
]);
assertEqual(creditActivityChart.totalPercent, 3, "Credit activity total");
assertEqual(creditActivityChart.bars[1].known, true, "Credit activity bucket is known");
assertEqual(
    UsageFormat.formatPeakCredits([
        { consumed: 4400, complete: true, observed: true },
        { consumed: 13400, complete: true, observed: true },
        { consumed: 9600, complete: true, observed: true }
    ]),
    "13k",
    "Peak credit consumption uses compact magnitude tokens"
);
assertEqual(
    UsageFormat.formatPeakCredits([
        { consumed: 0, complete: true, observed: true },
        { consumed: 0, complete: true, observed: true }
    ]),
    null,
    "No recent credit consumption has no peak label"
);
assertEqual(
    UsageFormat.hasRecentActivity([
        { consumed: 0, complete: true, observed: true },
        { consumed: 1, complete: true, observed: true }
    ], "consumed"),
    true,
    "Credit activity opens the combined graph"
);
const creditTooltip = UsageFormat.formatActivityBucketTooltip(
    creditActivityChart.bars[1],
    1,
    2,
    60,
    1700000000,
    true,
    "credits"
);
if (!creditTooltip.includes("3 credits consumed")) {
    throw new Error(`Expected credit tooltip, got ${creditTooltip}`);
}
const sharedTooltipRange = UsageFormat.formatActivityBucketRange(
    1,
    2,
    60,
    1700000000,
    true
);
const greenTooltipLine = UsageFormat.formatActivityBucketTooltipLine(
    chart.bars[3],
    3,
    4,
    120,
    1700000000,
    true
);
const unknownTooltipLine = UsageFormat.formatActivityBucketTooltipLine(
    chart.bars[0],
    0,
    4,
    120,
    1700000000,
    true,
    "credits"
);
if (!sharedTooltipRange || greenTooltipLine.includes("\n") ||
    unknownTooltipLine !== "No observed data") {
    throw new Error(
        `Expected shared tooltip range and detail-only lines, got ${sharedTooltipRange} / ${greenTooltipLine} / ${unknownTooltipLine}`
    );
}
assertEqual(
    UsageFormat.formatWholeNumber("3.0000000000"),
    "3",
    "Whole reset count omits decimal zeroes"
);
const authenticationError = UsageFormat.parseUsageHelperError(
    "AUTH_REQUIRED: Add a Z.ai API key with Coding Plan access in the applet settings."
);
assertEqual(
    authenticationError.authenticationRequired,
    true,
    "Authentication marker is recognised"
);
assertEqual(
    authenticationError.message,
    "Add a Z.ai API key with Coding Plan access in the applet settings.",
    "Authentication marker is hidden from the user"
);
const refreshError = UsageFormat.parseUsageHelperError("Network unavailable");
assertEqual(
    refreshError.authenticationRequired,
    false,
    "Ordinary refresh errors retain stale usage"
);
assertEqual(refreshError.message, "Network unavailable", "Refresh error text is retained");

const knownBucketTooltip = UsageFormat.formatActivityBucketTooltip(
    chart.bars[3],
    3,
    4,
    120,
    1700000000,
    true
);
if (!knownBucketTooltip.includes("2% consumed") || !knownBucketTooltip.includes("\n")) {
    throw new Error(`Expected known activity tooltip details, got ${knownBucketTooltip}`);
}
const unknownBucketTooltip = UsageFormat.formatActivityBucketTooltip(
    chart.bars[0],
    0,
    4,
    120,
    1700000000,
    true
);
if (!unknownBucketTooltip.endsWith("No observed data")) {
    throw new Error(`Expected unknown activity tooltip details, got ${unknownBucketTooltip}`);
}
const partialBucketTooltip = UsageFormat.formatActivityBucketTooltip(
    partialChart.bars[1],
    1,
    2,
    120,
    1700000000,
    false
);
if (
    !partialBucketTooltip.includes("~4% consumed") ||
    partialBucketTooltip.includes("partial bucket")
) {
    throw new Error(`Expected partial activity tooltip details, got ${partialBucketTooltip}`);
}
const historicalPartialTooltip = UsageFormat.formatActivityBucketTooltip(
    partialChart.bars[1],
    0,
    2,
    120,
    1700000000,
    false
);
if (!historicalPartialTooltip.includes("~4% consumed · partial bucket")) {
    throw new Error(
        `Expected historical partial bucket details, got ${historicalPartialTooltip}`
    );
}
assertEqual(
    UsageFormat.formatAccessibleTooltip("First\nSecond\nThird"),
    "First. Second. Third",
    "All accessible tooltip line breaks"
);
assertEqual(
    UsageFormat.formatAppTooltip(true, "26.825.51511", "chatgpt"),
    "chatgpt 26.825.51511",
    "ChatGPT tooltip includes package and version"
);
assertEqual(
    UsageFormat.formatAppTooltip(true, "26.825.51511", "chatgpt", "30.08.2026"),
    "chatgpt 26.825.51511 — 30.08.2026",
    "Installed ChatGPT tooltip includes release date"
);
assertEqual(
    UsageFormat.formatAppTooltip(true, "26.831.20005", "chatgpt", "01.09.2026"),
    "chatgpt 26.831.20005 — 01.09.2026",
    "Updated ChatGPT tooltip includes current release date"
);
assertEqual(
    UsageFormat.formatLocalDate(1788250825),
    "01.09.2026",
    "Application package timestamp formats as a local date"
);
assertEqual(
    UsageFormat.formatLocalDate(0),
    null,
    "Invalid application package timestamp has no date"
);
assertEqual(
    UsageFormat.formatChatGptVersionDate("26.831.20005"),
    "31.08.2026",
    "ChatGPT version date decodes August 31, 2026"
);
assertEqual(
    UsageFormat.formatChatGptVersionDate("26.825.51511"),
    "25.08.2026",
    "ChatGPT version date decodes August 25, 2026"
);
assertEqual(
    UsageFormat.formatChatGptVersionDate("26.406.40811"),
    "06.04.2026",
    "ChatGPT version date decodes April 6, 2026"
);
assertEqual(
    UsageFormat.formatChatGptVersionDate("26.1001.20005"),
    "01.10.2026",
    "ChatGPT version date supports two-digit months"
);
assertEqual(
    UsageFormat.formatChatGptVersionDate("new-version"),
    null,
    "Unknown ChatGPT version has no decoded build date"
);
assertEqual(
    UsageFormat.formatAppTooltip(true, "codex-cli 0.152.0", "", "01.09.2026"),
    "codex-cli 0.152.0 — 01.09.2026",
    "Installed app tooltip includes release date"
);
assertEqual(
    UsageFormat.formatAppTooltip(true, "new-version", "chatgpt", null),
    "chatgpt new-version",
    "Unknown application version has no guessed release date"
);
assertEqual(
    UsageFormat.formatAppTooltip(false),
    "not installed",
    "Missing application tooltip contains only not installed"
);
assertEqual(
    UsageFormat.formatAppTooltip(true),
    "version unavailable",
    "Installed application without readable version reports unavailable version"
);

assertEqual(
    UsageFormat.normalizeNotificationThresholds(25, 10).valid,
    true,
    "Notification thresholds require critical below warning"
);
assertEqual(
    UsageFormat.normalizeNotificationThresholds(10, 10).valid,
    false,
    "Equal notification thresholds are rejected"
);
assertEqual(
    UsageFormat.notificationZone(26, 25, 10),
    "normal",
    "Quota above warning threshold is normal"
);
assertEqual(
    UsageFormat.notificationZone(25, 25, 10),
    "warning",
    "Warning threshold is inclusive"
);
assertEqual(
    UsageFormat.notificationZone(10, 25, 10),
    "critical",
    "Critical threshold is inclusive"
);

function notificationSnapshot(codexFive, codexWeekly, sparkFive, sparkWeekly, resetShift = 0) {
    return {
        limits: [
            {
                id: "zai",
                label: "Z.ai",
                windows: [
                    {
                        durationMinutes: 300,
                        remainingPercent: codexFive,
                        resetsAt: 20000 + resetShift
                    },
                    {
                        durationMinutes: 10080,
                        remainingPercent: codexWeekly,
                        resetsAt: 700000 + resetShift
                    }
                ]
            },
            {
                id: "zai_spark",
                label: "GLM-Spark",
                windows: [
                    {
                        durationMinutes: 300,
                        remainingPercent: sparkFive,
                        resetsAt: 21000 + resetShift
                    },
                    {
                        durationMinutes: 10080,
                        remainingPercent: sparkWeekly,
                        resetsAt: 710000 + resetShift
                    }
                ]
            }
        ]
    };
}

const notificationDefaults = {
    notifyAllWeeklyResets: false,
    notifyCodexWeeklyReset: false,
    notifySparkWeeklyReset: false,
    enableFiveHourLowNotifications: true,
    fiveHourWarningRemaining: 25,
    fiveHourCriticalRemaining: 10,
    enableWeeklyLowNotifications: true,
    weeklyWarningRemaining: 25,
    weeklyCriticalRemaining: 10
};
assertEqual(
    UsageFormat.buildUsageNotificationEvents(
        null,
        notificationSnapshot(20, 20, 20, 20),
        notificationDefaults
    ).length,
    0,
    "First successful refresh stays silent"
);
const warningEvents = UsageFormat.buildUsageNotificationEvents(
    notificationSnapshot(40, 40, 40, 40),
    notificationSnapshot(25, 24, 24, 40),
    notificationDefaults
);
assertEqual(warningEvents.length, 3, "Independent 5h and 7d warning entries");
assertEqual(warningEvents[0].level, "warning", "Warning zone entry level");
assertEqual(
    UsageFormat.buildUsageNotificationEvents(
        notificationSnapshot(25, 24, 24, 40),
        notificationSnapshot(20, 20, 20, 40),
        notificationDefaults
    ).length,
    0,
    "Repeated refresh inside warning zone stays silent"
);
const criticalEvents = UsageFormat.buildUsageNotificationEvents(
    notificationSnapshot(20, 20, 20, 40),
    notificationSnapshot(10, 10, 10, 40),
    notificationDefaults
);
assertEqual(criticalEvents.length, 3, "Critical entry follows an earlier warning");
assertEqual(criticalEvents[0].level, "critical", "Critical zone entry level");
assertEqual(
    UsageFormat.buildUsageNotificationEvents(
        notificationSnapshot(10, 10, 10, 40),
        notificationSnapshot(50, 50, 50, 40),
        notificationDefaults
    ).length,
    0,
    "Recovery to normal stays silent"
);
assertEqual(
    UsageFormat.buildUsageNotificationEvents(
        notificationSnapshot(50, 50, 50, 40),
        notificationSnapshot(25, 50, 50, 40),
        notificationDefaults
    ).length,
    1,
    "Fresh crossing after recovery notifies again"
);
assertEqual(
    UsageFormat.buildUsageNotificationEvents(
        notificationSnapshot(40, 40, 40, 40),
        notificationSnapshot(20, 20, 20, 20),
        {
            ...notificationDefaults,
            enableFiveHourLowNotifications: false
        }
    ).filter(event => event.durationMinutes === 300).length,
    0,
    "Five-hour notification switch is independent"
);
assertEqual(
    UsageFormat.buildUsageNotificationEvents(
        notificationSnapshot(40, 40, 40, 40),
        notificationSnapshot(20, 20, 20, 20),
        {
            ...notificationDefaults,
            enableWeeklyLowNotifications: false
        }
    ).filter(event => event.durationMinutes === 10080).length,
    0,
    "Weekly notification switch is independent"
);
assertEqual(
    UsageFormat.buildUsageNotificationEvents(
        notificationSnapshot(40, 40, 40, 40),
        notificationSnapshot(20, 20, 20, 20),
        {
            ...notificationDefaults,
            fiveHourWarningRemaining: 10,
            fiveHourCriticalRemaining: 10
        }
    ).filter(event => event.durationMinutes === 300).length,
    0,
    "Invalid threshold pair cannot notify"
);

const resetPrevious = notificationSnapshot(50, 60, 50, 70);
const resetCurrent = notificationSnapshot(50, 100, 50, 100, 604800);
const observedResets = UsageFormat.findObservedWeeklyResets(
    { ...resetPrevious, updatedAt: 800000 },
    { ...resetCurrent, updatedAt: 800060 }
);
assertEqual(observedResets.length, 2, "Observed reset helper finds both weekly resets");
assertEqual(observedResets[0].resetAt, 700000, "Observed reset uses the previous window boundary");
assertEqual(observedResets[0].nextResetAt, 1304800, "Observed reset keeps the next boundary");
assertEqual(observedResets[0].observedAt, 800060, "Observed reset keeps the observation time");
const resetEvents = UsageFormat.buildUsageNotificationEvents(
    resetPrevious,
    resetCurrent,
    {
        ...notificationDefaults,
        notifyAllWeeklyResets: true,
        enableFiveHourLowNotifications: false,
        enableWeeklyLowNotifications: false
    }
);
assertEqual(resetEvents.length, 2, "Master reset switch covers the account limit and Spark");
assertEqual(resetEvents[0].kind, "reset", "Weekly refresh event kind");
assertEqual(
    UsageFormat.buildUsageNotificationEvents(
        resetPrevious,
        resetCurrent,
        {
            ...notificationDefaults,
            notifySparkWeeklyReset: true,
            enableFiveHourLowNotifications: false,
            enableWeeklyLowNotifications: false
        }
    ).length,
    1,
    "Spark reset switch stays independent"
);
assertEqual(
    UsageFormat.buildUsageNotificationEvents(
        resetCurrent,
        resetCurrent,
        {
            ...notificationDefaults,
            notifyAllWeeklyResets: true,
            enableFiveHourLowNotifications: false,
            enableWeeklyLowNotifications: false
        }
    ).length,
    0,
    "Already observed reset is deduplicated"
);
assertEqual(
    UsageFormat.buildUsageNotificationEvents(
        resetPrevious,
        notificationSnapshot(50, 100, 50, 100, 30),
        {
            ...notificationDefaults,
            notifyAllWeeklyResets: true,
            enableFiveHourLowNotifications: false,
            enableWeeklyLowNotifications: false
        }
    ).length,
    0,
    "Reset timestamp jitter cannot create a refresh notification"
);

const timestamp24h = UsageFormat.formatTimestamp(1700000000, true);
if (/AM|PM/.test(timestamp24h) || !/:/.test(timestamp24h)) {
    throw new Error(`Expected system-local 24-hour timestamp, got ${timestamp24h}`);
}
assertEqual(
    UsageFormat.formatExpiryCountdown(1000 + 10 * 86400 + 5 * 3600 + 59 * 60, 1000),
    "~10d5h",
    "Expiry countdown days and hours"
);
assertEqual(
    UsageFormat.formatExpiryCountdown(1000 + 23 * 3600 + 59 * 60, 1000),
    "~23h",
    "Expiry countdown under one day"
);
assertEqual(
    UsageFormat.formatExpiryCountdown(1000 - 1, 1000),
    "~0h",
    "Expired countdown"
);
assertEqual(
    UsageFormat.formatExpiryCountdown(null, 1000),
    null,
    "Invalid expiry countdown"
);
const noResetDisplay = UsageFormat.buildResetCreditDisplay(
    {
        availableResetCount: 0,
        nextResetExpiresAt: 1000 + 10 * 86400
    },
    true,
    1000
);
assertEqual(noResetDisplay.count, "0", "No reset count stays visible");
assertEqual(
    noResetDisplay.suffix,
    null,
    "No reset count has no expiry suffix"
);
assertEqual(
    noResetDisplay.expiresAt,
    null,
    "No reset count has no expiry timestamp"
);
const resetDisplay = UsageFormat.buildResetCreditDisplay(
    {
        availableResetCount: 1,
        nextResetExpiresAt: 1000 + 10 * 86400 + 5 * 3600
    },
    true,
    1000
);
assertEqual(resetDisplay.count, "1", "Available reset count is formatted");
if (!resetDisplay.suffix || !/\(~10d5h\)$/.test(resetDisplay.suffix)) {
    throw new Error(`Expected expiry suffix with countdown, got ${resetDisplay.suffix}`);
}
assertEqual(
    resetDisplay.expiresAt,
    1000 + 10 * 86400 + 5 * 3600,
    "Available reset keeps expiry timestamp"
);
const selectedReset = UsageFormat.buildResetCreditConfirmation(
    {
        availableResetCount: 2,
        nextResetExpiresAt: 1000 + 8 * 86400,
        resetCredits: [
            { id: "reset-later", expiresAt: 1000 + 8 * 86400 },
            { id: "reset-next", expiresAt: 1000 + 2 * 86400 }
        ]
    },
    true,
    1000
);
assertEqual(selectedReset.available, true, "Available reset opens confirmation");
assertEqual(selectedReset.count, "2", "Confirmation shows available reset count");
assertEqual(selectedReset.creditId, "reset-next", "Confirmation selects earliest expiry");
assertEqual(
    selectedReset.expiresAt,
    1000 + 2 * 86400,
    "Confirmation keeps selected credit expiry"
);
if (!selectedReset.expiryText || !/\(~2d0h\)$/.test(selectedReset.expiryText)) {
    throw new Error(`Expected selected reset expiry, got ${selectedReset.expiryText}`);
}
const countOnlyReset = UsageFormat.buildResetCreditConfirmation(
    { availableResetCount: 1, resetCredits: null },
    true,
    1000
);
assertEqual(countOnlyReset.available, true, "Count-only reset still opens confirmation");
assertEqual(countOnlyReset.creditId, null, "Count-only reset omits credit ID");
assertEqual(countOnlyReset.expiryText, null, "Count-only reset shows no unknown expiry");
assertEqual(
    UsageFormat.buildResetCreditConfirmation(
        { availableResetCount: 0, resetCredits: [] },
        true,
        1000
    ).available,
    false,
    "Zero reset count stays non-reactive"
);
for (const outcome of ["reset", "alreadyRedeemed", "nothingToReset", "noCredit"]) {
    const feedback = UsageFormat.buildResetConsumeFeedback(outcome);
    if (!feedback || !feedback.title || !feedback.description) {
        throw new Error(`Missing user feedback for reset outcome ${outcome}`);
    }
}
assertEqual(
    UsageFormat.buildResetConsumeFeedback("unexpected"),
    null,
    "Unexpected reset outcome is not treated as success"
);
assertEqual(
    UsageFormat.formatRelativeTime(1000, 1000),
    "just now",
    "Current relative timestamp"
);
assertEqual(
    UsageFormat.formatRelativeTime(1000, 1008.9),
    "8s ago",
    "Second-level relative timestamp"
);
assertEqual(
    UsageFormat.formatRelativeTime(1000, 1120),
    "2m ago",
    "Minute-level relative timestamp"
);
assertEqual(
    UsageFormat.formatRelativeTime(1000, 8200),
    "2h ago",
    "Hour-level relative timestamp"
);
assertEqual(
    UsageFormat.formatRelativeTime(1000, 173800),
    "2d ago",
    "Day-level relative timestamp"
);
assertEqual(
    UsageFormat.formatRelativeTime(1000, 999),
    "just now",
    "Future relative timestamp jitter"
);
assertEqual(
    UsageFormat.formatRelativeTime(null, 1000),
    "unknown",
    "Invalid relative timestamp"
);

print("Usage formatting tests passed.");
