/* global imports */
/* exported main */

// SPDX-License-Identifier: GPL-3.0-or-later

const Applet = imports.ui.applet;
const ByteArray = imports.byteArray;
const Settings = imports.ui.settings;
const PopupMenu = imports.ui.popupMenu;
const Tooltips = imports.ui.tooltips;
const Main = imports.ui.main;
const MessageTray = imports.ui.messageTray;
const ModalDialog = imports.ui.modalDialog;
const Dialog = imports.ui.dialog;
const CheckBox = imports.ui.checkBox;
const Mainloop = imports.mainloop;
const Util = imports.misc.util;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const St = imports.gi.St;
const Clutter = imports.gi.Clutter;
const Pango = imports.gi.Pango;
const GdkPixbuf = imports.gi.GdkPixbuf;
const Cairo = imports.cairo;
const Atk = imports.gi.Atk;
const Cinnamon = imports.gi.Cinnamon;

const UsageFormat = require("./usage-format");

const Gettext = imports.gettext;
function _(text) {
    return Gettext.dgettext("z-usage@oss-singularity", text);
}
function _f(text, ...args) {
    return imports.format.format.apply(_(text), args);
}


const UUID = "z-usage@oss-singularity";
const ACCOUNT_LIMIT_ID = "zai";
const ZCODE_PLAN_SOURCE = "zcode-plan";
const ZAI_URL = "https://chat.z.ai/";
const ZAI_USAGE_URL = "https://z.ai/manage-apikey/coding-plan/personal/usage";
const ZAI_API_KEYS_URL = "https://z.ai/manage-apikey/apikey-list";
const ZAI_DOCS_URL = "https://docs.z.ai/devpack/overview";
const PANEL_FONT_SCALE = 0.95;
const PANEL_LABEL_SCALE = 0.79;
const ACTIVITY_TOOLTIP_DELAY_MS = 120;
const LAUNCH_TOOLTIP_DELAY_MS = 420;
const POPUP_ACTION_GRID_WIDTH = 352;
// Cinnamon's one-pixel menu edge brings the visible popup width to 420 px.
const POPUP_WIDTH = 419;
// Cancels Cinnamon's MENU_ANIMATION_OFFSET when set as margin_left during
// the close ease (target x = x - margin_left + OFFSET + margin_right).
const POPUP_RIGHT_PANEL_CLOSE_SLIDE_CANCEL = 12;
// Headroom between the locked viewport and the natural content height: the
// frame is frozen once per open, and content that grows a few pixels after
// the lock (countdown ticks, refresh labels) must not spawn a scrollbar.
const POPUP_VIEWPORT_PAD = 8;
const PANEL_VERTICAL_LABEL_WIDTH = 40;
const POPUP_RIGHT_INSET = 17;
const POPUP_CHART_RIGHT_INSET = 39;
const POPUP_NESTED_CHART_LEFT_SHIFT = 5;
const POPUP_NESTED_CHART_RIGHT_BALANCE = 11;
const POPUP_SCREENSHOT_CORNER_SIZE = 30;
const POPUP_SCREENSHOT_CAMERA_STYLE = "color: rgba(218,222,228,0.48);";
const POPUP_SCREENSHOT_CAMERA_OFFSET_X = -6;
const POPUP_SCREENSHOT_CAMERA_OFFSET_Y = -7;
const ACTIVITY_CHART_BAR_MAX_HEIGHT = 26;
const CREDIT_CONSUMPTION_BASE_FONT_SIZE = 102;
const CREDIT_CONSUMPTION_MIN_FONT_SIZE = 54;
const CREDIT_CONSUMPTION_MARKUP_MODE = "numbers";
// The non-square arrow glyph shifts inside its actor when Cinnamon rotates it.
const POPUP_EXPANDED_RIGHT_INSET = 10;
const QUOTA_RING_SIZE = 52;
const COMPACT_QUOTA_RING_SIZE = 40;
const POPUP_HEADER_RING_LEFT_SHIFT = 13;
const POPUP_RESET_RING_LEFT_SHIFT = 14;
const SPARK_BADGE_COLOR = "#f2a15f";
const RESET_EXPIRY_WARNING_COLOR = "#f2a15f";
const RESET_EXPIRY_CRITICAL_COLOR = "#ff4d8d";
const RESET_EXPIRY_WARNING_SECONDS = 7 * 24 * 60 * 60;
const RESET_EXPIRY_CRITICAL_SECONDS = 24 * 60 * 60;
const RESET_EXPIRY_BREATHING_OPACITY = 150;
const RESET_EXPIRY_BREATHING_DURATION_MS = 1100;
const WEEKLY_WINDOW_MINUTES = 10080;
const WEEKLY_WINDOW_SECONDS = WEEKLY_WINDOW_MINUTES * 60;
const WEEKLY_RESET_HISTORY_VERSION = 1;
const POPUP_HEADING_STYLE = "font-size: 100%; font-weight: bold;";
const AUTH_REQUIRED_TITLE = _("No Z.ai API key found");
const AUTH_REQUIRED_DESCRIPTION = _(
    "Add a Z.ai API key with Coding Plan access in the applet settings, then choose Refresh now."
);

// Only our own menu is specialized. Cinnamon retains ownership of its
// menu stack, focus handling, positioning and animation completion.
class UsagePopupMenu extends Applet.AppletPopupMenu {
    constructor(owner, orientation) {
        super(owner, orientation);
        this._usageOwner = owner;
        if (this._boxWrapper) this._boxWrapper.clip_to_allocation = false;
        this._content = new PopupMenu.PopupMenuSection();
        super.addMenuItem(this._content);
        // Keep the native section's menu signals and keyboard navigation, but
        // let its contents scroll when a small monitor or large font needs it.
        this.box.remove_child(this._content.actor);
        this._scroll = new St.ScrollView({ overlay_scrollbars: true });
        this._scroll.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
        this._scroll._delegate = this._content;
        this._scroll.add_actor(this._content.actor);
        // Pinned header (title, updated stamp, quota rings) and pinned action
        // footer: both live outside the scroll view so they stay visible while
        // the content scrolls behind them.
        this._header = new St.BoxLayout({ vertical: true });
        this.box.add_child(this._header);
        this.box.add_child(this._scroll);
        this._footer = new St.BoxLayout({ vertical: true });
        this.box.add_child(this._footer);
        this._focusSignalId = global.stage.connect("notify::key-focus", () => {
            this._revealFocus();
        });
    }

    _boxAllocate(actor, box, flags) {
        this.box.allocate(box, flags);
        const corner = this._usageOwner && this._usageOwner._screenshotButton;
        if (!corner || corner.is_finalized()) return;
        const cornerBox = new Clutter.ActorBox();
        cornerBox.x1 = box.x1;
        cornerBox.y1 = box.y1;
        cornerBox.x2 = box.x1 + POPUP_SCREENSHOT_CORNER_SIZE;
        cornerBox.y2 = box.y1 + POPUP_SCREENSHOT_CORNER_SIZE;
        corner.allocate(cornerBox, flags);
    }

    _revealFocus() {
        if (!this.isOpen || this._focusRevealId) return;
        this._focusRevealId = Mainloop.idle_add(() => {
            this._focusRevealId = 0;
            if (!this.isOpen) return GLib.SOURCE_REMOVE;
            const focus = global.stage.get_key_focus();
            if (!focus || !this._content.actor.contains(focus)) return GLib.SOURCE_REMOVE;
            const [, top] = this._scroll.get_transformed_position();
            const [, height] = this._scroll.get_transformed_size();
            const [, focusTop] = focus.get_transformed_position();
            const [, focusHeight] = focus.get_transformed_size();
            const adjustment = this._scroll.get_vscroll_bar().get_adjustment();
            if (focusTop < top) adjustment.set_value(adjustment.get_value() + focusTop - top);
            else if (focusTop + focusHeight > top + height) {
                adjustment.set_value(adjustment.get_value() + focusTop + focusHeight - top - height);
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    destroy() {
        global.stage.disconnect(this._focusSignalId);
        this._focusSignalId = 0;
        if (this._focusRevealId) Mainloop.source_remove(this._focusRevealId);
        this._focusRevealId = 0;
        super.destroy();
    }

    addMenuItem(item, position) {
        if (this._content) this._content.addMenuItem(item, position);
        else super.addMenuItem(item, position);
    }

    removeAll() {
        if (this._content) this._content.removeAll();
        else super.removeAll();
    }

    open(animate) {
        const owner = this._usageOwner;
        const freshOpen = !this.isOpen;
        if (this._closePositionFrozen) {
            // A leftover close freeze (the close animation was interrupted):
            // drop it so this open positions from the live geometry again.
            delete this._calculatePosition;
            this._closePositionFrozen = null;
        }
        if (this._closeEaseRestore) {
            delete this.actor.ease;
            this._closeEaseRestore = false;
        }
        if (freshOpen && owner._creditsFit) {
            // Re-arm the one-shot credit font fit for this open cycle; the
            // edge sync disarms it again once the alignment converges.
            owner._creditsFit.setArmed(true);
        }
        owner._applyPopupWidth();
        if (freshOpen) {
            // The default expansion on open must not yank the scroll position
            // away from the header; auto-scrolling is for manual toggles only.
            owner._suppressSectionAutoScroll = true;
            try {
                for (const section of owner._limitSections) {
                    if (section._usageUserToggled) continue;
                    section.setExpanded(owner._defaultSectionExpanded(section.limit));
                }
            } finally {
                owner._suppressSectionAutoScroll = false;
            }
        }
        // Clamp BEFORE the base positioning pass: Cinnamon places the popup
        // from its preferred height, so a late clamp would leave the top of
        // a taller-than-monitor popup off-screen.
        owner._popupFrameHeight = 0;
        owner._clampPopupHeight(owner.actor);
        super.open(animate);
        owner._lockPopupLayoutWidth();
        // No post-open clamp: the pre-open clamp already fixed the final
        // height, and a post-position resize is the visible jump.
        if (freshOpen && this._scroll && this._scroll.get_vscroll_bar) {
            // A fresh open always starts at the header, whatever earlier
            // rebuilds or the previous session left scrolled.
            this._scroll.get_vscroll_bar().get_adjustment().set_value(0);
        }
    }

    close(animate) {
        const owner = this._usageOwner;
        if (owner._isRightPanel && this.isOpen) {
            owner._rightPanelPopupLockedWidth = owner._popupWidth();
            owner._normalizeRightPanelPopupCloseWidth();
        }
        super.close(animate);
    }
}

class ZUsageApplet extends Applet.Applet {
    constructor(metadata, orientation, panelHeight, instanceId) {
        super(orientation, panelHeight, instanceId);

        this.metadata = metadata;
        this._isVertical = this._orientationIsVertical(orientation);
        this._panelThickness = panelHeight;
        this.setAllowedLayout(Applet.AllowedLayout.BOTH);

        this._destroyed = false;
        this._timeoutId = 0;
        this._countdownTimeoutId = 0;
        this._countdownWidgets = [];
        this._resetExpiryBreathingLabels = [];
        this._quotaWidgets = [];
        this._activityTooltips = [];
        this._popupRightInsetRows = [];
        this._activityCharts = [];
        this._creditsFit = null;
        this._lastChartWidths = [];
        this._actionEdgeSyncQueuedId = 0;
        this._isRightPanel = this._orientationIsRight(orientation);
        this._rightPanelPopupCloseInProgress = false;
        this._rightPanelPopupCloseSeq = 0;
        this._rightPanelPopupLockedWidth = 0;
        this._rightPanelMenuBaseMarginRight = 0;
        this._refreshConfirmationTimeoutId = 0;
        this._refreshSpinnerTimeoutId = 0;
        this._usageProcess = null;
        this._weeklyResetHistory = {};
        this._weeklyResetHistoryDirty = false;
        this._weeklyResetHistoryReady = false;
        this._weeklyResetHistorySavePromise = null;
        this._menuRebuildTimeoutId = 0;
        this._rightPanelPopupClosedId = 0;
        this._rightPanelPopupOpenStateChangedId = 0;
        this._refreshButton = null;
        this._refreshButtonIcon = null;
        this._refreshButtonLabel = null;
        this._refreshSpinnerLabel = null;
        this._updatedLabel = null;
        this._screenshotButton = null;
        this._screenshotButtonLabel = null;
        this._screenshotContextMenu = null;
        this._screenshotCopyTimeoutId = 0;
        this._screenshotResetTimeoutId = 0;
        this._screenshotTempFile = null;
        this._refreshSpinnerFrame = 0;
        this._historySubmenus = [];
        this._limitSections = [];
        this._actionFrame = null;
        this._actionWidthFrame = null;
        this._actionColumn = null;
        this._actionColumnWidth = POPUP_ACTION_GRID_WIDTH;
        this._installHelpDialog = null;
        this._refreshQueued = false;
        this._refreshConfirmed = false;
        this._busy = false;
        this._cancellable = null;
        this._snapshot = null;
        this._lastError = null;
        this._authenticationRequired = false;
        this._rightPanelMenuStyleBase = null;
        this._clockSettings = null;
        this._clockChangedId = 0;
        this._use24HourClock = true;

        this._loadWeeklyResetHistory();
        this._setDefaults();
        this._bindSystemClockFormat();
        this._bindSettings(instanceId);
        this._buildUi();
        this._buildMenu(orientation);
        this._restartCountdownTimer();
        this._refreshUsage();
        this._restartTimer();
    }

    _setDefaults() {
        this.refreshInterval = 3;
        this.activityBucketMinutes = "60";
        this.apiKey = "";
        this.showPanelIcon = true;
        this.showWindowLabels = true;
        this.showModelSpecificLimits = true;
        this.showZcodePlanQuotas = true;
        this.expandZcodePlanSections = true;
        this.showModelLimitsInPanel = false;
        this.showCreditsInPanel = false;
        this.showWeeklyWithFiveHour = true;
        this.fontSize = 100;
        this.separator = "·";
        this.showColors = true;
        this.panelTextColor = "#ffffff";
        this.showPanelThresholdColors = true;
        this.normalColor = "#62c7f5";
        this.warningColor = "#f6d32d";
        this.criticalColor = RESET_EXPIRY_CRITICAL_COLOR;
        this.warningRemaining = 25;
        this.criticalRemaining = 10;
        this.notifyAllWeeklyResets = true;
        this.notifyCodexWeeklyReset = true;
        this.notifySparkWeeklyReset = true;
        this.enableFiveHourLowNotifications = true;
        this.fiveHourWarningRemaining = 25;
        this.fiveHourCriticalRemaining = 10;
        this.enableWeeklyLowNotifications = true;
        this.weeklyWarningRemaining = 25;
        this.weeklyCriticalRemaining = 10;
    }

    _bindSettings(instanceId) {
        this.settings = new Settings.AppletSettings(this, UUID, instanceId);
        const layoutChanged = this._onLayoutSettingChanged.bind(this);
        const styleChanged = this._onStyleSettingChanged.bind(this);

        this.settings.bind(
            "refresh-interval",
            "refreshInterval",
            this._onIntervalChanged.bind(this)
        );
        this.settings.bind(
            "activity-bucket-minutes",
            "activityBucketMinutes",
            this._refreshUsage.bind(this)
        );
        this.settings.bind("api-key", "apiKey", this._refreshUsage.bind(this));
        this.settings.bind("show-panel-icon", "showPanelIcon", layoutChanged);
        this.settings.bind("show-window-labels", "showWindowLabels", layoutChanged);
        this.settings.bind("show-model-specific-limits", "showModelSpecificLimits", this._onModelVisibilityChanged.bind(this));
        this.settings.bind("show-zcode-plan-quotas", "showZcodePlanQuotas", this._onModelVisibilityChanged.bind(this));
        this.settings.bind("expand-zcode-plan-sections", "expandZcodePlanSections", this._onModelVisibilityChanged.bind(this));
        this.settings.bind(
            "show-model-limits-in-panel",
            "showModelLimitsInPanel",
            layoutChanged
        );
        this.settings.bind(
            "show-credits-in-panel",
            "showCreditsInPanel",
            layoutChanged
        );
        this.settings.bind(
            "show-weekly-with-five-hour",
            "showWeeklyWithFiveHour",
            layoutChanged
        );
        this.settings.bind("font-size", "fontSize", styleChanged);
        this.settings.bind("separator", "separator", layoutChanged);
        this.settings.bind("show-colors", "showColors", styleChanged);
        this.settings.bind("panel-text-color", "panelTextColor", styleChanged);
        this.settings.bind("show-panel-threshold-colors", "showPanelThresholdColors", styleChanged);
        this.settings.bind("normal-color", "normalColor", styleChanged);
        this.settings.bind("warning-color", "warningColor", styleChanged);
        this.settings.bind("critical-color", "criticalColor", styleChanged);
        this.settings.bind("warning-remaining", "warningRemaining", styleChanged);
        this.settings.bind("critical-remaining", "criticalRemaining", styleChanged);
        this.settings.bind(
            "notify-all-weekly-resets",
            "notifyAllWeeklyResets"
        );
        this.settings.bind(
            "notify-codex-weekly-reset",
            "notifyCodexWeeklyReset"
        );
        this.settings.bind(
            "notify-spark-weekly-reset",
            "notifySparkWeeklyReset"
        );
        this.settings.bind(
            "enable-five-hour-low-notifications",
            "enableFiveHourLowNotifications"
        );
        this.settings.bind(
            "five-hour-warning-remaining",
            "fiveHourWarningRemaining",
            () => this._validateNotificationThresholds("five-hour", "warning")
        );
        this.settings.bind(
            "five-hour-critical-remaining",
            "fiveHourCriticalRemaining",
            () => this._validateNotificationThresholds("five-hour", "critical")
        );
        this.settings.bind(
            "enable-weekly-low-notifications",
            "enableWeeklyLowNotifications"
        );
        this.settings.bind(
            "weekly-warning-remaining",
            "weeklyWarningRemaining",
            () => this._validateNotificationThresholds("weekly", "warning")
        );
        this.settings.bind(
            "weekly-critical-remaining",
            "weeklyCriticalRemaining",
            () => this._validateNotificationThresholds("weekly", "critical")
        );
    }

    _validateNotificationThresholds(period, changedThreshold) {
        const weekly = period === "weekly";
        const warningProperty = weekly
            ? "weeklyWarningRemaining"
            : "fiveHourWarningRemaining";
        const criticalProperty = weekly
            ? "weeklyCriticalRemaining"
            : "fiveHourCriticalRemaining";
        const warningKey = weekly
            ? "weekly-warning-remaining"
            : "five-hour-warning-remaining";
        const criticalKey = weekly
            ? "weekly-critical-remaining"
            : "five-hour-critical-remaining";
        const thresholds = UsageFormat.normalizeNotificationThresholds(
            this[warningProperty],
            this[criticalProperty]
        );
        if (thresholds.valid) return;

        if (changedThreshold === "warning") {
            this.settings.setValue(
                criticalKey,
                Math.max(0, Number(this[warningProperty]) - 1)
            );
        } else {
            this.settings.setValue(
                warningKey,
                Math.min(100, Number(this[criticalProperty]) + 1)
            );
        }
    }

    _buildUi() {
        this.actor.style = this._isVertical
            ? "padding-left: 0px; padding-right: 0px;"
            : null;
        this._root = new St.BoxLayout({
            reactive: true,
            vertical: this._isVertical
        });
        this.actor.add_child(this._root);
        this._syncPanelThickness();
        this._rebuildPanel();
    }

    _bindSystemClockFormat() {
        try {
            this._clockSettings = new Gio.Settings({
                schema_id: "org.cinnamon.desktop.interface"
            });
            this._use24HourClock = this._clockSettings.get_boolean("clock-use-24h");
            this._popupTextScale = this._clockSettings.get_double("text-scaling-factor");
            this._textScaleChangedId = this._clockSettings.connect("changed::text-scaling-factor", () => {
                this._popupTextScale = this._clockSettings.get_double("text-scaling-factor");
                this._rightPanelPopupLockedWidth = 0;
                this._rebuildMenu();
            });
            this._animationsEnabled = this._clockSettings.get_boolean("enable-animations");
            this._animationsChangedId = this._clockSettings.connect("changed::enable-animations", () => {
                this._animationsEnabled = this._clockSettings.get_boolean("enable-animations");
                this._stopResetExpiryBreathing();
                if (this.menu && this.menu.isOpen) this._startResetExpiryBreathing();
            });
            this._clockChangedId = this._clockSettings.connect(
                "changed::clock-use-24h",
                () => {
                    this._use24HourClock = this._clockSettings.get_boolean("clock-use-24h");
                    this._rebuildMenu();
                }
            );
        } catch (error) {
            this._clockSettings = null;
            this._clockChangedId = 0;
            this._use24HourClock = true;
            global.logWarning(`${UUID}: could not read the Cinnamon clock format: ${error}`);
        }
    }

    _buildMenu(orientation) {
        this.menuManager = new PopupMenu.PopupMenuManager(this);
        this.menu = new UsagePopupMenu(this, orientation);
        this.menuManager.addMenu(this.menu);
        this._rightPanelMenuStyleBase = this.menu.actor.get_style() || "";
        this._rightPanelMenuBaseMarginRight = this.menu.actor.margin_right;
        this._rightPanelPopupOpenStateChangedId = this.menu.connect(
            "open-state-changed",
            (_menu, open) => {
                if (open) {
                    this._lockPopupLayoutWidth();
                    this._startResetExpiryBreathing();
                } else {
                    this._stopResetExpiryBreathing();
                    this._rightPanelPopupLockedWidth = 0;
                }
            }
        );
        this._rightPanelPopupClosedId = this.menu.connect("menu-animated-closed", () => {
            this.menu.actor.translation_x = 0;
            if (this.menu._closeEaseRestore) {
                delete this.menu.actor.ease;
                this.menu._closeEaseRestore = false;
            }
            this.menu.actor.margin_right = this._rightPanelMenuBaseMarginRight;
            this._applyPopupWidth();
            if (this.menu._closePositionFrozen) {
                delete this.menu._calculatePosition;
                this.menu._closePositionFrozen = null;
            }
        });
        this._rebuildMenu();
    }

    _clearActor(actor) {
        for (const child of actor.get_children()) {
            actor.remove_child(child);
            child.destroy();
        }
    }

    _setActionColumnWidth(width) {
        if (!this._actionWidthFrame) return;
        if (width > 0) {
            this._actionWidthFrame.set_width(width);
            if (this._actionColumn) this._actionColumn.set_width(width);
            this._actionWidthFrame.min_width = width;
            this._actionWidthFrame.natural_width = width;
            this._actionWidthFrame.min_width_set = true;
            this._actionWidthFrame.natural_width_set = true;
            return;
        }
        this._actionWidthFrame.set_width(-1);
        if (this._actionColumn) this._actionColumn.set_width(-1);
        this._actionWidthFrame.min_width_set = false;
        this._actionWidthFrame.natural_width_set = false;
    }

    _syncActionColumnCentering() {
        if (
            !this.menu ||
            !this.menu.isOpen ||
            !this._actionWidthFrame ||
            this._actionWidthFrame.is_finalized() ||
            this.menu.actor.is_finalized() ||
            !this._actionWidthFrame.get_stage()
        ) return;
        this._actionWidthFrame.translation_x = 0;
        const [menuX] = this.menu.actor.get_transformed_position();
        const [menuWidth] = this.menu.actor.get_transformed_size();
        const [gridX] = this._actionWidthFrame.get_transformed_position();
        const [gridWidth] = this._actionWidthFrame.get_transformed_size();
        // Transformed coordinates can differ by tiny float errors between
        // opening and rebuilding. Snap to pixels before the half-width math
        // so an odd popup width cannot flip the translation by one pixel.
        const menuCenter = Math.round(menuX) + Math.round(menuWidth) / 2;
        const gridCenter = Math.round(gridX) + Math.round(gridWidth) / 2;
        this._actionWidthFrame.translation_x = Math.round(menuCenter - gridCenter);
        this._syncContentRightEdges();
    }

    // Allocation notifications fire mid-relayout, when the actor tree holds
    // mixed old/new allocations. Syncing from those reads can latch a bogus
    // ring/grid offset with no later correction (the wild-scroll ring shift).
    // Queue the work for an idle instead: one run per frame, only on the
    // settled layout, coalescing allocation storms.
    _queueActionEdgeSync() {
        if (typeof Mainloop === "undefined" || this._actionEdgeSyncQueuedId) return;
        this._actionEdgeSyncQueuedId = Mainloop.idle_add(() => {
            this._actionEdgeSyncQueuedId = 0;
            if (this._destroyed) return GLib.SOURCE_REMOVE;
            this._syncActionColumnCentering();
            return GLib.SOURCE_REMOVE;
        });
    }

    _syncContentRightEdges() {
        if (!this.menu || !this.menu.isOpen) return;
        if (!this._actionWidthFrame) return;
        if (this._actionWidthFrame.is_finalized() || this.menu.actor.is_finalized()) return;
        // Anchor: the button grid's right edge - rings and charts close
        // flush with it (the original design).
        const [gridX] = this._actionWidthFrame.get_transformed_position();
        const [gridWidth] = this._actionWidthFrame.get_transformed_size();
        if (gridWidth <= 0) return;
        const right = Math.round(gridX + gridWidth);
        const rings = (this._countdownWidgets || []).map(entry => entry.actor);
        if (this._headerRings) rings.push(this._headerRings);
        for (const actor of rings) {
            if (actor.is_finalized()) continue;
            const [width] = actor.get_transformed_size();
            if (width <= 0) continue;
            // Per-ring absolute alignment: the painted right edge (the glow
            // ends one pixel inside) goes to the anchor, so repeated syncs
            // converge instead of drifting. A delta beyond the popup width
            // can only come from a mid-relayout read - ignore it instead of
            // latching a shift that flings the rings toward the panel.
            const current = actor.get_transformed_position()[0] + width - 1;
            const delta = right - Math.round(current);
            if (Math.abs(delta) > POPUP_WIDTH) continue;
            actor.translation_x += delta;
        }
        const chartLimit = this._popupWidth() + 96;
        (this._activityCharts || []).forEach(({ chart }, index) => {
            if (chart.is_finalized()) return;
            const [x] = chart.get_transformed_position();
            const padding = chart.get_theme_node().get_padding(St.Side.RIGHT);
            const width = Math.max(1, Math.round(right - x + padding));
            // Charts span from their row to the grid edge; anything wider is
            // a stale read (mid-scroll or mid-relayout), never a real width.
            if (width > chartLimit) return;
            if (!chart.min_width_set || chart.min_width !== width) {
                this._forceActorWidth(chart, width);
                this._lastChartWidths[index] = width;
            }
        });
        // The credits consumption line is placed by its own font-fit pass
        // (_fitCreditConsumptionRow): the text starts in the normal column
        // and the font shrinks until the line ends at the grid anchor. No
        // translation here - translating the row moved its start off the
        // text column and fought the fit pass.
    }

    _rebuildPanel() {
        if (!this._root) return;
        this._clearActor(this._root);
        const fontSize = this._panelFontSize();

        let panelLimits = this._filterModelLimits(this._snapshot ? this._snapshot.limits : []);
        if (!this.showModelLimitsInPanel) {
            const accountLimits = panelLimits.filter(limit => limit.id === ACCOUNT_LIMIT_ID);
            if (accountLimits.length > 0) panelLimits = accountLimits;
        }
        const allSummaries = UsageFormat.summarizeWindows(panelLimits);
        const summaries = UsageFormat.selectPanelWindows(
            allSummaries,
            this.showWeeklyWithFiveHour
        );

        if (summaries.length === 0) {
            if (this.showPanelIcon) this._root.add_child(this._createPanelIcon());
            const placeholder = new St.Label({
                text: this._busy ? "…" : "--",
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
                style: `font-size: ${fontSize}%; color: ${this.panelTextColor};`
            });
            this._root.add_child(placeholder);
        } else {
            summaries.forEach((summary, index) => {
                if (!this._isVertical && index > 0 && this.separator) {
                    this._root.add_child(new St.Label({
                        text: this.separator,
                        y_align: Clutter.ActorAlign.CENTER,
                        style: `padding-left: 4px; padding-right: 4px; color: ${this.panelTextColor};`
                    }));
                }
                this._root.add_child(
                    this._createWindowActor(summary, this.showPanelIcon)
                );
            });
        }

        const panelCredits = this._panelCreditsValue();
        if (panelCredits !== null) {
            if (this.separator && !this._isVertical) {
                this._root.add_child(new St.Label({
                    text: this.separator,
                    y_align: Clutter.ActorAlign.CENTER,
                    style: `padding-left: 4px; padding-right: 4px; color: ${this.panelTextColor};`
                }));
            }
            this._root.add_child(this._createPanelCreditsActor(panelCredits));
        }

        this._updateTooltip(summaries);
    }

    _filterModelLimits(limits) {
        let list = Array.from(limits || []);
        if (this.showZcodePlanQuotas === false) {
            list = list.filter(limit => limit.source !== ZCODE_PLAN_SOURCE);
        }
        return this.showModelSpecificLimits === false
            ? list.filter(limit => (limit.id || ACCOUNT_LIMIT_ID) === ACCOUNT_LIMIT_ID)
            : list;
    }

    _defaultSectionExpanded(limit) {
        return this.expandZcodePlanSections === true ||
            UsageFormat.hasQuotaUsage(limit.windows);
    }

    _modelBadge(limit) {
        if (!limit || limit.limitId === ACCOUNT_LIMIT_ID || limit.id === ACCOUNT_LIMIT_ID) return null;
        const label = String(limit.limitLabel || limit.label || "");
        if (/global/i.test(label)) return "G";
        if (/start/i.test(label)) return "S";
        return "M";
    }

    _modelBadgeStyle(fontPercent) {
        return [
            `font-size: ${fontPercent}%`,
            "font-weight: bold",
            "font-style: italic",
            `color: ${SPARK_BADGE_COLOR}`,
            "background-color: #25272d",
            "border: 1px solid rgba(242,161,95,0.92)",
            "border-radius: 8px",
            "padding: 0 3px"
        ].join("; ") + ";";
    }

    _createPanelIcon(limit = null, size = 20, menu = false) {
        const iconPath = `${this.metadata.path}/icons/usage-white.png`;
        const icon = new St.Icon({
            gicon: new Gio.FileIcon({ file: Gio.File.new_for_path(iconPath) }),
            icon_size: limit ? size + 2 : size,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER
        });
        icon.style = "padding-right: 1px;";
        if (menu) {
            icon.add_effect_with_name("menu-foreground", new Clutter.ColorizeEffect({
                tint: this._menuForeground()
            }));
        }
        const badgeText = this._modelBadge(limit);
        if (!badgeText) return icon;

        const actor = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            width: size + 6,
            height: size + 2
        });
        const badge = new St.Label({
            text: badgeText,
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.START
        });
        badge.style = this._modelBadgeStyle(45);
        badge.translation_x = -2;
        actor.add_child(icon);
        actor.add_child(badge);
        return actor;
    }

    _createWindowActor(summary, showIcon) {
        const fontSize = this._panelFontSize();
        const labelFontSize = Math.max(60, Math.round(fontSize * PANEL_LABEL_SCALE));
        const actor = new St.BoxLayout({
            reactive: false,
            vertical: true
        });
        actor.x_align = Clutter.ActorAlign.CENTER;
        actor.y_align = Clutter.ActorAlign.CENTER;
        actor.style = this._isVertical ? "padding: 1px 0px;" : "";

        if (this.showWindowLabels) {
            const labelRow = new St.BoxLayout({
                reactive: false,
                vertical: false,
                x_align: Clutter.ActorAlign.CENTER
            });
            if (showIcon) {
                labelRow.add_child(this._createPanelIcon(summary));
                if (this._isVertical) labelRow.style = `min-width: ${PANEL_VERTICAL_LABEL_WIDTH}px;`;
            }
            const label = new St.Label({
                text: UsageFormat.formatDuration(summary.durationMinutes),
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
                style: `font-size: ${labelFontSize}%; color: ${this.panelTextColor};`
            });
            label.clutter_text.set_line_alignment(Pango.Alignment.CENTER);
            labelRow.add_child(label);
            actor.add_child(labelRow);
        } else if (showIcon) {
            actor.add_child(this._createPanelIcon(summary));
        }

        const value = new St.Label({
            text: UsageFormat.formatPanelPercent(summary.remainingPercent),
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            style: `min-width: 32px; font-size: ${fontSize}%; color: ${this._panelRemainingColor(summary.remainingPercent)};`
        });
        value.clutter_text.set_line_alignment(Pango.Alignment.CENTER);
        actor.add_child(value);
        return actor;
    }

    _panelCreditsValue() {
        const credits = this._snapshot ? this._snapshot.credits : null;
        if (!this.showCreditsInPanel || !credits) return null;
        if (credits.unlimited) return "∞";
        return UsageFormat.formatCreditNumber(credits.balance);
    }

    _createPanelCreditsActor(value) {
        const fontSize = this._panelFontSize();
        const labelFontSize = Math.max(60, Math.round(fontSize * PANEL_LABEL_SCALE));
        const actor = new St.BoxLayout({
            reactive: false,
            vertical: true
        });
        actor.x_align = Clutter.ActorAlign.CENTER;
        actor.y_align = Clutter.ActorAlign.CENTER;
        actor.style = this._isVertical ? "padding: 1px 0px;" : "";

        const labelRow = new St.BoxLayout({
            reactive: false,
            vertical: false,
            x_align: Clutter.ActorAlign.CENTER
        });
        if (this.showPanelIcon) {
            labelRow.add_child(this._createPanelIcon());
            if (this._isVertical) labelRow.style = `min-width: ${PANEL_VERTICAL_LABEL_WIDTH}px;`;
        }
        const label = new St.Label({
            text: _("AIC"),
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            style: `font-size: ${labelFontSize}%; color: ${this.panelTextColor};`
        });
        label.clutter_text.set_line_alignment(Pango.Alignment.CENTER);
        labelRow.add_child(label);
        actor.add_child(labelRow);

        const balance = new St.Label({
            text: value,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            style: `font-size: ${fontSize}%; color: ${this.panelTextColor};`
        });
        balance.clutter_text.set_line_alignment(Pango.Alignment.CENTER);
        if (!this._isVertical) balance.translation_y = 1;
        actor.add_child(balance);
        actor.accessible_name = _f("Credits: %s", value);
        return actor;
    }

    _panelFontSize() {
        return Math.round(this.fontSize * PANEL_FONT_SCALE);
    }

    _updateTooltip(summaries) {
        let text = this.metadata.name;
        const limits = this._filterModelLimits(this._snapshot ? this._snapshot.limits : []);
        if (limits.length > 0) {
            const showLimitLabels = limits.length > 1;
            const values = [];
            for (const limit of limits) {
                for (const window of limit.windows || []) {
                    const duration = UsageFormat.formatDuration(window.durationMinutes);
                    const prefix = showLimitLabels ? `${limit.label || limit.id} ` : "";
                    values.push(
                        _f(
                            "%s%s: %s remaining",
                            prefix,
                            duration,
                            UsageFormat.formatPercent(window.remainingPercent)
                        )
                    );
                }
            }
            if (values.length > 0) text = values.join("\n");
        } else if (summaries.length > 0) {
            text = summaries.map(summary => {
                const duration = UsageFormat.formatDuration(summary.durationMinutes);
                return _f(
                    "%s: %s remaining",
                    duration,
                    UsageFormat.formatPercent(summary.remainingPercent)
                );
            }).join(" • ");
        }
        const panelCredits = this._panelCreditsValue();
        if (panelCredits !== null) text += `\n${_f("Credits: %s", panelCredits)}`;
        if (this._lastError) text += `\n${this._lastError}`;
        this.set_applet_tooltip(text);
    }

    _menuForeground() {
        return this.menu.actor.get_theme_node().get_foreground_color();
    }

    _menuColor(alpha = 1) {
        const color = this._menuForeground();
        return `rgba(${color.red},${color.green},${color.blue},${alpha})`;
    }

    _brightenColor(value, amount = 0.26) {
        const [valid, color] = Clutter.Color.from_string(String(value || ""));
        if (!valid) return String(value || "");
        const brighten = channel => Math.round(channel + (255 - channel) * amount);
        return `rgb(${brighten(color.red)},${brighten(color.green)},${brighten(color.blue)})`;
    }

    _panelRemainingColor(remaining) {
        if (!this.showPanelThresholdColors || !Number.isFinite(remaining)) return this.panelTextColor;
        if (remaining <= this.criticalRemaining) return this.criticalColor;
        if (remaining <= this.warningRemaining) return this.warningColor;
        return this.panelTextColor;
    }

    _remainingColor(remaining) {
        if (!this.showColors || !Number.isFinite(remaining)) return this.normalColor;
        if (remaining <= this.criticalRemaining) return this.criticalColor;
        if (remaining <= this.warningRemaining) return this.warningColor;
        return this.normalColor;
    }

    _resetExpiryColor(expiresAt) {
        const expiry = Number(expiresAt);
        if (!Number.isFinite(expiry) || expiry <= 0) return null;
        const remaining = expiry - GLib.get_real_time() / 1000000;
        if (remaining <= RESET_EXPIRY_CRITICAL_SECONDS) {
            return RESET_EXPIRY_CRITICAL_COLOR;
        }
        if (remaining <= RESET_EXPIRY_WARNING_SECONDS) {
            return RESET_EXPIRY_WARNING_COLOR;
        }
        return null;
    }

    _startResetExpiryBreathing() {
        if (this._animationsEnabled === false || !St.Settings.get().animations_enabled) {
            this._stopResetExpiryBreathing();
            return;
        }
        for (const label of this._resetExpiryBreathingLabels) {
            if (!label || !label.mapped || label._resetExpiryBreathing) continue;
            label._resetExpiryBreathing = true;
            label.opacity = 255;
            label.ease({
                opacity: RESET_EXPIRY_BREATHING_OPACITY,
                duration: RESET_EXPIRY_BREATHING_DURATION_MS,
                mode: Clutter.AnimationMode.EASE_IN_OUT_QUAD,
                repeatCount: -1,
                autoReverse: true,
                animationRequired: false
            });
        }
    }

    _stopResetExpiryBreathing() {
        for (const label of this._resetExpiryBreathingLabels) {
            if (!label) continue;
            label.remove_transition("opacity");
            label.opacity = 255;
            label._resetExpiryBreathing = false;
        }
    }

    _rebuildMenu() {
        if (!this.menu) return;
        const wasOpen = this.menu.isOpen;
        const expandedSubmenus = new Set();
        const limitStates = new Map(
            this._limitSections.map(section => [section.limit.id, section.expanded])
        );
        if (wasOpen) this.actor.grab_key_focus();
        this._stopResetExpiryBreathing();
        this._resetExpiryBreathingLabels = [];
        for (const entry of this._historySubmenus) {
            if (!entry.submenu.menu.isOpen) continue;
            expandedSubmenus.add(entry.id);
            entry.submenu.menu.close(false);
        }
        this._stopRefreshSpinner();
        this._refreshButton = null;
        this._refreshButtonIcon = null;
        this._refreshButtonLabel = null;
        this._refreshSpinnerLabel = null;
        this._updatedLabel = null;
        this._destroyScreenshotContextMenu();
        if (this._screenshotButton && !this._screenshotButton.is_finalized()) {
            const parent = this._screenshotButton.get_parent();
            if (parent) parent.remove_child(this._screenshotButton);
            this._screenshotButton.destroy();
        }
        if (this._screenshotCopyTimeoutId) {
            Mainloop.source_remove(this._screenshotCopyTimeoutId);
            this._screenshotCopyTimeoutId = 0;
        }
        if (this._screenshotResetTimeoutId) {
            Mainloop.source_remove(this._screenshotResetTimeoutId);
            this._screenshotResetTimeoutId = 0;
        }
        this._screenshotButton = null;
        this._screenshotButtonLabel = null;
        this._historySubmenus = [];
        this._limitSections = [];
        this._actionFrame = null;
        this._actionWidthFrame = null;
        this._actionColumn = null;
        this._countdownWidgets = [];
        this._quotaWidgets = [];
        this._activityTooltips = [];
        this._popupRightInsetRows = [];
        this._activityCharts = [];
        this._creditsFit = null;
        this.menu.removeAll();
        if (this.menu._footer) {
            this.menu._footer.remove_all_children();
        }
        if (this.menu._header) {
            this.menu._header.remove_all_children();
        }

        this._addHeaderItem();
        if (this._snapshot) {
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            const limits = this._filterModelLimits(this._snapshot.limits || []);
            const usageTitle = this._addSectionHeading(_("Usage limits"));
            usageTitle.actor.style = "padding-bottom: 2px;";
            const showLimitLabels = limits.length > 1;
            for (const limit of limits) {
                if (limit.id !== ACCOUNT_LIMIT_ID) {
                    this._addCollapsibleLimit(
                        limit,
                        wasOpen && limitStates.has(limit.id)
                            ? limitStates.get(limit.id)
                            : this._defaultSectionExpanded(limit)
                    );
                    continue;
                }
                if (showLimitLabels) {
                    this._addLimitHeading(limit);
                }
                for (const window of limit.windows) {
                    this._addLimitWindowItem(window);
                }
            }

            this._addHistoryItems();

            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            this._addCreditItems();
        } else if (this._authenticationRequired) {
            this._addStatusItem(AUTH_REQUIRED_TITLE, AUTH_REQUIRED_DESCRIPTION);
        } else {
            this._addInfoItem(this._busy ? _("Loading usage limits…") : _("No usage data available"));
        }

        if (this._lastError) this._addStatusItem(_("Last refresh failed"), this._lastError);

        this._addLaunchButtons();

        if (wasOpen) {
            for (const entry of this._historySubmenus) {
                if (expandedSubmenus.has(entry.id)) entry.submenu.menu.open(false);
            }
            if (this.menu.isOpen) this._clampPopupHeight();
        }

        // A rebuild replaces every aligned actor while the popup may be
        // open; one queued sync can race ahead of the fresh actors' first
        // allocation and skip them. Re-queue on deferred passes so rings,
        // charts and the credits line always converge after a rebuild.
        if (typeof Mainloop !== "undefined") {
            this._queueActionEdgeSync();
            Mainloop.timeout_add(120, () => {
                if (!this._destroyed) this._queueActionEdgeSync();
                return GLib.SOURCE_REMOVE;
            });
            Mainloop.timeout_add(400, () => {
                if (!this._destroyed) this._queueActionEdgeSync();
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    _scheduleMenuRebuild() {
        if (this._destroyed || this._menuRebuildTimeoutId) return;
        this._menuRebuildTimeoutId = Mainloop.timeout_add(60, () => {
            const [, , modifiers] = global.get_pointer();
            if (modifiers & Clutter.ModifierType.BUTTON1_MASK) {
                return GLib.SOURCE_CONTINUE;
            }
            this._menuRebuildTimeoutId = 0;
            this._rebuildMenu();
            return GLib.SOURCE_REMOVE;
        });
    }

    _addHeaderItem() {
        this._headerRings = null;
        const item = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            activate: false
        });
        const text = new St.BoxLayout({
            vertical: true,
            y_align: Clutter.ActorAlign.CENTER
        });
        text.x_expand = true;
        this._screenshotButton = this._createLaunchButton(
            _("Copy Screenshot"),
            {
                iconName: "camera-photo-symbolic",
                symbolic: true,
                compact: true,
                iconOnly: true,
                corner: true,
                keepMenuOpen: true,
                transparent: true
            },
            true,
            () => this._copyAppletScreenshot(),
            _("Copy Usage Monitor Screenshot to Clipboard")
        );
        this._screenshotButton.x_expand = false;
        this._screenshotButton.x_align = Clutter.ActorAlign.START;
        this._screenshotButton.y_expand = false;
        this._screenshotButton.y_align = Clutter.ActorAlign.START;
        this._screenshotButtonLabel = this._screenshotButton._usageLabel;
        this._buildScreenshotContextMenu();
        const title = new St.Label({ text: _("Z.ai GLM Coding usage") });
        title.style = POPUP_HEADING_STYLE;
        text.add_child(title);
        if (this._snapshot) {
            this._updatedLabel = new St.Label({
                text: _f("Updated %s", UsageFormat.formatRelativeTime(this._snapshot.updatedAt))
            });
            this._updatedLabel.style = [
                "padding-top: 6px",
                "padding-left: 6px",
                "font-size: 90%",
                `color: ${this._menuColor(0.68)}`
            ].join("; ") + ";";
            text.add_child(this._updatedLabel);
        }
        const headerLayer = new St.Widget({
            layout_manager: new Clutter.BinLayout({
                x_align: Clutter.BinAlignment.START,
                y_align: Clutter.BinAlignment.START
            }),
            x_expand: true
        });
        headerLayer.add_child(text);
        const row = new St.BoxLayout({
            vertical: false,
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER
        });
        row.style = `padding-right: ${POPUP_RIGHT_INSET}px;`;
        this._popupRightInsetRows.push(row);
        row.add_child(headerLayer);
        if (this.menu._boxWrapper) this.menu._boxWrapper.add_actor(this._screenshotButton);

        if (this._snapshot) {
            // The header rings stay the account's 5h/7d overview; plan sections
            // carry their own rings next to their rows.
            const accountLimits = this._filterModelLimits(this._snapshot.limits)
                .filter(limit => limit.id === ACCOUNT_LIMIT_ID);
            const summaries = UsageFormat.listQuotaWindows(accountLimits);
            const compact = summaries.length >= 4;
            const rings = new St.BoxLayout({
                vertical: false,
                x_align: Clutter.ActorAlign.END,
                y_align: Clutter.ActorAlign.CENTER
            });
            rings.style = `spacing: ${compact ? 2 : 8}px;`;
            this._headerRings = rings;
            rings.translation_x = compact
                ? -(POPUP_HEADER_RING_LEFT_SHIFT - 6)
                : -POPUP_HEADER_RING_LEFT_SHIFT;
            for (const summary of summaries) {
                rings.add_child(
                    this._createQuotaRing(
                        summary,
                        compact ? COMPACT_QUOTA_RING_SIZE : QUOTA_RING_SIZE,
                        summary.durationMinutes === WEEKLY_WINDOW_MINUTES
                    )
                );
            }
            row.add_child(rings);
        }
        item.addActor(row, { expand: true, span: -1 });
        if (this.menu._header) {
            this.menu._header.add_child(item.actor);
        } else {
            this.menu.addMenuItem(item);
        }
    }

    _quotaRingOpacity(window) {
        const badge = this._modelBadge(window);
        if (badge !== "S" && badge !== "G") return 255;
        const limit = (this._snapshot.limits || []).find(
            candidate => candidate.id === window.limitId
        );
        return limit && !UsageFormat.hasQuotaUsage(limit.windows) ? 128 : 255;
    }

    _createQuotaRing(window, size = QUOTA_RING_SIZE, showLastResetTooltip = false) {
        const actor = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            width: size,
            height: size,
            reactive: showLastResetTooltip,
            track_hover: showLastResetTooltip
        });
        const area = new St.DrawingArea({ width: size, height: size });
        const opacity = this._quotaRingOpacity(window);
        area.opacity = opacity;
        const model = UsageFormat.buildQuotaIndicator(window);
        const badgeText = this._modelBadge(window);
        const label = new St.Label({
            text: `${model.durationLabel}\n${model.percentLabel}`,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            opacity
        });
        label.translation_x = badgeText ? 2 : 0;
        label.clutter_text.set_line_alignment(Pango.Alignment.CENTER);
        label.style = [
            `font-size: ${size < QUOTA_RING_SIZE ? 60 : 72}%`,
            "font-weight: bold",
            `color: ${this._remainingColor(window.remainingPercent)}`,
            "text-align: center"
        ].join("; ") + ";";
        area.connect("repaint", drawingArea => {
            const color = this._ringColor(this._quotaRingColor(window.remainingPercent));
            this._paintCircularProgress(
                drawingArea,
                model.valid ? model.fractionRemaining : 0,
                color
            );
        });
        actor.add_child(area);
        actor.add_child(label);
        if (badgeText) {
            const badge = new St.Label({
                text: badgeText,
                x_expand: true,
                y_expand: true,
                x_align: Clutter.ActorAlign.START,
                y_align: Clutter.ActorAlign.START
            });
            badge.style = this._modelBadgeStyle(
                size < QUOTA_RING_SIZE ? 50 : 60
            );
            badge.opacity = opacity < 255 ? 204 : 255;
            badge.translation_x = size < QUOTA_RING_SIZE ? 6 : 8;
            badge.translation_y = size < QUOTA_RING_SIZE ? 8 : 11;
            actor.add_child(badge);
        }
        let tooltip = null;
        if (showLastResetTooltip) {
            const details = this._weeklyResetTooltipDetails(window);
            const tooltipText = UsageFormat.formatLastResetTooltip(
                window,
                details.timestamp,
                this._use24HourClock,
                details.estimated
            );
            actor.accessible_name = UsageFormat.formatAccessibleTooltip(tooltipText);
            tooltip = this._createPositionedTooltip(actor, tooltipText);
        }
        this._quotaWidgets.push({ area, label, window, tooltip });
        area.queue_repaint();
        return actor;
    }

    _addLimitWindowItem(window) {
        const duration = UsageFormat.formatDuration(window.durationMinutes);
        const remaining = UsageFormat.formatPercent(window.remainingPercent);
        const reset = UsageFormat.formatTimestamp(
            window.resetsAt,
            this._use24HourClock
        );
        const item = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            activate: false
        });
        item.actor.style = "padding-top: 0px;";
        const text = new St.BoxLayout({
            vertical: true,
            y_align: Clutter.ActorAlign.CENTER
        });
        text.x_expand = true;
        const headline = new St.BoxLayout({
            vertical: false,
            y_align: Clutter.ActorAlign.CENTER
        });
        const durationLabel = new St.Label({
            text: _f("  %s usage", duration)
        });
        durationLabel.style = "font-weight: bold;";
        const remainingLabel = new St.Label({
            text: _f("%s remaining", remaining)
        });
        remainingLabel.style = this._emphasizedValueStyle(
            this._remainingColor(window.remainingPercent),
            12
        );
        remainingLabel.opacity = this.showColors &&
            Number.isFinite(window.remainingPercent) &&
            window.remainingPercent <= this.criticalRemaining ? 255 : 195;
        headline.add_child(durationLabel);
        headline.add_child(remainingLabel);
        const resetLabel = new St.Label({
            text: _f("  Resets %s", reset)
        });
        resetLabel.style = `padding-top: 3px; font-size: 90%; color: ${this._menuColor(0.68)};`;
        text.add_child(headline);
        text.add_child(resetLabel);
        const countdown = this._createResetCountdown(window);
        const row = new St.BoxLayout({
            vertical: false,
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER
        });
        row.style = `padding-right: ${POPUP_RIGHT_INSET}px;`;
        this._popupRightInsetRows.push(row);
        row.add_child(text);
        row.add_child(countdown);
        item.addActor(row, { expand: true, span: -1 });
        this.menu.addMenuItem(item);
        return item;
    }

    _createHeadingIcon(limit) {
        // Reserve the badge width for every model so all heading text aligns.
        const slot = new St.Bin({ width: 24 });
        slot.set_alignment(St.Align.START, St.Align.MIDDLE);
        slot.set_child(this._createPanelIcon(limit, 18, true));
        return slot;
    }

    _addIconHeading(limit, text, menu = this.menu, collapsible = false) {
        const item = new PopupMenu.PopupBaseMenuItem({
            reactive: collapsible,
            activate: collapsible
        });
        const row = new St.BoxLayout({
            vertical: false,
            y_align: Clutter.ActorAlign.CENTER
        });
        row.style = "spacing: 6px;";
        row.add_child(this._createHeadingIcon(limit));
        const label = new St.Label({
            text,
            y_align: Clutter.ActorAlign.CENTER
        });
        label.style = "font-weight: bold;";
        row.add_child(label);
        item.addActor(row, { expand: !collapsible, span: collapsible ? 1 : -1 });
        if (collapsible) {
            label.opacity = 128;
            item.actor.style = `padding-right: ${POPUP_RIGHT_INSET}px;`;
            item.actor.label_actor = label;
        }
        menu.addMenuItem(item);
        return item;
    }

    _addLimitHeading(limit) {
        this._addIconHeading(limit, limit.label || limit.id);
    }

    _addCollapsibleLimit(limit, expanded) {
        const heading = this._addIconHeading(
            limit, limit.label || limit.id, this.menu, true
        );
        // Keep the original rows in the same menu: a nested submenu would
        // introduce theme padding and change the countdown/chart alignment.
        const rows = limit.windows.map(window => this._addLimitWindowItem(window));
        const section = {
            limit,
            heading,
            rows,
            expanded: false,
            _usageUserToggled: false,
            setExpanded: open => {
                section.expanded = open;
                for (const row of rows) row.actor.visible = open;
                if (open) heading.actor.add_accessible_state(Atk.StateType.EXPANDED);
                else heading.actor.remove_accessible_state(Atk.StateType.EXPANDED);
                this._clampPopupHeight();
                this._queueActionEdgeSync();
                if (open && rows.length > 0 && typeof Mainloop !== "undefined" &&
                    !this._suppressSectionAutoScroll && this.menu && this.menu.isOpen) {
                    Mainloop.idle_add(() => {
                        if (!this._destroyed) this._ensureActorVisible(rows[rows.length - 1].actor);
                        return GLib.SOURCE_REMOVE;
                    });
                }
            }
        };
        heading.actor.add_accessible_state(Atk.StateType.EXPANDABLE);
        // The native base activation emits the menu-closing signal. A
        // disclosure must instead keep the popup open for mouse and keyboard.
        heading.activate = () => {
            section._usageUserToggled = true;
            section.setExpanded(!section.expanded);
        };
        heading.actor.connect("key-press-event", (actor, event) => {
            const key = event.get_key_symbol();
            const rtl = actor.get_direction() === St.TextDirection.RTL;
            if (key !== Clutter.KEY_Left && key !== Clutter.KEY_Right) return false;
            section._usageUserToggled = true;
            section.setExpanded((key === Clutter.KEY_Right) !== rtl);
            return true;
        });
        section.setExpanded(expanded);
        this._limitSections.push(section);
    }

    _createResetCountdown(window) {
        const size = 52;
        const actor = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            width: size,
            height: size,
            reactive: true,
            track_hover: true
        });
        actor.translation_x = -POPUP_RESET_RING_LEFT_SHIFT;
        const area = new St.DrawingArea({ width: size, height: size });
        const label = new St.Label({
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER
        });
        label.clutter_text.set_line_alignment(Pango.Alignment.CENTER);
        label.style = [
            "font-size: 72%",
            "font-weight: bold",
            `color: ${this._menuColor(0.94)}`,
            "text-align: center"
        ].join("; ") + ";";
        area.connect("repaint", drawingArea => {
            this._paintResetCountdown(drawingArea, window);
        });
        actor.add_child(area);
        actor.add_child(label);
        const tooltipText = UsageFormat.formatResetCountdownTooltip(window);
        actor.accessible_name = UsageFormat.formatAccessibleTooltip(tooltipText);
        const entry = {
            actor,
            area,
            label,
            window,
            tooltip: this._createPositionedTooltip(actor, tooltipText)
        };
        this._countdownWidgets.push(entry);
        this._updateResetCountdown(entry);
        return actor;
    }

    _paintResetCountdown(area, window) {
        const model = UsageFormat.buildResetCountdown(window);
        this._paintCircularProgress(
            area,
            model.valid ? model.fractionElapsed : 0,
            new Clutter.Color({
                red: 101,
                green: 214,
                blue: 139,
                alpha: 255
            })
        );
    }

    _ringColor(value) {
        const [valid, color] = Clutter.Color.from_string(String(value || ""));
        if (valid) {
            color.alpha = 255;
            return color;
        }
        return new Clutter.Color({
            red: 101,
            green: 214,
            blue: 139,
            alpha: 255
        });
    }

    _quotaRingColor(remaining) {
        return this._remainingColor(remaining);
    }

    _paintCircularProgress(area, fraction, progressColor) {
        const [width, height] = area.get_surface_size();
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.max(1, Math.min(width, height) / 2 - 5);
        const startAngle = -Math.PI / 2;
        const progressFraction = Math.max(0, Math.min(1, Number(fraction) || 0));
        const context = area.get_context();
        const foreground = this._menuForeground();
        const track = new Clutter.Color({
            red: foreground.red,
            green: foreground.green,
            blue: foreground.blue,
            alpha: 42
        });
        const glow = new Clutter.Color({
            red: progressColor.red,
            green: progressColor.green,
            blue: progressColor.blue,
            alpha: 58
        });
        const progress = new Clutter.Color({
            red: progressColor.red,
            green: progressColor.green,
            blue: progressColor.blue,
            alpha: 255
        });

        context.setLineCap(Cairo.LineCap.ROUND);
        context.setLineWidth(5);
        Clutter.cairo_set_source_color(context, track);
        context.arc(centerX, centerY, radius, 0, Math.PI * 2);
        context.stroke();

        if (progressFraction > 0) {
            const endAngle = startAngle + (Math.PI * 2 * progressFraction);
            context.setLineWidth(8);
            Clutter.cairo_set_source_color(context, glow);
            context.arc(centerX, centerY, radius, startAngle, endAngle);
            context.stroke();
            context.setLineWidth(5);
            Clutter.cairo_set_source_color(context, progress);
            context.arc(centerX, centerY, radius, startAngle, endAngle);
            context.stroke();
        }
        context.$dispose();
    }

    _updateResetCountdown(entry) {
        const model = UsageFormat.buildResetCountdown(entry.window);
        entry.label.set_text(model.label);
        entry.area.queue_repaint();
        if (entry.tooltip) {
            const tooltipText = UsageFormat.formatResetCountdownTooltip(entry.window);
            entry.tooltip.set_text(tooltipText);
            entry.actor.accessible_name = UsageFormat.formatAccessibleTooltip(tooltipText);
        }
    }

    _updateResetCountdowns() {
        for (const entry of this._countdownWidgets) {
            this._updateResetCountdown(entry);
        }
    }

    _updateRelativeTime() {
        if (!this._updatedLabel || !this._snapshot) return;
        const relativeTime = UsageFormat.formatRelativeTime(this._snapshot.updatedAt);
        this._updatedLabel.set_text(_f("Updated %s", relativeTime));
    }

    _restoreUpdatedLabel(label, text) {
        if (!label || label.is_finalized()) return;
        label.set_text(text || _f("Updated %s", UsageFormat.formatRelativeTime(
            this._snapshot && this._snapshot.updatedAt
        )));
    }

    _weeklyResetHistoryFile() {
        return Gio.File.new_for_path(GLib.build_filenamev([
            GLib.get_user_state_dir(), "cinnamon-z-usage", "weekly-reset-history.json"
        ]));
    }

    async _loadWeeklyResetHistory() {
        let loaded = {};
        try {
            const [ok, bytes] = await new Promise((resolve, reject) => {
                this._weeklyResetHistoryFile().load_contents_async(null, (source, result) => {
                    try { resolve(source.load_contents_finish(result)); } catch (error) { reject(error); }
                });
            });
            const payload = ok ? JSON.parse(ByteArray.toString(bytes)) : null;
            if (
                !payload ||
                payload.version !== WEEKLY_RESET_HISTORY_VERSION ||
                !payload.entries ||
                typeof payload.entries !== "object" ||
                Array.isArray(payload.entries)
            ) {
                throw new Error("Invalid saved weekly reset history");
            }
            for (const key of Object.keys(payload.entries)) {
                const saved = payload.entries[key];
                const lastResetAt = Number(
                    saved && typeof saved === "object" ? saved.lastResetAt : saved
                );
                if (!Number.isFinite(lastResetAt) || lastResetAt <= 0) continue;
                const nextResetAt = Number(
                    saved && typeof saved === "object" ? saved.nextResetAt : null
                );
                loaded[key] = {
                    lastResetAt: Math.floor(lastResetAt),
                    nextResetAt: Number.isFinite(nextResetAt) && nextResetAt > 0
                        ? Math.floor(nextResetAt)
                        : null
                };
            }
        } catch (error) {
            const notFound = typeof error.matches === "function" &&
                error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND);
            if (!notFound) {
                global.logWarning(`${UUID}: weekly reset history unavailable: ${error}`);
            }
        }
        this._weeklyResetHistory = Object.assign(loaded, this._weeklyResetHistory);
        this._weeklyResetHistoryReady = true;
        if (this._weeklyResetHistoryDirty) this._saveWeeklyResetHistory();
        if (!this._destroyed && this.menu) this._scheduleMenuRebuild();
    }

    _weeklyResetTooltipDetails(window) {
        const explicit = Number(window && window.lastResetAt);
        if (Number.isFinite(explicit) && explicit > 0) {
            return { timestamp: Math.floor(explicit), estimated: false };
        }

        const limitId = String(window && window.limitId || ACCOUNT_LIMIT_ID);
        const duration = Number(window && window.durationMinutes);
        const key = `${limitId}:${duration}`;
        const saved = this._weeklyResetHistory[key];
        const savedTimestamp = Number(
            saved && typeof saved === "object" ? saved.lastResetAt : saved
        );
        if (Number.isFinite(savedTimestamp) && savedTimestamp > 0) {
            return { timestamp: Math.floor(savedTimestamp), estimated: false };
        }

        const nextReset = Number(window && window.resetsAt);
        const fallback = nextReset - WEEKLY_WINDOW_SECONDS;
        return Number.isFinite(fallback) && fallback > 0
            ? { timestamp: Math.floor(fallback), estimated: true }
            : { timestamp: null, estimated: false };
    }

    _rememberWeeklyReset(limitId, duration, resetAt, nextResetAt = null) {
        if (Number(duration) !== WEEKLY_WINDOW_MINUTES) return;
        const timestamp = Number(resetAt);
        if (!Number.isFinite(timestamp) || timestamp <= 0) return;
        const key = `${String(limitId || ACCOUNT_LIMIT_ID)}:${WEEKLY_WINDOW_MINUTES}`;
        const existing = this._weeklyResetHistory[key];
        const existingTimestamp = Number(
            existing && typeof existing === "object" ? existing.lastResetAt : existing
        );
        if (Number.isFinite(existingTimestamp) && existingTimestamp >= timestamp) return;
        const next = Number(nextResetAt);
        this._weeklyResetHistory[key] = {
            lastResetAt: Math.floor(timestamp),
            nextResetAt: Number.isFinite(next) && next > 0 ? Math.floor(next) : null
        };
        this._weeklyResetHistoryDirty = true;
        if (this._weeklyResetHistoryReady) this._saveWeeklyResetHistory();
    }

    _recordWeeklyResetState(previousSnapshot, snapshot) {
        for (const limit of snapshot && snapshot.limits || []) {
            for (const window of limit.windows || []) {
                if (Number(window.durationMinutes) !== WEEKLY_WINDOW_MINUTES) continue;
                this._rememberWeeklyReset(
                    limit.id,
                    window.durationMinutes,
                    window.lastResetAt,
                    window.resetsAt
                );
            }
        }
        for (const reset of UsageFormat.findObservedWeeklyResets(previousSnapshot, snapshot)) {
            this._rememberWeeklyReset(
                reset.limitId,
                reset.durationMinutes,
                reset.resetAt,
                reset.nextResetAt
            );
        }
    }

    _saveWeeklyResetHistory() {
        if (
            !this._weeklyResetHistoryReady ||
            !this._weeklyResetHistoryDirty ||
            this._weeklyResetHistorySavePromise
        ) return;
        this._weeklyResetHistoryDirty = false;
        const file = this._weeklyResetHistoryFile();
        const payload = JSON.stringify({
            version: WEEKLY_RESET_HISTORY_VERSION,
            entries: this._weeklyResetHistory
        }) + "\n";
        const save = (async () => {
            await this._ensureResetDirectory(file.get_parent());
            await new Promise((resolve, reject) => {
                file.replace_contents_bytes_async(
                    new GLib.Bytes(ByteArray.fromString(payload)),
                    null,
                    false,
                    Gio.FileCreateFlags.REPLACE_DESTINATION,
                    null,
                    (source, result) => {
                        try {
                            source.replace_contents_finish(result);
                            resolve();
                        } catch (error) { reject(error); }
                    }
                );
            });
            const info = new Gio.FileInfo();
            info.set_attribute_uint32("unix::mode", 0o600);
            await new Promise((resolve, reject) => {
                file.set_attributes_async(
                    info,
                    Gio.FileQueryInfoFlags.NONE,
                    GLib.PRIORITY_DEFAULT,
                    null,
                    (source, result) => {
                        try {
                            source.set_attributes_finish(result);
                            resolve();
                        } catch (error) { reject(error); }
                    }
                );
            });
        })();
        this._weeklyResetHistorySavePromise = save;
        save.then(
            () => {
                this._weeklyResetHistorySavePromise = null;
                if (this._weeklyResetHistoryDirty) this._saveWeeklyResetHistory();
            },
            error => {
                this._weeklyResetHistorySavePromise = null;
                this._weeklyResetHistoryDirty = true;
                global.logWarning(`${UUID}: weekly reset history save failed: ${error}`);
            }
        );
    }

    _buildScreenshotContextMenu() {
        if (!this._screenshotButton || !this.menuManager) return;
        const menu = new PopupMenu.PopupMenu(this._screenshotButton, this._orientation);
        Main.uiGroup.add_actor(menu.actor);
        menu.actor.hide();
        const aboutItem = new PopupMenu.PopupIconMenuItem(
            _("About..."),
            "xsi-dialog-question",
            St.IconType.SYMBOLIC
        );
        aboutItem.connect("activate", () => {
            if (this.menu && this.menu.isOpen)
                this.menu.close(false);
            this.openAbout();
        });
        const configureItem = new PopupMenu.PopupIconMenuItem(
            _("Configure..."),
            "xsi-preferences",
            St.IconType.SYMBOLIC
        );
        configureItem.connect("activate", () => {
            if (this.menu && this.menu.isOpen)
                this.menu.close(false);
            this.configureApplet();
        });
        menu.addMenuItem(aboutItem);
        menu.addMenuItem(configureItem);
        this.menu.addChildMenu(menu);
        menu._usageRightClickOpen = false;
        menu.connect("open-state-changed", (_menu, open) => {
            if (!open) return;
            if (!menu._usageRightClickOpen) {
                menu.close(false);
                return;
            }
            menu._usageRightClickOpen = false;
        });
        this._screenshotContextMenu = menu;
    }

    _destroyScreenshotContextMenu() {
        const menu = this._screenshotContextMenu;
        if (!menu) return;
        this._screenshotContextMenu = null;
        if (menu.isOpen) menu.close(false);
        if (this.menu && this.menu.isChildMenu(menu)) this.menu.removeChildMenu(menu);
        menu.destroy();
    }

    _toggleScreenshotContextMenu() {
        if (!this._screenshotContextMenu || this._screenshotContextMenu.actor.is_finalized()) return;
        const menu = this._screenshotContextMenu;
        menu._usageRightClickOpen = !menu.isOpen;
        if (menu.isOpen) menu.close(false);
        else menu.open(false);
    }

    _copyAppletScreenshot() {
        if (
            this._screenshotCopyTimeoutId ||
            !this.menu ||
            !this.menu.isOpen ||
            !this.menu.actor.visible
        ) return;

        // The release event leaves the corner in its lighter hover state.
        // Paint the default surface before the asynchronous capture; the
        // successful callback will replace it with the green Copied state.
        if (this._screenshotButton && !this._screenshotButton.is_finalized()) {
            this._screenshotButton._usageCornerState = "normal";
            if (this._screenshotButton._usageCornerArea) {
                this._screenshotButton._usageCornerArea.queue_repaint();
            }
        }
        const updatedLabel = this._updatedLabel;
        const relativeText = this._snapshot
            ? _f("Updated %s", UsageFormat.formatRelativeTime(this._snapshot.updatedAt))
            : null;
        if (updatedLabel && this._snapshot) {
            updatedLabel.set_text(_f(
                "Updated %s",
                UsageFormat.formatTimestamp(this._snapshot.updatedAt, this._use24HourClock)
            ));
        }

        this._screenshotCopyTimeoutId = Mainloop.idle_add(() => {
            this._screenshotCopyTimeoutId = 0;
            this._captureAppletScreenshot(updatedLabel, relativeText);
            return GLib.SOURCE_REMOVE;
        });
    }

    _captureAppletScreenshot(updatedLabel, relativeText) {
        let temporary = null;
        const restore = () => this._restoreUpdatedLabel(updatedLabel, relativeText);
        const cleanup = () => {
            if (!temporary) return;
            try {
                temporary.delete(null);
            } catch (error) {
                global.logWarning(`${UUID}: screenshot cleanup failed: ${error}`);
            }
            if (this._screenshotTempFile === temporary) this._screenshotTempFile = null;
            temporary = null;
        };
        try {
            if (!this.menu || !this.menu.isOpen || !this.menu.actor.visible) {
                throw new Error("usage menu is no longer visible");
            }
            const [x, y] = this.menu.actor.get_transformed_position();
            const [width, height] = this.menu.actor.get_transformed_size();
            let captureHeight = height;
            if (this._actionFrame && !this._actionFrame.is_finalized() && this._actionFrame.visible) {
                const [, actionY] = this._actionFrame.get_transformed_position();
                const contentHeight = actionY - y;
                if (contentHeight > 1 && contentHeight < height) captureHeight = contentHeight;
            }
            const scale = Number(global.ui_scale) > 0 ? Number(global.ui_scale) : 1;
            const area = [x, y, width, captureHeight].map(value => Math.max(1, Math.round(value * scale)));
            const cornerRadius = this._popupCornerRadiusForScreenshot(scale);
            const [file, stream] = Gio.file_new_tmp("z-usage-screenshot-XXXXXX.png");
            if (stream) stream.close(null);
            temporary = file;
            this._screenshotTempFile = file;
            const screenshot = new Cinnamon.Screenshot();
            screenshot.screenshot_area(
                false,
                area[0],
                area[1],
                area[2],
                area[3],
                file.get_path(),
                (_source, success) => {
                    try {
                        if (!success) throw new Error("Cinnamon screenshot capture failed");
                        try {
                            this._makeScreenshotCornerTransparent(file, cornerRadius);
                        } catch (error) {
                            global.logWarning(`${UUID}: screenshot corner alpha mask failed: ${error}`);
                        }
                        const [ok, contents] = GLib.file_get_contents(file.get_path());
                        if (!ok) throw new Error("captured PNG could not be read");
                        St.Clipboard.get_default().set_content(
                            St.ClipboardType.CLIPBOARD,
                            "image/png",
                            GLib.Bytes.new(contents)
                        );
                        if (this._screenshotButtonLabel && !this._screenshotButtonLabel.is_finalized()) {
                            this._screenshotButtonLabel.set_text(_("Copied"));
                            if (this._screenshotButton && !this._screenshotButton.is_finalized()) {
                                this._screenshotButton.accessible_name = _("Copied");
                                this._screenshotButton._usageIcon.style = "color: #8ed891;";
                                this._screenshotButton._usageCornerState = "copied";
                                if (this._screenshotButton._usageCornerArea) {
                                    this._screenshotButton._usageCornerArea.queue_repaint();
                                }
                                if (this._screenshotButton._usageTooltip) {
                                    this._screenshotButton._usageTooltip.set_text(_("Copied"));
                                }
                            }
                            if (this._screenshotResetTimeoutId) {
                                Mainloop.source_remove(this._screenshotResetTimeoutId);
                            }
                            this._screenshotResetTimeoutId = Mainloop.timeout_add(1600, () => {
                                this._screenshotResetTimeoutId = 0;
                                if (
                                    this._screenshotButtonLabel &&
                                    !this._screenshotButtonLabel.is_finalized()
                                ) this._screenshotButtonLabel.set_text(_("Copy Screenshot"));
                                if (this._screenshotButton && !this._screenshotButton.is_finalized()) {
                                    this._screenshotButton.accessible_name = _("Copy Screenshot");
                                    this._screenshotButton._usageIcon.style = POPUP_SCREENSHOT_CAMERA_STYLE;
                                    this._screenshotButton._usageCornerState = "normal";
                                    if (this._screenshotButton._usageCornerArea) {
                                        this._screenshotButton._usageCornerArea.queue_repaint();
                                    }
                                    if (this._screenshotButton._usageTooltip) {
                                        this._screenshotButton._usageTooltip.set_text(
                                            _("Copy Usage Monitor Screenshot to Clipboard")
                                        );
                                    }
                                }
                                return GLib.SOURCE_REMOVE;
                            });
                        }
                    } catch (error) {
                        global.logWarning(`${UUID}: could not copy screenshot: ${error}`);
                    } finally {
                        restore();
                        cleanup();
                    }
                }
            );
        } catch (error) {
            global.logWarning(`${UUID}: could not start screenshot capture: ${error}`);
            restore();
            cleanup();
        }
    }

    _addLaunchButtons() {
        const item = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            activate: false
        });
        item.actor.style = "padding-left: 0px; padding-right: 0px;";
        const column = new St.BoxLayout({ vertical: true });
        column.style = "spacing: 8px; padding: 2px 0;";
        column.x_expand = true;
        column.x_align = Clutter.ActorAlign.FILL;
        const actionWidthFrame = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            x_align: Clutter.ActorAlign.CENTER
        });
        actionWidthFrame.add_child(column);
        const actionFrame = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            x_expand: true
        });
        actionFrame.add_child(actionWidthFrame);
        this._actionFrame = actionFrame;
        this._actionWidthFrame = actionWidthFrame;
        this._actionColumn = column;
        actionFrame.connect(
            "notify::allocation",
            () => this._queueActionEdgeSync()
        );
        if (this._actionColumnWidth > 0) {
            this._setActionColumnWidth(Math.round(this._actionColumnWidth * this._popupWidth() / POPUP_WIDTH));
        }
        const launchRow = new St.Widget({
            layout_manager: new Clutter.BoxLayout({ homogeneous: true, spacing: 8 }),
            x_expand: true
        });
        const utilityRow = new St.Widget({
            layout_manager: new Clutter.BoxLayout({ homogeneous: true, spacing: 8 }),
            x_expand: true
        });
        const webRow = new St.Widget({
            layout_manager: new Clutter.BoxLayout({ homogeneous: true, spacing: 8 }),
            x_expand: true
        });

        this._chatButton = this._createLaunchButton(
            _("Z.ai Chat"),
            { fileName: "chat-bubble.svg" },
            true,
            () => Util.spawn(["xdg-open", ZAI_URL]),
            _("Open the Z.ai chat web app")
        );
        this._usageButton = this._createLaunchButton(
            _("Usage"),
            { fileName: "utilities-system-monitor-symbolic.svg", symbolic: true },
            true,
            () => Util.spawn(["xdg-open", ZAI_USAGE_URL]),
            _("Open the Z.ai coding plan usage statistics")
        );
        const refreshConfirmed = this._refreshConfirmed;
        this._refreshButton = this._createLaunchButton(
            refreshConfirmed ? _("Updated") : _("Refresh now"),
            {
                fileName: refreshConfirmed
                    ? "emblem-ok-symbolic.svg"
                    : "view-refresh-symbolic.svg",
                symbolic: true,
                compact: true,
                keepMenuOpen: true,
                success: refreshConfirmed
            },
            true,
            () => this._refreshUsage(true)
        );
        this._refreshButtonIcon = this._refreshButton._usageIcon;
        this._refreshButtonLabel = this._refreshButton._usageLabel;
        this._refreshSpinnerLabel = new St.Label({
            text: "◐",
            width: 18,
            height: 18,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER
        });
        this._refreshSpinnerLabel.style = "font-size: 16px; text-align: center;";
        this._refreshSpinnerLabel.clutter_text.set_line_alignment(
            Pango.Alignment.CENTER
        );
        this._refreshSpinnerLabel.hide();
        this._refreshButton._usageContent.insert_child_at_index(
            this._refreshSpinnerLabel,
            0
        );
        this._syncRefreshButtonState();
        const apiKeysButton = this._createLaunchButton(
            _("API Keys"),
            {
                fileName: "web-browser-symbolic.svg",
                symbolic: true,
                compact: true
            },
            true,
            () => Util.spawn(["xdg-open", ZAI_API_KEYS_URL])
        );
        const zaiWebButton = this._createLaunchButton(
            "Z.ai",
            {
                fileName: "web-browser-symbolic.svg",
                symbolic: true,
                compact: true,
                transparent: true
            },
            true,
            () => Util.spawn(["xdg-open", ZAI_URL])
        );
        const docsButton = this._createLaunchButton(
            _("Docs"),
            {
                fileName: "web-browser-symbolic.svg",
                symbolic: true,
                compact: true,
                transparent: true
            },
            true,
            () => Util.spawn(["xdg-open", ZAI_DOCS_URL])
        );
        launchRow.add_child(this._chatButton);
        launchRow.add_child(this._usageButton);
        utilityRow.add_child(this._refreshButton);
        utilityRow.add_child(apiKeysButton);
        webRow.add_child(zaiWebButton);
        webRow.add_child(docsButton);
        column.add_child(launchRow);
        column.add_child(utilityRow);
        column.add_child(webRow);
        item.addActor(actionFrame, { span: -1, expand: true });
        if (this.menu._footer) {
            this.menu._footer.add_child(item.actor);
        } else {
            this.menu.addMenuItem(item);
        }
    }

    _createLaunchButton(label, iconSpec, available, action, tooltipText = null) {
        const iconProperties = {
            icon_size: iconSpec.corner ? 12 : iconSpec.compact ? 18 : 28
        };
        if (iconSpec.fileName) {
            const iconPath = `${this.metadata.path}/icons/${iconSpec.fileName}`;
            iconProperties.gicon = new Gio.FileIcon({
                file: Gio.File.new_for_path(iconPath)
            });
        } else {
            iconProperties.icon_name = iconSpec.iconName;
            iconProperties.icon_type = iconSpec.symbolic
                ? St.IconType.SYMBOLIC
                : St.IconType.FULLCOLOR;
        }
        if (iconSpec.symbolic) iconProperties.icon_type = St.IconType.SYMBOLIC;
        const icon = new St.Icon(iconProperties);
        icon.y_align = Clutter.ActorAlign.CENTER;
        const buttonLabel = new St.Label({
            text: label,
            y_align: Clutter.ActorAlign.CENTER
        });
        if (iconSpec.success) {
            icon.style = "color: #8ed891;";
            buttonLabel.style = "color: #8ed891; font-weight: bold;";
        }
        let content;
        let cornerArea = null;
        if (iconSpec.corner) {
            content = new St.Widget({
                layout_manager: new Clutter.BinLayout(),
                width: POPUP_SCREENSHOT_CORNER_SIZE,
                height: POPUP_SCREENSHOT_CORNER_SIZE
            });
            cornerArea = new St.DrawingArea({
                width: POPUP_SCREENSHOT_CORNER_SIZE,
                height: POPUP_SCREENSHOT_CORNER_SIZE
            });
            cornerArea.connect("repaint", drawingArea => {
                this._paintScreenshotCorner(drawingArea);
            });
            content.add_child(cornerArea);
            icon.x_align = Clutter.ActorAlign.START;
            icon.y_align = Clutter.ActorAlign.START;
            // St.Icon contributes its own internal half-size alignment offset.
            // These offsets place the 12px camera at about [3,2] in the 30px
            // surface, one pixel higher without shifting it horizontally.
            icon.translation_x = POPUP_SCREENSHOT_CAMERA_OFFSET_X;
            icon.translation_y = POPUP_SCREENSHOT_CAMERA_OFFSET_Y;
            icon.style = POPUP_SCREENSHOT_CAMERA_STYLE;
            content.add_child(icon);
        } else {
            content = new St.BoxLayout({
                vertical: false,
                y_align: Clutter.ActorAlign.CENTER
            });
            content.style = "spacing: 6px;";
            content.add_child(icon);
            if (!iconSpec.iconOnly) content.add_child(buttonLabel);
        }

        const button = new St.Button({
            child: content,
            accessible_name: label,
            style_class: "notification-button",
            reactive: available,
            can_focus: available,
            x_expand: true
        });
        button._usageIcon = icon;
        button._usageLabel = buttonLabel;
        button._usageContent = content;
        button._usageBusy = false;
        button._usageCornerArea = cornerArea;
        button._usageCornerState = available ? "normal" : "disabled";
        if (iconSpec.corner) {
            button.width = POPUP_SCREENSHOT_CORNER_SIZE;
            button.height = POPUP_SCREENSHOT_CORNER_SIZE;
            button.x_expand = false;
            button.y_expand = false;
        }
        if (tooltipText) {
            button._usageTooltip = this._createPositionedTooltip(
                button,
                tooltipText,
                true,
                LAUNCH_TOOLTIP_DELAY_MS
            );
        }
        const setState = state => {
            button.style = this._launchButtonStyle(
                state,
                iconSpec.compact,
                iconSpec.transparent,
                iconSpec.corner
            );
            if (button._usageCornerArea) {
                button._usageCornerState = state;
                button._usageCornerArea.queue_repaint();
            }
        };
        setState(button._usageCornerState);
        if (!available) {
            button.opacity = 100;
            button.add_style_pseudo_class("insensitive");
        } else {
            button.connect("enter-event", () => {
                if (button._usageBusy) return Clutter.EVENT_PROPAGATE;
                setState("hover");
                return Clutter.EVENT_PROPAGATE;
            });
            button.connect("leave-event", () => {
                if (button._usageBusy) return Clutter.EVENT_PROPAGATE;
                setState("normal");
                return Clutter.EVENT_PROPAGATE;
            });
            button.connect("button-press-event", (_actor, event) => {
                if (button._usageBusy) return Clutter.EVENT_PROPAGATE;
                if (iconSpec.corner && event.get_button() === 3) {
                    setState("hover");
                    this._toggleScreenshotContextMenu();
                    return Clutter.EVENT_STOP;
                }
                setState("pressed");
                return Clutter.EVENT_PROPAGATE;
            });
            button.connect("button-release-event", (_actor, event) => {
                if (button._usageBusy) return Clutter.EVENT_PROPAGATE;
                if (iconSpec.corner && event.get_button() === 3) {
                    setState("hover");
                    return Clutter.EVENT_STOP;
                }
                setState("hover");
                return Clutter.EVENT_PROPAGATE;
            });
            button.connect("clicked", () => {
                if (button._usageBusy) return;
                if (!iconSpec.keepMenuOpen) this.menu.close(false);
                action();
            });
        }
        return button;
    }

    _paintScreenshotCorner(area) {
        const [width, height] = area.get_surface_size();
        const size = Math.max(1, Math.min(width, height));
        const button = this._screenshotButton;
        const state = button && button._usageCornerState || "normal";
        let surface = new Clutter.Color({ red: 36, green: 36, blue: 40, alpha: 255 });
        let radius = 6;
        try {
            const themeNode = this.menu.actor.get_theme_node();
            const themedSurface = themeNode.get_background_color();
            if (themedSurface && themedSurface.alpha > 0) surface = themedSurface;
            const themedRadius = themeNode.get_length("border-radius");
            if (Number.isFinite(themedRadius) && themedRadius > 0) radius = themedRadius;
        } catch (error) {
            global.logWarning(`${UUID}: could not read popup corner theme: ${error}`);
        }
        radius = Math.max(0, Math.min(Math.floor(size / 2), Math.round(radius)));
        const mix = (from, to, amount) => new Clutter.Color({
            red: Math.round(from.red * (1 - amount) + to.red * amount),
            green: Math.round(from.green * (1 - amount) + to.green * amount),
            blue: Math.round(from.blue * (1 - amount) + to.blue * amount),
            alpha: 255
        });
        const white = new Clutter.Color({ red: 255, green: 255, blue: 255, alpha: 255 });
        const black = new Clutter.Color({ red: 0, green: 0, blue: 0, alpha: 255 });
        const copied = new Clutter.Color({ red: 142, green: 216, blue: 145, alpha: 255 });
        const top = state === "copied"
            ? mix(surface, copied, 0.52)
            : mix(surface, white, state === "hover" ? 0.16 : state === "pressed" ? 0.045 : 0.09);
        const dark = state === "copied"
            ? mix(surface, copied, 0.18)
            : mix(surface, black, state === "pressed" ? 0.11 : 0.18);
        const context = area.get_context();
        const gradient = new Cairo.LinearGradient(0, 0, size, size);
        gradient.addColorStopRGBA(
            0,
            top.red / 255,
            top.green / 255,
            top.blue / 255,
            0.985
        );
        gradient.addColorStopRGBA(
            1,
            dark.red / 255,
            dark.green / 255,
            dark.blue / 255,
            0.985
        );
        context.newPath();
        if (radius > 0) {
            context.moveTo(0, radius);
            context.arc(radius, radius, radius, Math.PI, Math.PI * 1.5);
        } else {
            context.moveTo(0, 0);
        }
        context.lineTo(size, 0);
        context.lineTo(0, size);
        context.closePath();
        context.setSource(gradient);
        context.fill();

        const highlight = new Clutter.Color({ red: 255, green: 255, blue: 255, alpha: 70 });
        context.setLineWidth(1.0);
        Clutter.cairo_set_source_color(context, highlight);
        context.newPath();
        if (radius > 1) {
            context.moveTo(1, radius);
            context.arc(radius, radius, radius - 1, Math.PI, Math.PI * 1.5);
            context.lineTo(size - 2, 1);
            context.moveTo(1, radius);
            context.lineTo(1, size - 2);
        } else {
            context.moveTo(1, 1);
            context.lineTo(size - 2, 1);
            context.moveTo(1, 1);
            context.lineTo(1, size - 2);
        }
        context.stroke();

        const shadow = new Clutter.Color({ red: 0, green: 0, blue: 0, alpha: 105 });
        context.setLineWidth(1.75);
        Clutter.cairo_set_source_color(context, shadow);
        context.newPath();
        context.moveTo(size - 1, 1);
        context.lineTo(1, size - 1);
        context.stroke();
        context.$dispose();
    }

    _popupCornerRadiusForScreenshot(scale = 1) {
        let radius = 6;
        try {
            const themedRadius = this.menu.actor.get_theme_node().get_length("border-radius");
            if (Number.isFinite(themedRadius) && themedRadius > 0) radius = themedRadius;
        } catch (error) {
            global.logWarning(`${UUID}: could not read popup corner radius: ${error}`);
        }
        return Math.max(0, Math.round(radius * Math.max(1, Number(scale) || 1)));
    }

    _makeScreenshotCornerTransparent(file, radius) {
        const source = GdkPixbuf.Pixbuf.new_from_file(file.get_path());
        const width = source.get_width();
        const height = source.get_height();
        const corner = Math.min(
            Math.max(0, Math.floor(Number(radius) || 0)),
            width,
            height
        );
        if (corner <= 0) return;
        const sourceChannels = source.get_n_channels();
        const sourceRowstride = source.get_rowstride();
        const sourcePixels = new Uint8Array(source.get_pixels());
        let channels = sourceChannels;
        let rowstride = sourceRowstride;
        let pixels = sourcePixels;
        if (sourceChannels === 3) {
            channels = 4;
            rowstride = width * channels;
            pixels = new Uint8Array(rowstride * height);
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const sourceOffset = y * sourceRowstride + x * sourceChannels;
                    const targetOffset = y * rowstride + x * channels;
                    pixels[targetOffset] = sourcePixels[sourceOffset];
                    pixels[targetOffset + 1] = sourcePixels[sourceOffset + 1];
                    pixels[targetOffset + 2] = sourcePixels[sourceOffset + 2];
                    pixels[targetOffset + 3] = 255;
                }
            }
        } else if (sourceChannels !== 4) {
            throw new Error("captured PNG has an unsupported channel layout");
        }
        for (let y = 0; y < corner; y++) {
            for (let x = 0; x < corner; x++) {
                const distance = Math.hypot(
                    corner - (x + 0.5),
                    corner - (y + 0.5)
                );
                const coverage = Math.max(0, Math.min(1, corner + 0.5 - distance));
                const offset = y * rowstride + x * channels + channels - 1;
                pixels[offset] = Math.min(pixels[offset], Math.round(coverage * 255));
            }
        }
        const pixbuf = GdkPixbuf.Pixbuf.new_from_bytes(
            GLib.Bytes.new(pixels),
            source.get_colorspace(),
            true,
            source.get_bits_per_sample(),
            width,
            height,
            rowstride
        );
        pixbuf.savev(file.get_path(), "png", [], []);
    }

    _syncRefreshButtonState() {
        const button = this._refreshButton;
        const icon = this._refreshButtonIcon;
        const label = this._refreshButtonLabel;
        const spinner = this._refreshSpinnerLabel;
        if (!button || !icon || !label || !spinner) return;

        if (this._busy) {
            label.set_text(_("Updating…"));
            label.style = null;
            icon.hide();
            spinner.show();
            button._usageBusy = true;
            button.reactive = true;
            button.can_focus = false;
            button.opacity = 255;
            button.add_style_pseudo_class("insensitive");
            button.style = this._launchButtonStyle("disabled", true, false);
            this._startRefreshSpinner(spinner);
            return;
        }

        this._stopRefreshSpinner();
        spinner.hide();
        icon.show();
        const fileName = this._refreshConfirmed
            ? "emblem-ok-symbolic.svg"
            : "view-refresh-symbolic.svg";
        icon.gicon = new Gio.FileIcon({
            file: Gio.File.new_for_path(`${this.metadata.path}/icons/${fileName}`)
        });
        icon.icon_type = St.IconType.SYMBOLIC;
        label.set_text(this._refreshConfirmed ? _("Updated") : _("Refresh now"));
        const successStyle = this._refreshConfirmed
            ? "color: #8ed891; font-weight: bold;"
            : "";
        icon.style = this._refreshConfirmed ? "color: #8ed891;" : null;
        label.style = successStyle || null;
        button._usageBusy = this._refreshConfirmed;
        button.reactive = true;
        button.can_focus = !this._refreshConfirmed;
        button.opacity = 255;
        button.remove_style_pseudo_class("insensitive");
        button.style = this._launchButtonStyle("normal", true, false);
    }

    _startRefreshSpinner(spinner) {
        this._stopRefreshSpinner();
        const frames = ["◐", "◓", "◑", "◒"];
        this._refreshSpinnerFrame = 0;
        spinner.set_text(frames[0]);
        this._refreshSpinnerTimeoutId = Mainloop.timeout_add(120, () => {
            if (this._destroyed || spinner.is_finalized()) {
                this._refreshSpinnerTimeoutId = 0;
                return GLib.SOURCE_REMOVE;
            }
            this._refreshSpinnerFrame = (this._refreshSpinnerFrame + 1) % frames.length;
            spinner.set_text(frames[this._refreshSpinnerFrame]);
            return GLib.SOURCE_CONTINUE;
        });
    }

    _stopRefreshSpinner() {
        if (!this._refreshSpinnerTimeoutId) return;
        Mainloop.source_remove(this._refreshSpinnerTimeoutId);
        this._refreshSpinnerTimeoutId = 0;
    }

    _launchButtonStyle(state, compact = false, transparent = false, corner = false) {
        if (corner) {
            return [
                "padding: 0",
                "border: 0",
                "border-radius: 0",
                "background-color: transparent",
                "box-shadow: none"
            ].join("; ") + ";";
        }
        const raisedColors = {
            normal: [`${this._menuColor(0.14)}`, `${this._menuColor(0.05)}`],
            hover: [`${this._menuColor(0.22)}`, `${this._menuColor(0.09)}`],
            pressed: [`${this._menuColor(0.06)}`, `${this._menuColor(0.16)}`],
            disabled: [`${this._menuColor(0.05)}`, `${this._menuColor(0.02)}`]
        };
        const transparentColors = {
            normal: [`${this._menuColor(0.035)}`, `${this._menuColor(0.01)}`],
            hover: [`${this._menuColor(0.13)}`, `${this._menuColor(0.04)}`],
            pressed: [`${this._menuColor(0.025)}`, `${this._menuColor(0.10)}`],
            disabled: [`${this._menuColor(0.02)}`, `${this._menuColor(0.005)}`]
        };
        const colors = transparent ? transparentColors : raisedColors;
        const [top, bottom] = colors[state] || colors.normal;
        return [
            `padding: ${compact ? (transparent ? 3 : 4) : 7}px 10px`,
            "border-radius: 6px",
            `border: 1px solid ${this._menuColor(transparent ? 0.09 : 0.16)}`,
            "background-gradient-direction: vertical",
            `background-gradient-start: ${top}`,
            `background-gradient-end: ${bottom}`,
            `box-shadow: inset 0 1px 2px ${this._menuColor(transparent ? 0.04 : 0.12)}`
        ].join("; ") + ";";
    }

    _addInfoItem(text, style = null, menu = this.menu) {
        const item = new PopupMenu.PopupMenuItem(text, { reactive: false });
        if (style) item.label.style = style;
        menu.addMenuItem(item);
        return item;
    }

    _addSectionHeading(text, menu = this.menu) {
        const item = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            activate: false
        });
        const label = new St.Label({
            text,
            y_align: Clutter.ActorAlign.CENTER
        });
        label.style = POPUP_HEADING_STYLE;
        item.addActor(label, { expand: true, span: -1 });
        menu.addMenuItem(item);
        return item;
    }

    _addStatusItem(title, description) {
        const item = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            activate: false
        });
        const column = new St.BoxLayout({ vertical: true, x_expand: true });
        column.set_width(POPUP_ACTION_GRID_WIDTH);
        const titleLabel = new St.Label({ text: title });
        titleLabel.style = "font-weight: bold;";
        const descriptionLabel = new St.Label({
            text: description,
            x_expand: true
        });
        descriptionLabel.style = [
            "padding-top: 5px",
            "font-size: 90%",
            `color: ${this._menuColor(0.68)}`
        ].join("; ") + ";";
        descriptionLabel.clutter_text.set_line_wrap(true);
        descriptionLabel.clutter_text.set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);
        descriptionLabel.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);
        column.add_child(titleLabel);
        column.add_child(descriptionLabel);
        item.addActor(column, { expand: true, span: -1 });
        this.menu.addMenuItem(item);
        return item;
    }

    _emphasizedValueStyle(
        color,
        paddingLeft = 0,
        fontSize = CREDIT_CONSUMPTION_BASE_FONT_SIZE,
        fontWeight = "bold"
    ) {
        return [
            `padding-left: ${paddingLeft}px`,
            `font-size: ${fontSize}%`,
            `font-weight: ${fontWeight}`,
            `color: ${color}`
        ].join("; ") + ";";
    }

    _fitCreditConsumptionRow(
        item,
        row,
        labelActor,
        valueLabel,
        separatorLabel,
        expiresLabel,
        expiryDateLabel,
        suffixColor,
        suffixLabelColor,
        suffixEmphasized
    ) {
        let fitting = false;
        // The fit pass and the edge sync both position this row; running
        // both at once makes them fight through chart allocations (the
        // charts get yanked by the relayout chains). The fit pass tracks
        // its own convergence: once two consecutive passes agree on the
        // font size it reports converged and stops reacting, and only then
        // does the edge sync translate the row onto the grid anchor.
        let armed = true;
        let converged = false;
        let lastFont = null;
        let plotActor = null;
        let plotAllocationId = 0;

        const applyFontSize = fontSize => {
            expiresLabel.style = this._emphasizedValueStyle(
                suffixLabelColor || this._menuColor(1),
                0,
                fontSize,
                suffixEmphasized ? "bold" : "normal"
            );
            expiryDateLabel.style = this._emphasizedValueStyle(
                suffixColor || this._menuColor(1),
                0,
                fontSize,
                suffixEmphasized ? "bold" : "normal"
            );
        };
        const preferredWidth = actor => actor.get_preferred_width(-1)[1];
        const findPlot = () => {
            const entry = (this._activityCharts || []).find(candidate => {
                if (candidate.nested || !candidate.chart) return false;
                return candidate.chart.get_children().length > 0;
            });
            const candidate = entry ? entry.chart.get_children()[0] : null;
            if (candidate === plotActor) return;
            if (plotActor && plotAllocationId) plotActor.disconnect(plotAllocationId);
            plotActor = candidate;
            plotAllocationId = plotActor
                ? plotActor.connect("notify::allocation", fit)
                : 0;
        };
        const availableWidth = () => {
            findPlot();
            const rowWidth = row.get_width();
            if (!(rowWidth > 0)) return 0;
            // The text starts in the normal left column and should end at
            // the button grid's right edge - measure that distance and let
            // the font shrink until the line fits it.
            let targetRight = null;
            if (this._actionWidthFrame && !this._actionWidthFrame.is_finalized()) {
                const gv = this._actionWidthFrame.get_abs_allocation_vertices();
                targetRight = Math.max(gv[1].x, gv[2].x);
            }
            const [rowX] = row.get_transformed_position();
            const [rowWidthTransformed] = row.get_transformed_size();
            const scale = rowWidthTransformed > 0
                ? rowWidthTransformed / rowWidth
                : 1;
            let width;
            if (targetRight !== null && Number.isFinite(rowX)) {
                width = (targetRight - rowX) / scale;
            } else if (!plotActor || !(plotActor.get_width() > 0)) {
                const rowSize = row.get_transformed_size();
                width = rowWidth - POPUP_CHART_RIGHT_INSET / (scale || 1);
            } else {
                const [plotX] = plotActor.get_transformed_position();
                const [plotWidth] = plotActor.get_transformed_size();
                width = (plotX + plotWidth - rowX) / scale;
            }
            return Number.isFinite(width) ? Math.max(0, Math.min(rowWidth, width)) : rowWidth;
        };
        const fit = () => {
            // Converged means done for this open: every further allocation
            // (hover tooltips, scroll churn) would re-apply the base font
            // and visibly pulse the line.
            if (!armed || converged || fitting) return;
            const rowWidth = row.get_width();
            if (!(rowWidth > 0)) return;
            fitting = true;
            try {
                applyFontSize(CREDIT_CONSUMPTION_BASE_FONT_SIZE);
                const fixedWidth = preferredWidth(labelActor) +
                    preferredWidth(valueLabel) + preferredWidth(separatorLabel);
                const suffixWidth = preferredWidth(expiresLabel) +
                    preferredWidth(expiryDateLabel);
                const targetWidth = availableWidth();
                const availableSuffixWidth = Math.max(0, targetWidth - fixedWidth);
                const ratio = suffixWidth > 0
                    ? Math.min(1, availableSuffixWidth / suffixWidth)
                    : 1;
                let fontSize = Math.max(
                    CREDIT_CONSUMPTION_MIN_FONT_SIZE,
                    Math.floor(CREDIT_CONSUMPTION_BASE_FONT_SIZE * ratio * 10) / 10
                );
                applyFontSize(fontSize);
                while (
                    fontSize > CREDIT_CONSUMPTION_MIN_FONT_SIZE &&
                    preferredWidth(row) > targetWidth + 1
                ) {
                    fontSize = Math.max(
                        CREDIT_CONSUMPTION_MIN_FONT_SIZE,
                        fontSize - 1
                    );
                    applyFontSize(fontSize);
                }
                // Two passes agreeing on the font size means the fit has
                // settled: from now on the edge sync owns the placement.
                if (lastFont !== null && Math.abs(lastFont - fontSize) < 0.05) {
                    converged = true;
                }
                lastFont = fontSize;
            } finally {
                fitting = false;
            }
        };

        row.connect("notify::allocation", fit);
        item.actor.connect("notify::allocation", fit);
        Mainloop.idle_add(() => {
            fit();
            return GLib.SOURCE_REMOVE;
        });
        return {
            setArmed: value => {
                armed = value;
                if (value) {
                    converged = false;
                    lastFont = null;
                }
            },
            isConverged: () => converged
        };
    }

    _addCreditItems() {
        const credits = this._snapshot ? this._snapshot.credits : null;
        const history = this._snapshot ? this._snapshot.history : null;
        if (credits && credits.plan) {
            this._addCreditItem(_("Plan"), String(credits.plan), true);
        }
        let balance = credits
            ? UsageFormat.formatCreditNumber(credits.balance)
            : _("unavailable");
        if (credits && credits.unlimited) balance = "unlimited";
        const creditConsumption = credits && !credits.unlimited && history
            ? UsageFormat.formatCreditConsumption(history.creditPeriods)
            : null;
        const creditConsumptionMarkup = creditConsumption
            ? UsageFormat.formatCreditConsumptionMarkup(
                history.creditPeriods,
                CREDIT_CONSUMPTION_MARKUP_MODE
            )
            : null;
        const creditConsumptionEmphasized = Boolean(creditConsumption) &&
            CREDIT_CONSUMPTION_MARKUP_MODE !== "numbers";
        const creditConsumptionColor = creditConsumption ? this.criticalColor : null;
        this._addCreditItem(
            _("Credits"),
            balance,
            true,
            creditConsumption,
            creditConsumptionColor,
            null,
            creditConsumption ? _("Consumed:  ") : null,
            creditConsumptionColor,
            creditConsumptionEmphasized,
            false,
            Boolean(creditConsumption),
            creditConsumptionMarkup
        );
    }

    _addCreditItem(
        label,
        value,
        emphasized = false,
        suffix = null,
        suffixColor = null,
        action = null,
        suffixLabel = null,
        suffixLabelColor = null,
        suffixEmphasized = false,
        suffixBreathing = true,
        suffixFitToChart = false,
        suffixMarkup = false
    ) {
        const interactive = typeof action === "function";
        const item = new PopupMenu.PopupBaseMenuItem({
            reactive: interactive,
            activate: interactive
        });
        if (interactive) {
            item.connect("activate", () => {
                action();
            });
        }
        const row = new St.BoxLayout({ vertical: false });
        let fitTargets = null;
        const labelActor = new St.Label({ text: `${label}:` });
        labelActor.style = `color: ${this._menuColor(0.68)};`;
        row.add_child(labelActor);
        const valueLabel = new St.Label({ text: value });
        if (emphasized) {
            const zeroValue = String(value) === "0";
            valueLabel.style = this._emphasizedValueStyle(
                zeroValue ? this._menuColor(0.68) : this.normalColor,
                4
            );
            valueLabel.opacity = zeroValue ? 255 : 195;
        } else {
            valueLabel.style = "padding-left: 4px;";
        }
        row.add_child(valueLabel);
        if (suffix) {
            const separatorLabel = new St.Label({
                text: "·",
                y_align: Clutter.ActorAlign.CENTER
            });
            separatorLabel.style = [
                "padding-left: 6px",
                "padding-right: 6px",
                "font-size: 80%",
                "font-weight: normal",
                `color: ${this._menuColor(0.68)}`
            ].join("; ") + ";";
            separatorLabel.translation_y = 2;
            const expiresLabel = new St.Label({
                text: suffixLabel || _("expires "),
                y_align: Clutter.ActorAlign.CENTER
            });
            const expiryDateLabel = new St.Label({
                text: suffix,
                y_align: Clutter.ActorAlign.CENTER
            });
            const suffixTranslationY = suffixFitToChart ? 1 : 0;
            expiresLabel.translation_y = suffixTranslationY;
            expiryDateLabel.translation_y = suffixTranslationY;
            if (suffixEmphasized) {
                expiresLabel.style = this._emphasizedValueStyle(
                    suffixLabelColor || this._menuColor(1)
                );
                expiryDateLabel.style = this._emphasizedValueStyle(
                    suffixColor || this._menuColor(1)
                );
                expiresLabel.opacity = 255;
                expiryDateLabel.opacity = 255;
            } else {
                expiresLabel.style = [
                    "font-weight: normal",
                    `color: ${suffixLabelColor || this._menuColor(0.68)}`
                ].join("; ") + ";";
                expiryDateLabel.style = [
                    "font-weight: normal",
                    `color: ${suffixColor || this._menuColor(0.68)}`
                ].join("; ") + ";";
            }
            if (suffixMarkup && expiryDateLabel.clutter_text) {
                const markup = typeof suffixMarkup === "string"
                    ? suffixMarkup
                    : String(suffix)
                        .replace(/&/g, "&amp;")
                        .replace(/</g, "&lt;")
                        .replace(/>/g, "&gt;")
                        .replace(/\x20{2}·\x20{2}/g, "&#160;&#160;·&#160;&#160;");
                expiryDateLabel.clutter_text.set_markup(markup);
            }
            if (suffixBreathing && suffixColor === RESET_EXPIRY_CRITICAL_COLOR) {
                this._resetExpiryBreathingLabels.push(expiryDateLabel);
                expiryDateLabel.connect("notify::mapped", () => {
                    if (expiryDateLabel.mapped) this._startResetExpiryBreathing();
                });
            }
            row.add_child(separatorLabel);
            row.add_child(expiresLabel);
            row.add_child(expiryDateLabel);
            if (suffixFitToChart) {
                fitTargets = {
                    separatorLabel,
                    expiresLabel,
                    expiryDateLabel
                };
            }
        }
        row.x_expand = true;
        item.addActor(row, { expand: true, span: -1 });
        this.menu.addMenuItem(item);
        if (fitTargets) {
            this._creditsFit = this._fitCreditConsumptionRow(
                item,
                row,
                labelActor,
                valueLabel,
                fitTargets.separatorLabel,
                fitTargets.expiresLabel,
                fitTargets.expiryDateLabel,
                suffixColor,
                suffixLabelColor,
                suffixEmphasized
            );
        }
    }

    async _ensureResetDirectory(directory) {
        const create = () => new Promise((resolve, reject) => {
            directory.make_directory_async(GLib.PRIORITY_DEFAULT, null, (source, result) => {
                try { resolve(source.make_directory_finish(result)); } catch (error) { reject(error); }
            });
        });
        try {
            await create();
        } catch (error) {
            if (error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS)) return;
            if (!error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND)) throw error;
            await this._ensureResetDirectory(directory.get_parent());
            await create();
        }
        const info = new Gio.FileInfo();
        info.set_attribute_uint32("unix::mode", 0o700);
        await new Promise((resolve, reject) => {
            directory.set_attributes_async(info, Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT,
                null, (source, result) => {
                    try { resolve(source.set_attributes_finish(result)); } catch (error) { reject(error); }
                });
        });
    }

    _selectCreditHistoryWindow(windows) {
        const source = Array.from(windows || []);
        return source.find(window =>
            window.id === ACCOUNT_LIMIT_ID && Number(window.durationMinutes) === 10080
        ) || source.find(window =>
            window.id === ACCOUNT_LIMIT_ID && Number(window.durationMinutes) === 300
        ) || source.find(window =>
            Number(window.durationMinutes) === 10080
        ) || source[0] || null;
    }

    _forwardLeafScroll(event) {
        if (!this.menu || !this.menu.isOpen || !this._scroll) {
            return Clutter.EVENT_PROPAGATE;
        }
        const adjustment = this._scroll.get_vscroll_bar().get_adjustment();
        const direction = event.get_scroll_direction();
        const step = 48;
        if (direction === Clutter.ScrollDirection.SMOOTH) {
            const [, deltaY] = event.get_scroll_delta();
            if (!deltaY) return Clutter.EVENT_PROPAGATE;
            adjustment.set_value(adjustment.get_value() + deltaY * step);
            return Clutter.EVENT_STOP;
        }
        if (direction === Clutter.ScrollDirection.UP) {
            adjustment.set_value(adjustment.get_value() - step);
        } else if (direction === Clutter.ScrollDirection.DOWN) {
            adjustment.set_value(adjustment.get_value() + step);
        } else {
            return Clutter.EVENT_PROPAGATE;
        }
        return Clutter.EVENT_STOP;
    }

    _addHistoryItems() {
        const history = this._snapshot ? this._snapshot.history : null;
        if (!history || !Array.isArray(history.windows) || history.windows.length === 0) {
            if (history && history.error) {
                this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
                this._addInfoItem(_f("Usage history unavailable: %s", history.error));
            }
            return;
        }

        const visibleWindows = this._filterModelLimits(history.windows);
        if (visibleWindows.length === 0) return;
        const creditActivityValues = UsageFormat.hasRecentActivity(
            history.creditActivity24h,
            "consumed"
        ) ? history.creditActivity24h : null;
        const creditGraphWindow = creditActivityValues
            ? this._selectCreditHistoryWindow(visibleWindows)
            : null;
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._addSectionHeading(_("Recent consumption"));
        const windowsByLimit = new Map();
        for (const window of visibleWindows) {
            const limitId = window.id || ACCOUNT_LIMIT_ID;
            if (!windowsByLimit.has(limitId)) windowsByLimit.set(limitId, []);
            windowsByLimit.get(limitId).push(window);
        }
        const showLimitLabels = windowsByLimit.size > 1;
        for (const [limitId, windows] of windowsByLimit) {
            if (showLimitLabels && limitId !== ACCOUNT_LIMIT_ID) {
                const first = windows[0];
                const submenu = new PopupMenu.PopupSubMenuMenuItem(
                    ""
                );
                submenu.actor.style = `padding-right: ${POPUP_RIGHT_INSET}px;`;
                // The native disclosure arrow flashed on collapse and its
                // alignment kept fighting the grid (same call as the section
                // arrows): expand/collapse is communicated by the leaf rows.
                // Hide the whole bin; Cinnamon's submenu animation still
                // rotates the hidden icon harmlessly.
                submenu._triangleBin.hide();
                if ("overlay_scrollbars" in submenu.menu.actor) {
                    submenu.menu.actor.overlay_scrollbars = true;
                }
                submenu.removeActor(submenu.label);
                submenu.label.destroy();
                const submenuTitle = new St.BoxLayout({
                    vertical: false,
                    y_align: Clutter.ActorAlign.CENTER
                });
                submenuTitle.style = "spacing: 6px;";
                submenuTitle.add_child(
                    this._createHeadingIcon({ id: limitId, label: first.label })
                );
                const submenuLabel = new St.Label({
                    text: first.label || first.id,
                    y_align: Clutter.ActorAlign.CENTER
                });
                submenuLabel.style = "font-weight: bold;";
                submenuLabel.opacity = 128;
                submenuTitle.add_child(submenuLabel);
                submenu.addActor(submenuTitle, { position: 0 });
                submenu.label = submenuLabel;
                submenu.actor.label_actor = submenuLabel;
                this.menu.addMenuItem(submenu);
                this._historySubmenus.push({ id: limitId, submenu });
                submenu.menu.actor.connect("scroll-event", (_actor, event) => {
                    // The nested scroll view swallows wheel events even when
                    // its own adjustment cannot move, which dead-zones the
                    // whole expanded leaf. Forward every wheel step to the
                    // main scroll view so scrolling works anywhere.
                    return this._forwardLeafScroll(event);
                });
                submenu.menu.connect("open-state-changed", (_menu, open) => {
                    if (open) {
                        // Nested submenu content does not participate in the
                        // section's height allocation; two open submenus would
                        // draw over each other. Keep one accordion leaf open.
                        for (const entry of this._historySubmenus) {
                            if (entry.submenu !== submenu && entry.submenu.menu.isOpen) {
                                entry.submenu.menu.close(false);
                            }
                        }
                        // A previous scroll-viewport pass can leave a stale
                        // height on the reopened leaf; clear it and settle.
                        submenu.menu.actor.set_height(-1);
                        submenu.menu.box.set_height(-1);
                        this._clampPopupHeight();
                        if (typeof Mainloop !== "undefined" && this.menu && this.menu.isOpen) {
                            Mainloop.idle_add(() => {
                                if (!this._destroyed) this._ensureActorVisible(submenu.menu.actor);
                                return GLib.SOURCE_REMOVE;
                            });
                        }
                    }
                    this._syncPopupRightInsets();
                });
                const shareSparkActivityChart = this._modelBadge({
                    id: limitId,
                    label: first.label
                }) === "S" && windows.length > 1;
                const sharedActivityValues = shareSparkActivityChart
                    ? UsageFormat.buildSharedActivityValues(windows, 0.5)
                    : [];
                windows.forEach((window, index) => {
                    if (index > 0) {
                        submenu.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
                    }
                    this._addHistoryWindow(
                        window,
                        history,
                        submenu.menu,
                        false,
                        !shareSparkActivityChart
                            ? window.activity24h
                            : index === windows.length - 1
                                ? sharedActivityValues
                                : null,
                        window === creditGraphWindow ? creditActivityValues : null
                    );
                });
                continue;
            }
            for (const window of windows) {
                this._addHistoryWindow(
                    window,
                    history,
                    this.menu,
                    showLimitLabels,
                    window.activity24h,
                    window === creditGraphWindow ? creditActivityValues : null
                );
            }
        }
    }

    _openActiveSparkHistory() {
        if (this.showModelSpecificLimits === false) return;
        const history = this._snapshot ? this._snapshot.history : null;
        if (!history || !Array.isArray(history.windows)) return;

        const activeSparkWindow = history.windows.find(window =>
            this._modelBadge(window) === "S" &&
            UsageFormat.hasRecentActivity(window.activity24h)
        );
        if (!activeSparkWindow) return;

        const entry = this._historySubmenus.find(
            candidate => candidate.id === activeSparkWindow.id
        );
        if (entry && !entry.submenu.menu.isOpen) {
            entry.submenu.menu.open(false);
        }
    }

    _addHistoryWindow(
        window,
        history,
        menu,
        showLimitLabel,
        activityValues = window.activity24h,
        creditValues = null
    ) {
        const duration = UsageFormat.formatDuration(window.durationMinutes);
        const periods = window.periods || {};
        const activityTotal = periods["24h"];
        const oneHour = UsageFormat.formatConsumedPercent(periods["1h"]);
        const fourHours = UsageFormat.formatConsumedPercent(periods["4h"]);
        const twelveHours = UsageFormat.formatConsumedPercent(periods["12h"]);
        const today = UsageFormat.formatConsumedPercent(periods.today);
        const rollingDay = UsageFormat.formatConsumedPercent(activityTotal);
        const periodKeys = UsageFormat.historyPeriodKeys(window.durationMinutes);
        if (showLimitLabel) {
            this._addIconHeading(
                window,
                _f("%s · %s usage", window.label || window.id, duration),
                menu
            );
        } else {
            this._addInfoItem(_f("  %s usage", duration), "font-weight: bold;", menu);
        }
        const rollingDayText = periodKeys.includes("24h")
            ? _f("  ·  24h %s", rollingDay)
            : "";
        this._addInfoItem(
            _f("    1h %s  ·  4h %s%s", oneHour, fourHours, rollingDayText),
            null,
            menu
        );
        if (periodKeys.includes("12h")) {
            this._addInfoItem(_f("    12h %s  ·  Today %s", twelveHours, today), null, menu);
        }
        if (activityValues) {
            this._addActivityChart(
                activityValues,
                history.activityBucketMinutes,
                history.activityEndAt || this._snapshot.updatedAt,
                menu,
                creditValues
            );
        }
    }

    _notificationOptions() {
        return {
            notifyAllWeeklyResets: this.notifyAllWeeklyResets,
            notifyCodexWeeklyReset: this.notifyCodexWeeklyReset,
            notifySparkWeeklyReset: this.notifySparkWeeklyReset,
            enableFiveHourLowNotifications: this.enableFiveHourLowNotifications,
            fiveHourWarningRemaining: this.fiveHourWarningRemaining,
            fiveHourCriticalRemaining: this.fiveHourCriticalRemaining,
            enableWeeklyLowNotifications: this.enableWeeklyLowNotifications,
            weeklyWarningRemaining: this.weeklyWarningRemaining,
            weeklyCriticalRemaining: this.weeklyCriticalRemaining
        };
    }

    _showUsageNotifications(previousSnapshot, snapshot) {
        const events = UsageFormat.buildUsageNotificationEvents(
            previousSnapshot,
            snapshot,
            this._notificationOptions()
        );
        for (const event of events) {
            const source = new MessageTray.SystemNotificationSource();
            Main.messageTray.add(source);
            const notification = new MessageTray.Notification(source, event.title, event.message);
            notification.setTransient(false);
            source.notify(notification);
        }
    }

    _addActivityChart(values, bucketMinutes, endAt, menu = this.menu, creditValues = null) {
        const model = UsageFormat.buildActivityChart(values);
        const creditModel = Array.isArray(creditValues)
            ? UsageFormat.buildCreditActivityChart(creditValues)
            : null;
        const hasCreditModel = creditModel && creditModel.bars.length > 0;
        const barCount = Math.max(
            model.bars.length,
            hasCreditModel ? creditModel.bars.length : 0
        );
        if (barCount === 0) return;

        const bucketLabel = UsageFormat.formatDuration(bucketMinutes);
        const peakLabel = model.knownCount > 0
            ? UsageFormat.formatConsumedPercent({
                consumedPercent: model.peakPercent,
                complete: model.peakComplete
            })
            : "—";
        const peakCredits = hasCreditModel
            ? UsageFormat.formatPeakCredits(creditValues)
            : null;
        const peakCreditsLabel = peakCredits ? _f(" / %s AIC", peakCredits) : "";
        const totalLabel = model.knownCount > 0
            ? UsageFormat.formatPercent(model.totalPercent)
            : "—";
        const item = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            activate: false
        });
        const column = new St.BoxLayout({ vertical: true, x_expand: true });
        column.style = "padding: 2px 0 1px 0;";

        const caption = new St.BoxLayout({
            vertical: false
        });
        const captionTitle = new St.Label({ text: _("  24h Activity") });
        captionTitle.style = "font-weight: bold;";
        const captionDetails = new St.Label({
            text: _f(
                "  ·  %s  ·  %s buckets  ·  peak %s%s",
                totalLabel,
                bucketLabel,
                peakLabel,
                peakCreditsLabel
            )
        });
        caption.add_child(captionTitle);
        caption.add_child(captionDetails);
        column.add_child(caption);

        const chart = new St.BoxLayout({ vertical: true, x_align: Clutter.ActorAlign.START });
        const nested = menu !== this.menu;
        chart.style = this._activityChartStyle(nested, false);
        // Carry the previous menu's aligned width across rebuilds: a fresh
        // chart starts at its natural width and the graph would visibly
        // jump on every data refresh until the sync re-forces it.
        const widthHint = (this._lastChartWidths || [])[this._activityCharts.length];
        if (widthHint > 0) this._forceActorWidth(chart, widthHint);
        this._activityCharts.push({
            chart,
            nested
        });
        // The width hint above plus the deferred rebuild re-queues keep
        // fresh charts converged; per-chart allocation watchers were
        // deliberately avoided - they storm the JS engine with callbacks
        // during rapid toggling and destabilize the shell.

        const plot = new St.Widget({
            layout_manager: new Clutter.BoxLayout({ homogeneous: true }),
            height: 30,
            x_expand: true
        });
        plot.style = `border-bottom: 1px solid ${this._menuColor(0.28)}; padding-top: 2px;`;
        const creditHighlightColor = this._brightenColor(this.criticalColor);
        for (let index = 0; index < barCount; index++) {
            const bar = model.bars[index] || null;
            const creditBar = hasCreditModel ? creditModel.bars[index] || null : null;
            const slot = new St.Bin({
                height: 28,
                reactive: true,
                track_hover: true,
                x_expand: true
            });
            slot.set_alignment(St.Align.MIDDLE, St.Align.END);
            if (index % 3 === 0) {
                slot.style = `border-left: 1px solid ${this._menuColor(0.10)};`;
            }

            const barWidth = barCount >= 24 ? 8 : 14;
            const quotaHasVisibleBar = bar && bar.known &&
                Number.isFinite(bar.consumedPercent) && bar.consumedPercent > 0;
            const creditHasVisibleBar = creditBar && creditBar.known &&
                Number.isFinite(creditBar.consumedPercent) && creditBar.consumedPercent > 0;
            const quotaHeight = quotaHasVisibleBar
                ? UsageFormat.activityBarHeight(bar, model.peakPercent)
                : 0;
            const creditHeight = creditHasVisibleBar
                ? UsageFormat.activityBarHeight(creditBar, creditModel.peakPercent)
                : 0;
            const stackedHeight = quotaHeight + creditHeight;
            const stackScale = stackedHeight > ACTIVITY_CHART_BAR_MAX_HEIGHT
                ? ACTIVITY_CHART_BAR_MAX_HEIGHT / stackedHeight
                : 1;
            const bars = new St.BoxLayout({
                vertical: true,
                y_align: Clutter.ActorAlign.END
            });
            const addBar = (entry, peak, isCredit) => {
                if (!entry) return;
                if (isCredit && !creditHasVisibleBar) return;
                if (!isCredit && creditHasVisibleBar && !quotaHasVisibleBar) return;
                const naturalHeight = UsageFormat.activityBarHeight(entry, peak);
                const height = hasCreditModel && creditHasVisibleBar
                    ? Math.max(2, Math.round(naturalHeight * stackScale))
                    : naturalHeight;
                let style = `background-color: ${this._menuColor(0.16)}; border-radius: 2px 2px 0 0;`;
                if (entry.known && entry.intensity === 0) {
                    const radius = creditHasVisibleBar && quotaHasVisibleBar && !isCredit
                        ? "0 0 2px 2px"
                        : "2px 2px 0 0";
                    style = `background-color: ${this._menuColor(0.38)}; border-radius: ${radius};`;
                } else if (entry.known && isCredit) {
                    const radius = quotaHasVisibleBar ? "2px 2px 0 0" : "2px";
                    style = `background-gradient-direction: vertical; background-gradient-start: ${creditHighlightColor}; background-gradient-end: ${this.criticalColor}; border-radius: ${radius};`;
                } else if (entry.known) {
                    const radius = creditHasVisibleBar && quotaHasVisibleBar && !isCredit
                        ? "0 0 2px 2px"
                        : "2px 2px 0 0";
                    style = `background-gradient-direction: vertical; background-gradient-start: #8ed891; background-gradient-end: #5dbb73; border-radius: ${radius};`;
                }
                const barActor = new St.Widget({ width: barWidth, height, style });
                if (entry.partial) barActor.opacity = 155;
                bars.add_child(barActor);
            };
            addBar(
                creditBar,
                hasCreditModel ? creditModel.peakPercent : 0,
                true
            );
            addBar(bar, model.peakPercent, false);
            slot.set_child(bars);
            const tooltipLines = [];
            if (bar && bar.known) {
                tooltipLines.push(UsageFormat.formatActivityBucketTooltipLine(
                    bar,
                    index,
                    barCount,
                    bucketMinutes,
                    endAt,
                    this._use24HourClock
                ));
            }
            if (creditBar && creditBar.known) {
                tooltipLines.push(UsageFormat.formatActivityBucketTooltipLine(
                    creditBar,
                    index,
                    barCount,
                    bucketMinutes,
                    endAt,
                    this._use24HourClock,
                    "credits"
                ));
            }
            const range = UsageFormat.formatActivityBucketRange(
                index,
                barCount,
                bucketMinutes,
                endAt,
                this._use24HourClock
            );
            const fallbackBar = bar || creditBar;
            const fallbackKind = bar ? "percent" : "credits";
            const tooltipText = tooltipLines.length > 0 && range
                ? [range, ...tooltipLines].join("\n")
                : UsageFormat.formatActivityBucketTooltip(
                    fallbackBar,
                    index,
                    barCount,
                    bucketMinutes,
                    endAt,
                    this._use24HourClock,
                    fallbackKind
                );
            slot.accessible_name = UsageFormat.formatAccessibleTooltip(tooltipText);
            this._activityTooltips.push(
                this._createPositionedTooltip(slot, tooltipText)
            );
            plot.add_child(slot);
        }
        chart.add_child(plot);

        const axis = new St.Widget({
            layout_manager: new Clutter.BoxLayout({ homogeneous: true }),
            x_expand: true
        });
        const labelsByAxisSlot = new Map([
            [0, "−24h"],
            [3, "−18h"],
            [6, "−12h"],
            [9, "−6h"],
            [11, _("now")]
        ]);
        for (let index = 0; index < 12; index++) {
            const segment = new St.Bin({ x_expand: true });
            segment.set_alignment(St.Align.MIDDLE, St.Align.MIDDLE);
            const labelText = labelsByAxisSlot.get(index);
            if (labelText) {
                const label = new St.Label({ text: labelText });
                label.style = `font-size: 75%; color: ${this._menuColor(0.62)};`;
                segment.set_child(label);
            }
            axis.add_child(segment);
        }
        chart.add_child(axis);
        column.add_child(chart);

        item.addActor(column, { span: -1, expand: true });
        menu.addMenuItem(item);
    }

    _activityChartStyle(nested, expandedWithScrollbar) {
        const nestedShift = nested ? POPUP_NESTED_CHART_LEFT_SHIFT : 0;
        const extra = expandedWithScrollbar ? POPUP_EXPANDED_RIGHT_INSET : 0;
        const nestedExtra = expandedWithScrollbar && nested
            ? POPUP_EXPANDED_RIGHT_INSET
            : 0;
        return [
            `padding-left: ${10 - nestedShift}px`,
            `padding-right: ${
                POPUP_CHART_RIGHT_INSET + extra + nestedExtra + nestedShift +
                (nested ? POPUP_NESTED_CHART_RIGHT_BALANCE : 0)
            }px`
        ].join("; ") + ";";
    }

    _syncPopupRightInsets() {
        const expandedWithScrollbar = this._historySubmenus.some(
            entry => entry.submenu.menu.isOpen &&
                entry.submenu.menu.actor.vscrollbar_policy === St.PolicyType.AUTOMATIC
        );
        const extra = expandedWithScrollbar ? POPUP_EXPANDED_RIGHT_INSET : 0;
        for (const row of this._popupRightInsetRows) {
            row.style = `padding-right: ${POPUP_RIGHT_INSET + extra}px;`;
        }
        for (const entry of this._activityCharts) {
            entry.chart.style = this._activityChartStyle(
                entry.nested,
                expandedWithScrollbar
            );
        }
        this._queueActionEdgeSync();
        if (this.menu.isOpen) {
            this._lockPopupLayoutWidth();
            this._clampPopupHeight();
        }
    }

    _createPositionedTooltip(
        slot,
        text,
        centerOnPointer = false,
        showDelayMs = ACTIVITY_TOOLTIP_DELAY_MS
    ) {
        const tooltip = new Tooltips.Tooltip(slot, text);
        tooltip.set_text(text);
        const nativeShow = tooltip.show.bind(tooltip);
        tooltip.show = () => {
            nativeShow();
            if (!tooltip.visible || !tooltip.mousePosition) return;

            const monitor = Main.layoutManager.findMonitorForActor(slot);
            const [, naturalWidth] = tooltip._tooltip.get_preferred_width(-1);
            const [, naturalHeight] = tooltip._tooltip.get_preferred_height(
                naturalWidth
            );
            const cursorSize = tooltip.desktop_settings.get_int("cursor-size");
            const preferredLeft = centerOnPointer
                ? tooltip.mousePosition[0] - Math.round(naturalWidth / 2)
                : tooltip.mousePosition[0] + Math.round(cursorSize / 2);
            const preferredTop = tooltip.mousePosition[1] - naturalHeight - Math.round(
                cursorSize / 2
            );
            const left = Math.max(
                monitor.x,
                Math.min(
                    preferredLeft,
                    monitor.x + monitor.width - naturalWidth
                )
            );
            const top = Math.max(
                monitor.y,
                Math.min(
                    preferredTop,
                    monitor.y + monitor.height - naturalHeight
                )
            );
            tooltip._tooltip.set_position(Math.floor(left), Math.floor(top));
        };
        tooltip._fastShowTimeoutId = 0;
        const cancelFastShow = () => {
            if (!tooltip._fastShowTimeoutId) return;
            Mainloop.source_remove(tooltip._fastShowTimeoutId);
            tooltip._fastShowTimeoutId = 0;
        };
        slot.connect("enter-event", () => {
            cancelFastShow();
            tooltip._fastShowTimeoutId = Mainloop.timeout_add(
                showDelayMs,
                () => {
                    tooltip._fastShowTimeoutId = 0;
                    if (!slot.has_pointer || tooltip.visible) return GLib.SOURCE_REMOVE;
                    if (tooltip._showTimer) {
                        Mainloop.source_remove(tooltip._showTimer);
                        tooltip._showTimer = null;
                    }
                    tooltip.show();
                    return GLib.SOURCE_REMOVE;
                }
            );
            return Clutter.EVENT_PROPAGATE;
        });
        slot.connect("leave-event", () => {
            cancelFastShow();
            return Clutter.EVENT_PROPAGATE;
        });
        slot.connect("destroy", () => {
            cancelFastShow();
        });
        return tooltip;
    }

    _onLayoutSettingChanged() {
        this._rebuildPanel();
    }

    _onChatGptAppPathChanged() {
        this._rebuildMenu();
        this._refreshUsage();
    }

    _onModelVisibilityChanged() {
        this._rebuildPanel();
        this._rebuildMenu();
    }

    _onStyleSettingChanged() {
        this._rebuildPanel();
    }

    _onIntervalChanged() {
        this._restartTimer();
    }

    _restartTimer() {
        if (this._timeoutId) {
            Mainloop.source_remove(this._timeoutId);
            this._timeoutId = 0;
        }
        const minutes = Math.max(1, Number(this.refreshInterval) || 3);
        this._timeoutId = Mainloop.timeout_add_seconds(minutes * 60, () => {
            this._refreshUsage();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _restartCountdownTimer() {
        if (this._countdownTimeoutId) {
            Mainloop.source_remove(this._countdownTimeoutId);
            this._countdownTimeoutId = 0;
        }
        this._countdownTimeoutId = Mainloop.timeout_add_seconds(1, () => {
            if (this.menu && this.menu.isOpen) {
                this._updateResetCountdowns();
                this._updateRelativeTime();
            }
            return GLib.SOURCE_CONTINUE;
        });
    }

    _usageHelperPath() {
        return `${this.metadata.path}/z_usage.py`;
    }

    _refreshUsage(showConfirmation = false) {
        if (this._destroyed) return;
        if (this._busy) {
            this._refreshQueued = true;
            return;
        }

        const python = GLib.find_program_in_path("python3");
        const helper = this._usageHelperPath();
        const apiKey = String(this.apiKey || "").trim();
        if (!python) {
            this._authenticationRequired = false;
            this._lastError = _("python3 was not found");
            this._rebuildPanel();
            this._scheduleMenuRebuild();
            return;
        }

        this._busy = true;
        this._lastError = null;
        this._cancellable = new Gio.Cancellable();
        this._syncRefreshButtonState();
        if (!this._snapshot) this._rebuildPanel();

        try {
            const process = new Gio.Subprocess({
                argv: [
                    python,
                    helper,
                    ...(apiKey ? ["--api-key", apiKey] : []),
                    "--timeout",
                    "25",
                    "--activity-bucket-minutes",
                    String(this.activityBucketMinutes) === "120" ? "120" : "60"
                ],
                flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
            });
            process.init(null);
            this._usageProcess = process;
            process.communicate_utf8_async(null, this._cancellable, (source, result) => {
                this._usageProcess = null;
                this._busy = false;
                this._cancellable = null;
                this._stopRefreshSpinner();
                let succeeded = false;

                try {
                    const [ok, stdout, stderr] = source.communicate_utf8_finish(result);
                    if (!ok || source.get_exit_status() !== 0) {
                        const helperError = UsageFormat.parseUsageHelperError(stderr);
                        const error = new Error(helperError.message);
                        error.authenticationRequired = helperError.authenticationRequired;
                        throw error;
                    }
                    const snapshot = JSON.parse(String(stdout || "").trim());
                    if (!snapshot || !Array.isArray(snapshot.limits)) {
                        throw new Error(_("Usage helper returned invalid data"));
                    }
                    const previousSnapshot = this._snapshot;
                    this._snapshot = snapshot;
                    this._lastError = null;
                    this._authenticationRequired = false;
                    this._recordWeeklyResetState(previousSnapshot, snapshot);
                    this._showUsageNotifications(previousSnapshot, snapshot);
                    succeeded = true;
                } catch (error) {
                    const cancelled = error.matches &&
                        error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED);
                    if (!cancelled) {
                        if (error.authenticationRequired) {
                            this._snapshot = null;
                            this._authenticationRequired = true;
                            this._lastError = null;
                        } else {
                            this._lastError = String(error.message || error).slice(0, 180);
                        }
                        global.logError(_f("%s: usage refresh failed: %s", UUID, error));
                    }
                }

                if (!this._destroyed) {
                    if (showConfirmation && succeeded) this._showRefreshConfirmation();
                    this._rebuildPanel();
                    this._scheduleMenuRebuild();
                    if (this._refreshQueued) {
                        this._refreshQueued = false;
                        this._refreshUsage();
                    }
                }
            });
        } catch (error) {
            this._busy = false;
            this._cancellable = null;
            this._stopRefreshSpinner();
            this._authenticationRequired = false;
            this._lastError = String(error.message || error).slice(0, 180);
            global.logError(_f("%s: could not start usage helper: %s", UUID, error));
            this._rebuildPanel();
            this._scheduleMenuRebuild();
        }
    }

    _showRefreshConfirmation() {
        this._refreshConfirmed = true;
        if (this._refreshConfirmationTimeoutId) {
            Mainloop.source_remove(this._refreshConfirmationTimeoutId);
        }
        this._stopRefreshSpinner();
        this._syncRefreshButtonState();
        this._refreshConfirmationTimeoutId = Mainloop.timeout_add(1800, () => {
            this._refreshConfirmationTimeoutId = 0;
            this._refreshConfirmed = false;
            if (!this._destroyed) this._syncRefreshButtonState();
            return GLib.SOURCE_REMOVE;
        });
    }

    on_applet_clicked() {
        this._rebuildMenu();
        this.menu.toggle();
    }

    on_orientation_changed(orientation) {
        this._isVertical = this._orientationIsVertical(orientation);
        this._isRightPanel = this._orientationIsRight(orientation);
        if (!this._isRightPanel && this.menu) {
            this.menu.actor.set_width(-1);
            this.menu.box.set_width(-1);
            this.menu.box.clip_to_allocation = false;
            this.menu.actor.style = this._rightPanelMenuStyleBase || "";
            this.menu.actor.translation_x = 0;
            for (const entry of this._historySubmenus) {
                this._clearForcedActorWidth(entry.submenu.menu.actor);
                this._clearForcedActorWidth(entry.submenu.menu.box);
            }
        }
        if (!this._root) return;
        this.actor.style = this._isVertical
            ? "padding-left: 0px; padding-right: 0px;"
            : null;
        this._root.set_vertical(this._isVertical);
        this._syncPanelThickness();
        this._rebuildPanel();
    }

    on_panel_height_changed() {
        if (this._isVertical && this.panel) this._panelThickness = this.panel.width;
        this._syncPanelThickness();
    }

    _syncPanelThickness() {
        if (!this._root) return;
        if (this._isVertical) {
            this._root.set_width(this._panelThickness);
            this._root.x_align = Clutter.ActorAlign.START;
        } else {
            this._root.set_width(-1);
            this._root.x_align = Clutter.ActorAlign.FILL;
        }
    }

    _popupWidth() {
        const displayScale = typeof global !== "undefined" ? (global.ui_scale || 1) : 1;
        return Math.round(POPUP_WIDTH * Math.max(1, this._popupTextScale || 1) * displayScale);
    }

    _applyPopupWidth() {
        if (!this.menu) return;
        const baseStyle = this._rightPanelMenuStyleBase
            ? `${this._rightPanelMenuStyleBase}; `
            : "";
        this.menu.actor.style = `${baseStyle}min-width: ${POPUP_WIDTH * Math.max(1, this._popupTextScale || 1)}px;`;
        this.menu.actor.translation_x = 0;
        this._lockPopupLayoutWidth();
    }

    _lockPopupLayoutWidth() {
        if (!this.menu) return;
        const outer = this._rightPanelPopupLockedWidth > 0
            ? this._rightPanelPopupLockedWidth
            : this._popupWidth();
        // The popup actor keeps the full outer width; only the children are
        // clamped to the inner width (outer minus theme padding), otherwise
        // the theme padding pushes them out under the panel.
        const inner = this._menuInnerWidth(outer);
        this.menu.actor.set_width(outer);
        this.menu.box.set_width(outer);
        this.menu.box.clip_to_allocation = true;
        this._forceActorWidth(this.menu._scroll, inner);
        this._forceActorWidth(this.menu._content.actor, inner);
        this.menu._content.actor.clip_to_allocation = false;
        if (this.menu._header) {
            this._forceActorWidth(this.menu._header, inner);
        }
        if (this.menu._footer) {
            this._forceActorWidth(this.menu._footer, inner);
        }
        // Menu items report inflated minimum widths in the scroll regime and
        // would overflow the popup; clamp every item to the inner width.
        const items = this.menu._content.actor.get_children ?
            this.menu._content.actor.get_children() : [];
        for (const child of items) {
            this._forceActorWidth(child, inner);
        }
        for (const entry of this._historySubmenus) {
            this._forceActorWidth(entry.submenu.menu.actor, inner);
            this._forceActorWidth(entry.submenu.menu.box, inner);
        }
    }

    _menuInnerWidth(width) {
        // The popup theme pads the actor even when the theme node reports no
        // padding, so children must never be forced to the full outer width
        // or they overflow past the right edge under the panel.
        return Math.max(200, width - 24);
    }

    _forceActorWidth(actor, width) {
        actor.min_width = width;
        actor.natural_width = width;
        actor.min_width_set = true;
        actor.natural_width_set = true;
        actor.set_width(width);
        actor.clip_to_allocation = true;
    }

    _clampPopupHeight(forActor) {
        if (!this.menu || !this.menu._scroll || !this.menu._content) return;
        if (!this._popupWidth || !this._menuInnerWidth) return;
        if (!Main.layoutManager || !Main.layoutManager.findMonitorForActor) return;
        const monitor = Main.layoutManager.findMonitorForActor(forActor || this.menu.actor);
        if (!monitor || !Number.isFinite(monitor.height) || monitor.height <= 0) return;

        const outer = this._popupWidth();
        const inner = this._menuInnerWidth(outer);
        // Pinned chrome naturals: header on top, footer at the bottom, both
        // outside the scroll view.
        const headerNat = this.menu._header ?
            this.menu._header.get_preferred_height(inner)[1] : 0;
        const footerNat = this.menu._footer ?
            this.menu._footer.get_preferred_height(inner)[1] : 0;

        // The content's natural height at the real inner width (children are
        // freshly built by the rebuild, so this is the true laid-out size).
        const [, contentNat] = this.menu._content.actor.get_preferred_height(inner);

        // The popup gets at most the monitor height minus a small reserve:
        // header and footer keep their space, the scroll view absorbs the
        // rest. The frame height is locked once per open - later section
        // toggles only change the scrollbar range, never the popup frame, so
        // nothing drifts, jumps or gets cut while the popup is open.
        // Reserve the REAL panel edges: Cinnamon positions the popup inside
        // the monitor with visible panels excluded (PanelLoc.top = 0,
        // PanelLoc.bottom = 1), so a too-tall popup bottom-clamps to the
        // monitor and its header hides under the top panel.
        let topReserve = 16;
        let bottomReserve = 0;
        try {
            const panels = typeof Main.panelManager.getPanelsInMonitor === "function"
                ? Main.panelManager.getPanelsInMonitor(monitor.index)
                : (Main.panelManager.panels || []);
            for (const panel of panels) {
                if (!panel || !panel.actor) continue;
                if (panel.getIsVisible && !panel.getIsVisible()) continue;
                const [, panelY] = panel.actor.get_transformed_position();
                const [, panelH] = panel.actor.get_transformed_size();
                if (!Number.isFinite(panelY) || !Number.isFinite(panelH) || panelH <= 0) continue;
                if (panel.panelPosition === 0) {
                    topReserve = Math.max(topReserve, Math.ceil(panelY + panelH - monitor.y) + 16);
                } else if (panel.panelPosition === 1) {
                    bottomReserve = Math.max(bottomReserve, Math.ceil(monitor.y + monitor.height - panelY) + 8);
                }
            }
        } catch (error) {}
        const maxMenu = Math.max(240, monitor.height - topReserve - bottomReserve);
        if (!this._popupFrameHeight) {
            // Only 2px of frame chrome plus a small headroom pad: a larger
            // reserve would show the scrollbar in the default view whenever
            // the natural content exceeds the viewport by a few pixels, and
            // the pad absorbs post-lock content growth. The 16px top-panel
            // slack absorbs the difference instead.
            const viewport = Math.max(200, Math.min(
                contentNat + POPUP_VIEWPORT_PAD,
                maxMenu - headerNat - footerNat - 2
            ));
            this._popupViewport = viewport;
            this._popupFrameHeight = headerNat + viewport + footerNat + 2;
        }
        this.menu._scroll.set_height(this._popupViewport);
        // A fixed popup height up front: Cinnamon positions the popup once
        // with the final size, so nothing jumps or gets cut at the top.
        this.menu.actor.set_height(this._popupFrameHeight);
    }

    _ensureActorVisible(actor) {
        if (!this.menu || !this.menu.isOpen || !this.menu._scroll) return;
        const scroll = this.menu._scroll;
        if (!actor || actor.is_finalized() || !actor.mapped) return;
        const [scrollX, scrollY] = scroll.get_transformed_position();
        const [, scrollH] = scroll.get_transformed_size();
        const [actorX, actorY] = actor.get_transformed_position();
        const [, actorH] = actor.get_transformed_size();
        if (!Number.isFinite(actorY) || !Number.isFinite(actorH) || actorH <= 0) return;
        const adjustment = scroll.get_vscroll_bar().get_adjustment();
        const value = adjustment.get_value();
        const relativeTop = actorY - scrollY + value;
        const relativeBottom = relativeTop + actorH;
        const viewTop = value;
        const viewBottom = value + scrollH;
        if (relativeBottom > viewBottom) adjustment.set_value(relativeBottom - scrollH);
        else if (relativeTop < viewTop) adjustment.set_value(relativeTop);
    }

    _clearForcedActorWidth(actor) {
        actor.set_width(-1);
        actor.min_width_set = false;
        actor.natural_width_set = false;
        actor.clip_to_allocation = false;
    }

    _normalizeRightPanelPopupCloseWidth() {
        if (!this._isRightPanel || !this.menu) return;
        const lockedWidth = this._rightPanelPopupLockedWidth;
        if (lockedWidth > 0) this.menu.actor.set_width(lockedWidth);
        // Freeze the popup position across the close: Cinnamon's close()
        // repositions the actor from its preferred size, and theme margins
        // can make that land a few pixels off the open position - the whole
        // content incl. the rings then reads as squeezed sideways before the
        // slide starts. The slide ease keeps running from the frozen spot.
        const menu = this.menu;
        menu._closePositionFrozen = [Math.round(menu.actor.x), Math.round(menu.actor.y)];
        menu._calculatePosition = () => menu._closePositionFrozen;
        // Cinnamon eases the close by MENU_ANIMATION_OFFSET plus the actor
        // margins. The right-panel margins add ~110px, sliding the whole
        // popup under the panel: the green rings (right edge) vanish
        // abruptly and the blue rings get clipped from the right. Zero the
        // margins for the close so the slide is the subtle 12px nudge; the
        // animated-closed handler restores them.
        // Strip x/y from the close ease: Cinnamon animates the actor
        // MENU_ANIMATION_OFFSET (+ theme margins) toward the panel, which
        // visibly shoved the rings under it. With the position frozen and
        // the ease reduced to opacity, the close is a pure fade with zero
        // movement for every element.
        const actor = menu.actor;
        menu._closeEaseRestore = true;
        actor.ease = function (params) {
            const fadeParams = Object.assign({}, params);
            delete fadeParams.x;
            delete fadeParams.y;
            Clutter.Actor.prototype.ease.call(this, fadeParams);
        };
    }

    _orientationIsVertical(orientation) {
        return orientation === St.Side.LEFT || orientation === St.Side.RIGHT;
    }

    _orientationIsRight(orientation) {
        return orientation === St.Side.RIGHT;
    }

    on_applet_removed_from_panel() {
        this._destroyed = true;
        if (this.menu && this.menu.isOpen) this.menu.close(false);
        if (this._actionEdgeSyncQueuedId) {
            Mainloop.source_remove(this._actionEdgeSyncQueuedId);
            this._actionEdgeSyncQueuedId = 0;
        }
        if (this._timeoutId) {
            Mainloop.source_remove(this._timeoutId);
            this._timeoutId = 0;
        }
        if (this._countdownTimeoutId) {
            Mainloop.source_remove(this._countdownTimeoutId);
            this._countdownTimeoutId = 0;
        }
        if (this._refreshConfirmationTimeoutId) {
            Mainloop.source_remove(this._refreshConfirmationTimeoutId);
            this._refreshConfirmationTimeoutId = 0;
        }
        if (this._rightPanelPopupClosedId) {
            this.menu.disconnect(this._rightPanelPopupClosedId);
            this._rightPanelPopupClosedId = 0;
        }
        if (this._rightPanelPopupOpenStateChangedId) {
            this.menu.disconnect(this._rightPanelPopupOpenStateChangedId);
            this._rightPanelPopupOpenStateChangedId = 0;
        }
        if (this._menuRebuildTimeoutId) {
            Mainloop.source_remove(this._menuRebuildTimeoutId);
            this._menuRebuildTimeoutId = 0;
        }
        if (this._screenshotCopyTimeoutId) {
            Mainloop.source_remove(this._screenshotCopyTimeoutId);
            this._screenshotCopyTimeoutId = 0;
        }
        if (this._screenshotResetTimeoutId) {
            Mainloop.source_remove(this._screenshotResetTimeoutId);
            this._screenshotResetTimeoutId = 0;
        }
        this._destroyScreenshotContextMenu();
        if (this._screenshotTempFile) {
            try {
                this._screenshotTempFile.delete(null);
            } catch (error) {
                global.logWarning(`${UUID}: screenshot cleanup failed: ${error}`);
            }
            this._screenshotTempFile = null;
        }
        this._stopRefreshSpinner();
        for (const process of [this._usageProcess]) {
            if (process) {
                // SIGTERM lets the Python helper terminate and reap its backend.
                process.send_signal(15);
                process.wait_async(null, (source, result) => {
                    try { source.wait_finish(result); } catch (error) {
                        global.logWarning(`${UUID}: helper cleanup failed: ${error}`);
                    }
                });
            }
        }
        if (this._cancellable) {
            this._cancellable.cancel();
            this._cancellable = null;
        }
        this._refreshQueued = false;
        if (this._installHelpDialog) {
            this._installHelpDialog.destroy();
            this._installHelpDialog = null;
        }
        if (this._clockSettings && this._clockChangedId) {
            this._clockSettings.disconnect(this._clockChangedId);
            this._clockChangedId = 0;
        }
        if (this._clockSettings && this._animationsChangedId) {
            this._clockSettings.disconnect(this._animationsChangedId);
            this._animationsChangedId = 0;
        }
        if (this._clockSettings && this._textScaleChangedId) {
            this._clockSettings.disconnect(this._textScaleChangedId);
            this._textScaleChangedId = 0;
        }
        this._stopResetExpiryBreathing();
        this._resetExpiryBreathingLabels = [];
        this._clockSettings = null;
        if (this.menu) {
            this.menu.destroy();
            this.menu = null;
        }
        this._activityTooltips = [];
        if (this.settings) this.settings.finalize();
    }
}

// Cinnamon loads this entry point by name.
// eslint-disable-next-line no-unused-vars
function main(metadata, orientation, panelHeight, instanceId) {
    Gettext.bindtextdomain(
        UUID,
        GLib.build_filenamev([GLib.get_user_data_dir(), "locale"])
    );
    return new ZUsageApplet(metadata, orientation, panelHeight, instanceId);
}
