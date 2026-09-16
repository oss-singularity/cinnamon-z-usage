#!/usr/bin/env bash
set -Eeuo pipefail

variant=${1:?variant is required}
geometry_file=${2:?geometry output path is required}
panel_mode=${3:-vertical}
panel_geometry_file=${4:-}
uuid='z-usage@oss-singularity'

case "$variant" in
    basic|overview|history|bucket|four|credits|credits-panel|panel|panel-tooltip|settings-general|settings-colors) ;;
    *)
        printf 'Unsupported variant: %s\n' "$variant" >&2
        exit 2
        ;;
esac

case "$panel_mode" in
    vertical)
        panel_setting="['3:0:right']"
        panel_position='3'
        ;;
    horizontal)
        panel_setting="['1:0:top']"
        panel_position='0'
        ;;
    bottom)
        panel_setting="['1:0:bottom']"
        panel_position='1'
        ;;
    left)
        panel_setting="['1:0:left']"
        panel_position='2'
        ;;
    *)
        printf 'Unsupported panel mode: %s\n' "$panel_mode" >&2
        exit 2
        ;;
esac

for command in cinnamon gdbus gsettings xdotool xdpyinfo; do
    command -v "$command" >/dev/null || {
        printf 'capture-readme-variant: missing command: %s\n' "$command" >&2
        exit 2
    }
done

[[ "$geometry_file" == /* ]] || {
    printf 'capture-readme-variant: geometry path must be absolute\n' >&2
    exit 2
}
if [[ -n "$panel_geometry_file" && "$panel_geometry_file" != /* ]]; then
    printf 'capture-readme-variant: panel geometry path must be absolute\n' >&2
    exit 2
fi

eval_cinnamon() {
    gdbus call \
        --session \
        --dest org.Cinnamon \
        --object-path /org/Cinnamon \
        --method org.Cinnamon.Eval \
        "$1"
}

driver_dir=$(mktemp -d "${TMPDIR:-/tmp}/cinnamon-readme-driver.XXXXXX")
cinnamon_pid=''

cleanup() {
    local status=$?
    set +e
    # run-isolated.sh intentionally sends TERM after its root frame. Treat
    # that controlled driver shutdown as a successful capture.
    if (( status == 143 )); then status=0; fi
    if [[ -n "$cinnamon_pid" ]] && kill -0 "$cinnamon_pid" 2>/dev/null; then
    eval_cinnamon 'JSON.stringify((function(){var a=Main.AppletManager.getRunningInstancesForUuid("z-usage@oss-singularity")[0];if(!a)return {restored:false};if(a.menu&&a.menu.isOpen)a.menu.close(false);if(a.__captureOriginalSnapshot!==undefined){a._snapshot=a.__captureOriginalSnapshot;a._lastError=a.__captureOriginalLastError;a._authenticationRequired=a.__captureOriginalAuthRequired;a.showModelLimitsInPanel=a.__captureOriginalShowModelLimitsInPanel;a.showCreditsInPanel=a.__captureOriginalShowCreditsInPanel;a._rebuildPanel();a._rebuildMenu();}if(a.__captureBackgroundActor){a.__captureBackgroundActor.destroy();a.__captureBackgroundActor=null;}if(global.background_actor){if(a.__captureOriginalBackgroundVisible)global.background_actor.show();else global.background_actor.hide();}var desk=imports.ui.main.deskletContainer&&imports.ui.main.deskletContainer.actor;if(desk&&a.__captureOriginalDeskletsVisible)desk.show();if(desk&&!a.__captureOriginalDeskletsVisible)desk.hide();var pointer=a.__captureOriginalPointer;if(pointer)global.set_pointer(pointer[0],pointer[1]);return {restored:true};})())' >/dev/null 2>&1 || true
        kill -TERM "$cinnamon_pid" 2>/dev/null || true
        for _ in {1..40}; do
            kill -0 "$cinnamon_pid" 2>/dev/null || break
            sleep 0.05
        done
        kill -KILL "$cinnamon_pid" 2>/dev/null || true
        wait "$cinnamon_pid" 2>/dev/null || true
    fi
    rm -rf -- "$driver_dir"
    exit "$status"
}
trap cleanup EXIT INT TERM

# Private dconf is provided by run-isolated.sh; no setting below reaches the
# user's real Cinnamon configuration.
# The Z applet runs the in-memory fixture below; no account-backed
# requests happen in the private session.
unset LC_ALL
export LANG=C.UTF-8 LC_MESSAGES=C.UTF-8 LC_TIME=de_DE.UTF-8
export GTK_THEME="${QA_GTK_THEME:-Mint-Y}"

gsettings set org.cinnamon panels-enabled "$panel_setting"
gsettings set org.cinnamon enabled-applets "[]"
gsettings set org.cinnamon enabled-desklets "[]"
gsettings set org.cinnamon.theme name "${QA_THEME:-Mint-Y-Dark}"
gsettings set org.cinnamon.desktop.interface gtk-theme "${QA_THEME:-Mint-Y-Dark}"
gsettings set org.cinnamon.desktop.interface icon-theme "${QA_ICON_THEME:-Adwaita}"
gsettings set org.cinnamon.desktop.interface text-scaling-factor "${QA_TEXT_SCALE:-1.0}"
gsettings set org.cinnamon.desktop.interface enable-animations "${QA_ANIMATIONS:-true}"
gsettings set org.cinnamon desktop-effects "${QA_ANIMATIONS:-true}"

cinnamon --replace --sm-disable >"$driver_dir/cinnamon.log" 2>&1 &
cinnamon_pid=$!

# Wait until Cinnamon has loaded its normal panel and applet manager.
for _ in {1..100}; do
    if gdbus call --session --dest org.Cinnamon --object-path /org/Cinnamon --method org.Cinnamon.Eval 'String(Boolean(Main&&Main.AppletManager&&Main.AppletManager.appletsLoaded&&Main.panelManager&&Main.panelManager.panels.length>0))' 2>/dev/null | grep -qE "['\"]true['\"]"; then
        break
    fi
    sleep 0.2
done

# Keep the private dconf defaults untouched. Add one disposable definition to
# Cinnamon's in-memory manager and ask the normal extension loader to load the
# copied regular-file applet. This avoids a startup-time settings rewrite in
# Cinnamon 6.6 while preserving the real applet/module/panel path.
panel_setup='JSON.stringify((function(){var uuid="z-usage@oss-singularity",desired=PANEL_POSITION,panel=Main.panelManager.panels.filter(function(p){return p&&p.panelPosition===desired;})[0]||Main.panelManager.panels[1],defs=Main.AppletManager.definitions;if(!panel)throw new Error("private panel unavailable");defs.push({panelId:panel.panelId,orientation:Main.AppletManager.setOrientationForPanel(panel.panelPosition),location_label:"right",center:false,order:13,uuid:uuid,real_uuid:uuid,applet_id:"9001",applet:null});imports.ui.extension.loadExtension(uuid,imports.ui.extension.Type.APPLET);return {definitions:defs.length,panelId:panel.panelId,position:panel.panelPosition,requested:true};})())'
panel_setup=${panel_setup//PANEL_POSITION/$panel_position}
panel_setup_result=$(eval_cinnamon "$panel_setup" 2>&1 || true)
if [[ "$panel_setup_result" != *'(true,'* ]]; then
    printf 'capture-readme-variant: panel setup failed: %s\n' "$panel_setup_result" >&2
    exit 1
fi

instance_ready=''
for _ in {1..100}; do
    instance_ready=$(eval_cinnamon "String(Main.AppletManager.getRunningInstancesForUuid(\"$uuid\").length)" 2>/dev/null || true)
    if [[ "$instance_ready" == *"'1'"* || "$instance_ready" == *'"1"'* ]]; then break; fi
    sleep 0.2
done
if [[ "$instance_ready" != *"'1'"* && "$instance_ready" != *'"1"'* ]]; then
    printf 'capture-readme-variant: applet did not register: %s\n' "$instance_ready" >&2
    sed -n '1,180p' "$driver_dir/cinnamon.log" >&2
    exit 1
fi

# Let the normal startup refresh settle before replacing only the display
# snapshot with the in-memory fixture below.
sleep 2

read -r -d '' setup_code <<'JSEOF' || true
JSON.stringify((function(){
    var a=Main.AppletManager.getRunningInstancesForUuid("z-usage@oss-singularity")[0];
    if(!a)throw new Error("applet not found");
    a.__captureOriginalSnapshot=a._snapshot;
    a.__captureOriginalLastError=a._lastError;
    a.__captureOriginalAuthRequired=a._authenticationRequired;
    a.__captureOriginalShowModelLimitsInPanel=a.showModelLimitsInPanel;
    a.__captureOriginalShowCreditsInPanel=a.showCreditsInPanel;
    a.__captureOriginalDeskletsVisible=!!(imports.ui.main.deskletContainer&&imports.ui.main.deskletContainer.actor&&imports.ui.main.deskletContainer.actor.visible);
    a.__captureOriginalPointer=global.get_pointer();
    a.__captureOriginalBackgroundVisible=!!(global.background_actor&&global.background_actor.visible);
    if(global.background_actor)global.background_actor.hide();
    var GLib=imports.gi.GLib,St=imports.gi.St,Clutter=imports.gi.Clutter;
    var stageBg=global.stage.get_children()[0];
    if(stageBg){
        stageBg.set_background_color(new Clutter.Color({red:11,green:114,blue:133,alpha:255}));
        var backgroundPath=GLib.getenv("CINNAMON_ISOLATED_BACKGROUND_IMAGE");
        var backgroundActor=St.TextureCache.get_default().load_file_simple(backgroundPath);
        backgroundActor.reactive=false;
        backgroundActor.set_position(0,0);backgroundActor.set_size(global.screen_width,global.screen_height);stageBg.insert_child_at_index(backgroundActor,0);a.__captureBackgroundActor=backgroundActor;
    }
    var now=Math.floor(Date.now()/1000),updated=now-120;
    function win(duration,remaining,offset){return {durationMinutes:duration,usedPercent:100-remaining,remainingPercent:remaining,resetsAt:now+offset};}
    function bucket(value){return {consumedPercent:value,complete:true,observed:true};}
    function creditBucket(value){return {consumed:value,complete:true,observed:true};}
    function historyWindow(id,label,duration,periods,values){periods["24h"]={consumedPercent:values.reduce(function(a,b){return a+b;},0),complete:true};return {id:id,label:label,durationMinutes:duration,trackedSince:now-8*86400,periods:periods,activity24h:values.map(bucket)};}
    var zaiLabel="Z.ai Coding Plan",globalLabel="Global Build · GLM-5.3-Flash",startLabel="Start Plan · GLM-5.3";
    var hasGlobal="VARIANT"!=="credits"&&"VARIANT"!=="credits-panel";
    var zaiWindows=[win(300,93,3*3600+41*60),win(10080,97,6*86400+3*3600)];
    var globalWindows=[win(822,87,3*3600+41*60),win(10080,76,6*86400+3*3600)];
    var startWindows=[win(1440,100,5*3600)];
    if("VARIANT"==="four"){globalWindows.unshift(win(300,68,2*3600+13*60));}
    var zaiValues=[0,0,0,0,0,1,2,3,1,0,1,0,0,0,2,0,0,0,2,0,0,0,0,0];
    var globalValues=[0,0,0,0,0,0,1,0,0,0,0,0,0,2,0,0,0,0,1,0,0,0,0,0];
    var zaiPeriods={"1h":{consumedPercent:3,complete:true},"4h":{consumedPercent:10,complete:true}};
    var globalPeriods={"1h":{consumedPercent:5,complete:true},"4h":{consumedPercent:11,complete:true},"12h":{consumedPercent:18,complete:true},today:{consumedPercent:18,complete:true}};
    var zaiHistory=historyWindow("zai",zaiLabel,300,zaiPeriods,zaiValues);
    var zaiWeeklyHistory=historyWindow("zai",zaiLabel,10080,{"1h":{consumedPercent:1,complete:true},"4h":{consumedPercent:2,complete:true}},[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,2,0,0,1,0]);
    var globalHistory=historyWindow("zai-global-build-glm-5-3-flash",globalLabel,822,globalPeriods,globalValues);
    var creditPeriods={"24h":{consumed:97.8,complete:true},"12h":{consumed:84.4,complete:true},"4h":{consumed:73.8,complete:true},"1h":{consumed:20.1,complete:true}};
    var creditValues=[0,2.2,3.4,4.8,3.0,1.0,0,0,0,0,0,0,0,0,0,0,0,0,2.0,7.6,17.2,28.4,8.1,20.1];
    var historyWindows=[zaiHistory,zaiWeeklyHistory,globalHistory];
    var limits=[{id:"zai",label:zaiLabel,planType:"max",source:"coding-plan",windows:zaiWindows},
        {id:"zai-global-build-glm-5-3-flash",label:globalLabel,planType:"Global Build",source:"zcode-plan",windows:globalWindows,usedCredits:87000000,totalCredits:100000000},
        {id:"zai-start-plan-glm-5-3",label:startLabel,planType:"Start Plan",source:"zcode-plan",windows:startWindows}];
    a.panelTextColor="#ffffff";
    a._snapshot={
        updatedAt:updated,
        limits:limits,
        credits:{balance:"135153.0",availableResetCount:0,nextResetExpiresAt:now+10*86400+4*3600,resetCredits:null,hasCredits:true,unlimited:false,plan:"max",showLimitResets:false},
        history:{trackedSince:now-8*86400,activityBucketMinutes:60,activityEndAt:Math.ceil(now/3600)*3600,creditPeriods:creditPeriods,creditActivity24h:creditValues.map(creditBucket),windows:historyWindows}
    };
    if("VARIANT"==="overview"){
        a._snapshot.limits[0].windows=[win(300,0,3*3600+16*3600),win(10080,97,6*86400+3*3600)];
        a._snapshot.credits={balance:"135007.0",availableResetCount:0,nextResetExpiresAt:now+29*86400+13*3600,resetCredits:null,hasCredits:true,unlimited:false,plan:"max",showLimitResets:false};
        a._snapshot.history.windows[0].periods={"1h":{consumedPercent:0,complete:true},"4h":{consumedPercent:0,complete:true},"12h":{consumedPercent:30,complete:true},today:{consumedPercent:85,complete:true}};
        a._snapshot.history.windows[0].activity24h=[0,0,0,0,0,1,3,5,3,2,4,3,2,21,21,0,7,8,8,0,0,0,0,0].map(bucket);
        a._snapshot.history.creditActivity24h=creditValues.map(creditBucket);
    }
    var alertMode=GLib.getenv("QA_PANEL_ALERTS");
    if(alertMode==="on"||alertMode==="off"){
        a.showPanelThresholdColors=alertMode==="on";
        a._snapshot.limits=[{id:"zai",label:zaiLabel,planType:"max",source:"coding-plan",windows:[win(300,25,3600),win(10080,10,86400)]}];
        a._snapshot.history.creditPeriods={};
        a._snapshot.history.creditActivity24h=[];
    }
    if(GLib.getenv("QA_MODEL_SPECIFIC_LIMITS")==="off")a.showModelSpecificLimits=false;
    a._lastError=null;a._authenticationRequired=false;a.showModelLimitsInPanel=true;
    var creditsMode=GLib.getenv("QA_SHOW_CREDITS_IN_PANEL");
    if(creditsMode==="1"||creditsMode==="0")a.showCreditsInPanel=creditsMode==="1";
    a._rebuildPanel();a._rebuildMenu();
    imports.ui.main.deskletContainer.actor.hide();
    return {staged:true,variant:"VARIANT",menuOpen:!!a.menu.isOpen};
})())
JSEOF
setup_code=${setup_code//VARIANT/$variant}
eval_cinnamon "$setup_code" >/dev/null

if [[ "${QA_SHOW_CREDITS_IN_PANEL:-}" == 1 ]]; then
    credits_panel=$(eval_cinnamon 'String((function(){var a=Main.AppletManager.getRunningInstancesForUuid("z-usage@oss-singularity")[0];return a._root.get_children().some(function(child){return child.get_children&&child.get_children().some(function(grandchild){return grandchild.text==="AIC";});});})())')
    if [[ "$credits_panel" != *true* ]]; then
        printf 'Credits panel setting did not render an AIC block\n' >&2
        exit 1
    fi
    printf 'credits-panel=true\n'
fi

if [[ "${QA_NOTIFICATION_RETENTION:-0}" == 1 ]]; then
    # shellcheck source=tests/ui/check-notifications.sh
    source "$(dirname -- "$0")/check-notifications.sh"
fi

if [[ "$variant" == settings-* ]]; then
    if [[ "$variant" == settings-notifications ]]; then
        # Keep the dependent notification rows in the screenshot while showing
        # the real disabled state from the native custom widgets.
        eval_cinnamon 'JSON.stringify((function(){var a=Main.AppletManager.getRunningInstancesForUuid("z-usage@oss-singularity")[0];a.settings.setValue("notify-all-weekly-resets",true);a.settings.setValue("enable-five-hour-low-notifications",false);a.settings.setValue("enable-weekly-low-notifications",false);return true;})())' >/dev/null
    fi
    case "$variant" in
        settings-general) settings_tab=0 ;;
        settings-colors) settings_tab=1 ;;
        settings-notifications) settings_tab=2 ;;
    esac
    python3 /usr/share/cinnamon/cinnamon-settings/xlet-settings.py applet "$uuid" -t "$settings_tab" >"$driver_dir/settings.log" 2>&1 &
    sleep 2
    eval_cinnamon 'JSON.stringify((function(){var w=global.get_window_actors().map(function(a){return a.meta_window;}).filter(function(w){return w.get_title()==="Z Usage Monitor";})[0];if(!w)throw new Error("Settings window missing");var r=w.get_frame_rect();w.move_frame(false,global.screen_width-40-r.width-48,global.screen_height-r.height-48);return true;})())' >/dev/null
    sleep 1
elif [[ "$variant" == "panel" || "$variant" == "credits-panel" || "$variant" == "panel-tooltip" ]]; then
    :
else
    eval_cinnamon 'JSON.stringify((function(){var a=Main.AppletManager.getRunningInstancesForUuid("z-usage@oss-singularity")[0];if(a.menu.isOpen)a.menu.close(false);a.on_applet_clicked();return {menuOpen:!!a.menu.isOpen};})())' >/dev/null
fi
sleep 1

# Documentation composition requested by the maintainer: keep native dialog
# contents and size, position beside the right panel, and soften only the
# private desktop's modal shade. Production modal behavior is unchanged.
if [[ "${QA_RELEASE_REVIEW:-0}" == 1 ]]; then
    # shellcheck source=tests/ui/check-release.sh
    source "$(dirname "$0")/check-release.sh"
fi

if [[ "${QA_MODEL_SPECIFIC_LIMITS:-}" == off ]]; then
    model_visibility=$(eval_cinnamon 'String((function(){var a=Main.AppletManager.getRunningInstancesForUuid("z-usage@oss-singularity")[0],original=JSON.stringify(a._snapshot);if(a._limitSections.length||a._historySubmenus.length)return false;a.showModelSpecificLimits=true;a._onModelVisibilityChanged();if(!a._limitSections.length||!a._historySubmenus.length)return false;a.showModelSpecificLimits=false;a._onModelVisibilityChanged();return !a._limitSections.length&&!a._historySubmenus.length&&JSON.stringify(a._snapshot)===original;})())')
    if ! grep -qE "['\"]true['\"]" <<< "$model_visibility"; then
        printf 'Model-specific limits did not hide/restore cleanly\n' >&2
        exit 1
    fi
    printf 'Model visibility: both Spark sections hidden, restored and hidden again; snapshot unchanged\n'
fi

if [[ "${QA_ALIGNMENT:-0}" == 1 ]]; then
    eval_cinnamon 'JSON.stringify((function(){var a=Main.AppletManager.getRunningInstancesForUuid("z-usage@oss-singularity")[0];a.__alignmentOriginal=a.showModelSpecificLimits;return true;})())' >/dev/null
    for enabled in true false true; do
        eval_cinnamon "JSON.stringify((function(){var a=Main.AppletManager.getRunningInstancesForUuid(\"z-usage@oss-singularity\")[0];a.showModelSpecificLimits=$enabled;a._onModelVisibilityChanged();return true;})())" >/dev/null
        sleep 0.4
        # shellcheck source=tests/ui/check-content-alignment.sh
        source "$(dirname "$0")/check-content-alignment.sh"
    done
    eval_cinnamon 'JSON.stringify((function(){var a=Main.AppletManager.getRunningInstancesForUuid("z-usage@oss-singularity")[0];a.showModelSpecificLimits=a.__alignmentOriginal;delete a.__alignmentOriginal;a._onModelVisibilityChanged();return true;})())' >/dev/null
    sleep 0.4
fi

case "$variant" in
    basic|overview|history|bucket|four|credits)
        for lifecycle in rebuild reopen; do
            if [[ "$lifecycle" == rebuild ]]; then
                eval_cinnamon 'Main.AppletManager.getRunningInstancesForUuid("z-usage@oss-singularity")[0]._rebuildMenu()' >/dev/null
            else
                eval_cinnamon 'JSON.stringify((function(){var a=Main.AppletManager.getRunningInstancesForUuid("z-usage@oss-singularity")[0];a.menu.close(false);a.on_applet_clicked();return true;})())' >/dev/null
            fi
            sleep 0.3
            popup_width=$(eval_cinnamon 'String(Math.round(Main.AppletManager.getRunningInstancesForUuid("z-usage@oss-singularity")[0].menu.actor.get_transformed_size()[0]))' | grep -oE '[0-9]+' | tail -1)
            expected_width=$(eval_cinnamon 'String(Math.round(419*(global.ui_scale||1)*Math.max(1,new imports.gi.Gio.Settings({schema_id:"org.cinnamon.desktop.interface"}).get_double("text-scaling-factor"))))' | grep -oE '[0-9]+' | tail -1)
            [[ "$popup_width" == "$expected_width" ]] || { printf 'Unexpected popup width after %s: %s (expected %s)\n' "$lifecycle" "$popup_width" "$expected_width" >&2; exit 1; }
            printf 'popup-width-%s=%s\n' "$lifecycle" "$popup_width"
            # shellcheck source=tests/ui/check-popup-content.sh
            source "$(dirname "$0")/check-popup-content.sh"
            # shellcheck source=tests/ui/check-content-alignment.sh
            source "$(dirname "$0")/check-content-alignment.sh"
        done
        ;;
esac

if [[ "$variant" == "panel-tooltip" ]]; then
    point=$(eval_cinnamon 'JSON.stringify((function(){var a=Main.AppletManager.getRunningInstancesForUuid("z-usage@oss-singularity")[0],p=a.actor.get_transformed_position(),s=a.actor.get_transformed_size();return [Math.round(p[0]+s[0]/2),Math.round(p[1]+s[1]/2)].join(",");})())' | grep -oE '[0-9]+,[0-9]+' | tail -1)
    IFS=, read -r hover_x hover_y <<< "$point"
    xdotool mousemove "$hover_x" "$hover_y"
    sleep 1
fi
if [[ "$variant" == "bucket" ]]; then
    hover_geometry=$(eval_cinnamon 'JSON.stringify((function(){var a=Main.AppletManager.getRunningInstancesForUuid("z-usage@oss-singularity")[0],charts=a._activityCharts;if(!charts||charts.length<2)throw new Error("activity chart unavailable");var plot=charts[charts.length-1].chart.get_children()[0],slots=plot.get_children(),slot=slots[slots.length-1],p=slot.get_transformed_position(),s=slot.get_transformed_size();return [Math.round(p[0]+s[0]/2),Math.round(p[1]+s[1]/2)].join(",");})())' | grep -oE '[0-9]+,[0-9]+' | tail -1)
    IFS=, read -r hover_x hover_y <<< "$hover_geometry"
    xdotool mousemove "$hover_x" "$hover_y" >/dev/null
    sleep 1
fi

if [[ "$variant" == settings-* ]]; then
    menu_geometry=$(eval_cinnamon 'JSON.stringify((function(){var w=global.get_window_actors().map(function(a){return a.meta_window;}).filter(function(w){return w.get_title()==="Z Usage Monitor";})[0],r=w.get_frame_rect();return [r.x,r.y,r.width,r.height].join(",");})())' | grep -oE '[0-9]+,[0-9]+,[0-9]+,[0-9]+' | tail -1)
elif [[ "$variant" == install-* ]]; then
    menu_geometry=$(eval_cinnamon 'JSON.stringify((function(){var d=Main.AppletManager.getRunningInstancesForUuid("z-usage@oss-singularity")[0]._installHelpDialog.dialogLayout,p=d.get_transformed_position(),s=d.get_transformed_size();return [Math.round(p[0]),Math.round(p[1]),Math.round(s[0]),Math.round(s[1])].join(",");})())' | grep -oE '[0-9]+,[0-9]+,[0-9]+,[0-9]+' | tail -1)
elif [[ "$variant" == "panel-tooltip" ]]; then
    menu_geometry=$(eval_cinnamon 'JSON.stringify((function(){var a=Main.AppletManager.getRunningInstancesForUuid("z-usage@oss-singularity")[0],d=a._applet_tooltip._tooltip,p=d.get_transformed_position(),s=d.get_transformed_size();return [Math.round(p[0]),Math.round(p[1]),Math.round(s[0]),Math.round(s[1])].join(",");})())' | grep -oE '[0-9]+,[0-9]+,[0-9]+,[0-9]+' | tail -1)
elif [[ "$variant" == "panel" || "$variant" == "credits-panel" ]]; then
    menu_geometry='0,0,0,0'
else
    menu_geometry=$(eval_cinnamon 'JSON.stringify((function(){var a=Main.AppletManager.getRunningInstancesForUuid("z-usage@oss-singularity")[0],p=a.menu.actor.get_transformed_position(),s=a.menu.actor.get_transformed_size();return [Math.round(p[0]),Math.round(p[1]),Math.round(s[0]),Math.round(s[1])].join(",");})())' | grep -oE '[0-9]+,[0-9]+,[0-9]+,[0-9]+' | tail -1)
fi
printf '%s\n' "$menu_geometry" >"$geometry_file"
printf 'private-menu=%s variant=%s\n' "$menu_geometry" "$variant"

if [[ -n "$panel_geometry_file" ]]; then
    panel_geometry=$(eval_cinnamon 'JSON.stringify((function(){var a=Main.AppletManager.getRunningInstancesForUuid("z-usage@oss-singularity")[0],p=a.panel.actor.get_transformed_position(),s=a.panel.actor.get_transformed_size(),q=a.actor.get_transformed_position(),t=a.actor.get_transformed_size();return [Math.round(p[0]),Math.round(p[1]),Math.round(s[0]),Math.round(s[1]),Math.round(q[0]),Math.round(q[1]),Math.round(t[0]),Math.round(t[1])].join(",");})())' | grep -oE '[0-9]+,[0-9]+,[0-9]+,[0-9]+,[0-9]+,[0-9]+,[0-9]+,[0-9]+' | tail -1)
    printf '%s\n' "$panel_geometry" >"$panel_geometry_file"
    printf 'private-panel=%s\n' "$panel_geometry"
fi

if [[ "${QA_REQUIRE_TRANSPARENT_PANEL:-0}" == 1 ]]; then
    panel_alpha=$(eval_cinnamon 'String(Main.AppletManager.getRunningInstancesForUuid("z-usage@oss-singularity")[0].panel.actor.get_theme_node().get_background_color().alpha)' | grep -oE '[0-9]+' | tail -1)
    [[ "$panel_alpha" =~ ^[0-9]+$ && "$panel_alpha" -lt 255 ]] || { printf 'Expected transparent native panel, got alpha=%s\n' "$panel_alpha" >&2; exit 1; }
    printf 'private-panel-alpha=%s\n' "$panel_alpha"
fi

if [[ "${QA_TEARDOWN:-0}" == 1 ]]; then
    # Exercise Cinnamon's actual removal path with a visible native tooltip.
    eval_cinnamon 'JSON.stringify((function(){var a=Main.AppletManager.getRunningInstancesForUuid("z-usage@oss-singularity")[0];global.__removedUsageApplet=a;global.__removedUsageMenu=a.menu;var def=Main.AppletManager.definitions.filter(function(d){return d.applet===a;})[0];Main.AppletManager.removeAppletFromPanels(def,false);return true;})())' >/dev/null
    sleep 1
    removed=$(eval_cinnamon 'String((function(){var a=global.__removedUsageApplet;return a._destroyed && !a.menu && !a._timeoutId && !a._countdownTimeoutId && !a._menuRebuildTimeoutId && !a._refreshSpinnerTimeoutId && !a._clockChangedId && !a._animationsChangedId && !a._textScaleChangedId && !global.__removedUsageMenu._focusSignalId && !global.__removedUsageMenu._focusRevealId && !a._cancellable && !a._resetCancellable && !a._activityTooltips.length && global.menuStack.indexOf(global.__removedUsageMenu)<0 && !Main.AppletManager.getRunningInstancesForUuid("z-usage@oss-singularity").length;})())')
    if ! grep -qE "['\"]true['\"]" <<< "$removed"; then
        printf 'Native applet teardown failed: %s\n' "$removed" >&2
        exit 1
    fi
    printf 'Release QA: native removal with tooltip clears menu, timers, settings signals and cancellables\n'
fi

# Keep Cinnamon alive until run-isolated.sh takes its single root frame.
sleep 30
