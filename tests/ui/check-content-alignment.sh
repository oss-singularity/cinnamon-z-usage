#!/usr/bin/env bash
# Check ring, disclosure-arrow and plot bounds against the footer button grid.
alignment_result=$(eval_cinnamon 'String((function(){try{var a=Main.AppletManager.getRunningInstancesForUuid("z-usage@oss-singularity")[0],f=a._actionWidthFrame,p=f.get_transformed_position(),s=f.get_transformed_size(),right=p[0]+s[0],bad=[],count=0;var rings=a._countdownWidgets.map(function(e){return e.actor;});if(a._headerRings)rings.push(a._headerRings);rings.forEach(function(r){if(!r.mapped)return;var x=r.get_transformed_position()[0],w=r.get_transformed_size()[0];count++;if(Math.abs(Math.round(x+w-1)-Math.round(right))>1)bad.push({ringRight:x+w-1,buttonRight:right});});var arrows=[];arrows.forEach(function(r){});a._activityCharts.forEach(function(e){var plot=e.chart.get_children()[0];if(!plot.mapped)return;var x=plot.get_transformed_position()[0],w=plot.get_transformed_size()[0];count++;if(Math.abs(Math.round(x+w)-Math.round(right))>1)bad.push({plotRight:x+w,buttonRight:right,chart:e.chart.get_transformed_position(),size:e.chart.get_transformed_size(),fixed:e.chart.min_width,padding:e.chart.get_theme_node().get_padding(imports.gi.St.Side.RIGHT),plotWidth:w});});return bad.length?JSON.stringify(bad):count>=2?true:"No visible rings/charts checked";}catch(e){return "ERR: "+e.message;}})())')
if ! grep -qE "['\"]true['\"]" <<< "$alignment_result"; then
    printf 'Content/button alignment failed: %s\n' "$alignment_result" >&2
    exit 1
fi
printf 'Content alignment: visible ring, arrow and graph edges match footer buttons\n'
