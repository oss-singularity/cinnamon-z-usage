#!/usr/bin/env bash
set -Eeuo pipefail
uuid='z-usage@oss-singularity'
eval_cinnamon() {
    gdbus call --session --dest org.Cinnamon --object-path /org/Cinnamon --method org.Cinnamon.Eval "$1"
}
gsettings set org.cinnamon panels-enabled "['3:0:right']"
gsettings set org.cinnamon enabled-applets "[]"
gsettings set org.cinnamon enabled-desklets "[]"
cinnamon --replace --sm-disable >/tmp/z-capture-cinnamon.log 2>&1 &
state=''
for _ in {1..120}; do
    state=$(eval_cinnamon 'JSON.stringify({loaded:!!(Main&&Main.AppletManager&&Main.AppletManager.appletsLoaded)})' 2>/dev/null || true)
    [[ "$state" == *'true'* ]] && break
    sleep 0.25
done
reg='JSON.stringify((function(){var uuid="z-usage@oss-singularity",panel=Main.panelManager.panels.filter(function(p){return p&&p.panelPosition===3;})[0],defs=Main.AppletManager.definitions;if(!panel)throw new Error("panel unavailable");var d={panelId:panel.panelId,orientation:Main.AppletManager.setOrientationForPanel(panel.panelPosition),location_label:"right",center:false,order:13,uuid:uuid,real_uuid:uuid,applet_id:"9001",applet:null};defs.push(d);return String(imports.ui.extension.loadExtension(uuid,imports.ui.extension.Type.APPLET));})())'
eval_cinnamon "$reg" >/dev/null 2>&1 || true
for _ in {1..120}; do
    instances=$(eval_cinnamon "JSON.stringify(Main.AppletManager.getRunningInstancesForUuid(\"$uuid\").length)" 2>/dev/null || true)
    [[ "$instances" == *'1'* ]] && break
    sleep 0.5
done
sleep 2

stage='JSON.stringify((function(){var applet=Main.AppletManager.getRunningInstancesForUuid("z-usage@oss-singularity")[0];if(!applet)return "NO_APPLET";var now=Math.floor(Date.now()/1000);
function buckets(n){var a=[];for(var i=0;i<n;i++){a.push({consumedPercent:(i*7)%23,complete:true,observed:(i%4)!==0});}return a;}
var demo={updatedAt:now,limits:[
{id:"zai",label:"Z.ai Coding Plan",planType:"max",source:"coding-plan",windows:[{durationMinutes:300,usedPercent:2,remainingPercent:98,resetsAt:now+9200},{durationMinutes:10080,usedPercent:1,remainingPercent:99,resetsAt:now+520000}]},
{id:"zai-global-build-glm-5-3-flash",label:"Global Build · GLM-5.3-Flash",planType:"Global Build",source:"zcode-plan",windows:[{durationMinutes:822,usedPercent:87,remainingPercent:13,resetsAt:now+9200,lastResetAt:now-49300,usedCredits:87000000,totalCredits:100000000}]},
{id:"zai-start-plan-glm-5-3",label:"Start Plan · GLM-5.3",planType:"Start Plan",source:"zcode-plan",windows:[{durationMinutes:1440,usedPercent:0,remainingPercent:100,resetsAt:now+50000,lastResetAt:now-9200}]},
{id:"zai-start-plan-glm-5-3-flash",label:"Start Plan · GLM-5.3-Flash",planType:"Start Plan",source:"zcode-plan",windows:[{durationMinutes:1440,usedPercent:0,remainingPercent:100,resetsAt:now+50000,lastResetAt:now-9200}]}],
credits:{availableResetCount:0,nextResetExpiresAt:null,resetCredits:null,balance:"137272.0",hasCredits:true,unlimited:false,plan:"max",showLimitResets:false}};
demo.history={trackedSince:now-86400,activityBucketMinutes:60,activityEndAt:now,creditPeriods:{"1h":{consumed:120,complete:true},"4h":{consumed:880,complete:true},"24h":{consumed:2728,complete:true},"today":{consumed:2100,complete:true}},creditActivity24h:buckets(24),windows:[
{id:"zai",label:"Z.ai Coding Plan",durationMinutes:300,source:"coding-plan",trackedSince:now-86400,periods:{"1h":{consumedPercent:0.5,complete:true},"4h":{consumedPercent:1,complete:true},"12h":{consumedPercent:2,complete:true},"today":{consumedPercent:2,complete:true}},activity24h:buckets(24)},
{id:"zai",label:"Z.ai Coding Plan",durationMinutes:10080,source:"coding-plan",trackedSince:now-86400,periods:{"1h":{consumedPercent:0.2,complete:true},"4h":{consumedPercent:0.8,complete:true},"12h":{consumedPercent:1.5,complete:true},"today":{consumedPercent:1.2,complete:true}},activity24h:buckets(24)},
{id:"zai-global-build-glm-5-3-flash",label:"Global Build · GLM-5.3-Flash",durationMinutes:822,source:"zcode-plan",trackedSince:now-86400,periods:{"1h":{consumedPercent:5,complete:true},"4h":{consumedPercent:11,complete:true},"12h":{consumedPercent:20,complete:true},"today":{consumedPercent:18,complete:true}},activity24h:buckets(24)},
{id:"zai-start-plan-glm-5-3",label:"Start Plan · GLM-5.3",durationMinutes:1440,source:"zcode-plan",trackedSince:now-86400,periods:{"1h":{consumedPercent:100,complete:true},"4h":{consumedPercent:100,complete:true},"12h":{consumedPercent:100,complete:true},"today":{consumedPercent:100,complete:true}},activity24h:buckets(24)},
{id:"zai-start-plan-glm-5-3-flash",label:"Start Plan · GLM-5.3-Flash",durationMinutes:1440,source:"zcode-plan",trackedSince:now-86400,periods:{"1h":{consumedPercent:100,complete:true},"4h":{consumedPercent:100,complete:true},"12h":{consumedPercent:100,complete:true},"today":{consumedPercent:100,complete:true}},activity24h:buckets(24)}]};
applet._snapshot=demo;applet._rebuildPanel();applet._rebuildMenu();applet.menu.open(false);
return "STAGED";})())'
for _ in {1..30}; do
    staged=$(eval_cinnamon "$stage" 2>&1 || true)
    [[ "$staged" == *'STAGED'* ]] && break
    sleep 0.4
done
echo "staged=$staged"

sleep 1
diag=$(eval_cinnamon 'JSON.stringify((function(){var a=Main.AppletManager.getRunningInstancesForUuid("z-usage@oss-singularity")[0];var m=a.menu;var mon=Main.layoutManager.findMonitorForActor(a.actor);var [,ph]=m.actor.get_preferred_height(-1);var pos=m.actor.get_transformed_position();var size=m.actor.get_transformed_size();return {monitorH:mon.height,prefH:ph,scrollH:m._scroll.get_height(),popupY:pos[1],popupH:size[1],openSections:a._limitSections.filter(function(s){return s.expanded}).length};})())' 2>&1 || true)
echo "diag=$diag"
gdbus call --session --dest org.Cinnamon --object-path /org/Cinnamon --method org.Cinnamon.Eval 'var a=Main.AppletManager.getRunningInstancesForUuid("z-usage@oss-singularity")[0];a.menu._scroll.get_vscroll_bar().get_adjustment().set_value(9999);""' >/dev/null 2>&1 || true
sleep 20
echo "driver done, holding for capture"
sleep 40
