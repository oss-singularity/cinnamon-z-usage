#!/usr/bin/env bash
set -Eeuo pipefail

raw_image=${1:?raw image path is required}
geometry_file=${2:?panel geometry path is required}
output_image=${3:?output image path is required}
panel_mode=${4:-vertical}
crop_context=${5:-native}

for command in identify convert; do
    command -v "$command" >/dev/null 2>&1 || {
        printf 'crop-panel-geometry: missing command: %s\n' "$command" >&2
        exit 2
    }
done

[[ "$raw_image" == /* && "$geometry_file" == /* && "$output_image" == /* ]] || {
    printf 'crop-panel-geometry: all paths must be absolute\n' >&2
    exit 2
}
[[ -f "$raw_image" && -f "$geometry_file" ]] || {
    printf 'crop-panel-geometry: raw image or geometry file is missing\n' >&2
    exit 2
}
[[ "$panel_mode" == vertical || "$panel_mode" == horizontal ]] || {
    printf 'crop-panel-geometry: unsupported panel mode: %s\n' "$panel_mode" >&2
    exit 2
}
[[ "$crop_context" == native || "$crop_context" == context ]] || {
    printf 'crop-panel-geometry: unsupported crop context: %s\n' "$crop_context" >&2
    exit 2
}

IFS=, read -r panel_x panel_y panel_w panel_h applet_x applet_y applet_w applet_h < "$geometry_file"
for value in "$panel_x" "$panel_y" "$panel_w" "$panel_h" \
             "$applet_x" "$applet_y" "$applet_w" "$applet_h"; do
    [[ "$value" =~ ^[0-9]+$ ]] || {
        printf 'crop-panel-geometry: invalid panel geometry in %s\n' "$geometry_file" >&2
        exit 2
    }
done
(( panel_w > 0 && panel_h > 0 && applet_w > 0 && applet_h > 0 )) || {
    printf 'crop-panel-geometry: panel and applet sizes must be positive\n' >&2
    exit 2
}

screen_w=$(identify -format '%w' "$raw_image")
screen_h=$(identify -format '%h' "$raw_image")
if [[ ! "$screen_w" =~ ^[1-9][0-9]*$ || ! "$screen_h" =~ ^[1-9][0-9]*$ ]]; then
    printf 'crop-panel-geometry: could not read raw image dimensions\n' >&2
    exit 2
fi
if (( panel_x + panel_w > screen_w || panel_y + panel_h > screen_h ||
      applet_x < panel_x || applet_y < panel_y ||
      applet_x + applet_w > panel_x + panel_w ||
      applet_y + applet_h > panel_y + panel_h )); then
    printf 'crop-panel-geometry: panel/applet geometry exceeds raw image or panel bounds\n' >&2
    exit 2
fi

if [[ "$crop_context" == context ]]; then
    if [[ "$panel_mode" == horizontal ]]; then
        crop_w=94
        crop_h=$panel_h
        crop_x=$((panel_x + panel_w - crop_w))
        crop_y=$panel_y
    else
        crop_w=$panel_w
        crop_h=96
        crop_x=$panel_x
        crop_y=$((panel_y + panel_h - crop_h))
    fi
    crop_right=$((crop_x + crop_w))
    crop_bottom=$((crop_y + crop_h))
    (( crop_w <= panel_w && crop_h <= panel_h )) || {
        printf 'crop-panel-geometry: context crop exceeds panel dimensions\n' >&2
        exit 2
    }
elif [[ "$panel_mode" == horizontal ]]; then
    crop_x=$applet_x
    crop_y=$panel_y
    crop_right=$((panel_x + panel_w))
    crop_bottom=$((panel_y + panel_h))
else
    crop_x=$((applet_x - 8))
    (( crop_x < panel_x )) && crop_x=$panel_x
    crop_y=$((applet_y - 8))
    (( crop_y < panel_y )) && crop_y=$panel_y
    crop_right=$((panel_x + panel_w))
    crop_bottom=$((applet_y + applet_h + 8))
    (( crop_bottom > panel_y + panel_h )) && crop_bottom=$((panel_y + panel_h))
fi

crop_w=$((crop_right - crop_x))
crop_h=$((crop_bottom - crop_y))
(( crop_w > 0 && crop_h > 0 )) || {
    printf 'crop-panel-geometry: computed crop is empty\n' >&2
    exit 2
}

mkdir -p -- "$(dirname -- "$output_image")"
convert "$raw_image" \
    -crop "${crop_w}x${crop_h}+${crop_x}+${crop_y}" \
    +repage \
    "$output_image"
output_dimensions=$(identify -format '%wx%h' "$output_image")
printf '[%s,%s,%s,%s]\n' "$crop_x" "$crop_y" "$crop_w" "$crop_h" > "${output_image%.png}.crop.json"
printf 'cropped %s %s from panel %s,%s,%s,%s and applet %s,%s,%s,%s\n' \
    "$output_image" "$output_dimensions" "$panel_x" "$panel_y" "$panel_w" "$panel_h" \
    "$applet_x" "$applet_y" "$applet_w" "$applet_h"
