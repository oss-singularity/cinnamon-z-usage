#!/usr/bin/env bash
set -Eeuo pipefail

raw_image=${1:?raw image path is required}
geometry_file=${2:?geometry file path is required}
output_image=${3:?output image path is required}
panel_geometry_file=${4:-}
panel_mode=${5:-vertical}

for command in identify convert; do
    command -v "$command" >/dev/null 2>&1 || {
        printf 'crop-readme-geometry: missing command: %s\n' "$command" >&2
        exit 2
    }
done

[[ "$raw_image" == /* && "$geometry_file" == /* && "$output_image" == /* ]] || {
    printf 'crop-readme-geometry: all paths must be absolute\n' >&2
    exit 2
}
if [[ -n "$panel_geometry_file" && "$panel_geometry_file" != /* ]]; then
    printf 'crop-readme-geometry: panel geometry path must be absolute\n' >&2
    exit 2
fi
[[ "$panel_mode" == vertical || "$panel_mode" == horizontal ]] || {
    printf 'crop-readme-geometry: unsupported panel mode: %s\n' "$panel_mode" >&2
    exit 2
}
[[ -f "$raw_image" ]] || {
    printf 'crop-readme-geometry: raw image does not exist: %s\n' "$raw_image" >&2
    exit 2
}
[[ -f "$geometry_file" ]] || {
    printf 'crop-readme-geometry: geometry file does not exist: %s\n' "$geometry_file" >&2
    exit 2
}

IFS=, read -r menu_x menu_y menu_w menu_h < "$geometry_file"
if [[ ! "$menu_x" =~ ^[0-9]+$ || ! "$menu_y" =~ ^[0-9]+$ ||
    ! "$menu_w" =~ ^[1-9][0-9]*$ || ! "$menu_h" =~ ^[1-9][0-9]*$ ]]; then
    printf 'crop-readme-geometry: invalid menu geometry in %s\n' "$geometry_file" >&2
    exit 2
fi

screen_w=$(identify -format '%w' "$raw_image")
screen_h=$(identify -format '%h' "$raw_image")
if [[ ! "$screen_w" =~ ^[1-9][0-9]*$ || ! "$screen_h" =~ ^[1-9][0-9]*$ ]]; then
    printf 'crop-readme-geometry: could not read raw image dimensions\n' >&2
    exit 2
fi
if (( menu_x + menu_w > screen_w || menu_y + menu_h > screen_h )); then
    printf 'crop-readme-geometry: menu exceeds raw image bounds (%s,%s,%s,%s in %sx%s)\n' \
        "$menu_x" "$menu_y" "$menu_w" "$menu_h" "$screen_w" "$screen_h" >&2
    exit 2
fi

crop_x=$((menu_x - 8))
(( crop_x < 0 )) && crop_x=0
crop_y=$((menu_y - 8))
(( crop_y < 0 )) && crop_y=0
if [[ "$panel_mode" == horizontal && -n "$panel_geometry_file" ]]; then
    [[ -f "$panel_geometry_file" ]] || {
        printf 'crop-readme-geometry: panel geometry file does not exist: %s\n' "$panel_geometry_file" >&2
        exit 2
    }
    IFS=, read -r panel_x panel_y panel_w panel_h _ < "$panel_geometry_file"
    for value in "$panel_x" "$panel_y" "$panel_w" "$panel_h"; do
        [[ "$value" =~ ^[0-9]+$ ]] || {
            printf 'crop-readme-geometry: invalid panel geometry in %s\n' "$panel_geometry_file" >&2
            exit 2
        }
    done
    (( panel_y < crop_y )) && crop_y=$panel_y
fi
crop_right=$screen_w
crop_bottom=$((menu_y + menu_h + 8))
# Include the complete applet anchor, not just a strip of the panel. Modal
# dialogs and settings windows may end above the bottom-aligned applet.
if [[ -n "$panel_geometry_file" ]]; then
    IFS=, read -r panel_x panel_y panel_w panel_h applet_x applet_y applet_w applet_h < "$panel_geometry_file"
    for value in "$applet_x" "$applet_y" "$applet_w" "$applet_h"; do
        [[ "$value" =~ ^[0-9]+$ ]] || { printf 'Missing applet anchor geometry\n' >&2; exit 2; }
    done
    (( applet_w > 0 && applet_h > 0 )) || { printf 'Empty applet anchor\n' >&2; exit 2; }
    (( applet_x < crop_x )) && crop_x=$applet_x
    (( applet_y < crop_y )) && crop_y=$applet_y
    anchor_bottom=$((applet_y + applet_h))
    (( anchor_bottom > crop_bottom )) && crop_bottom=$anchor_bottom
fi
(( crop_bottom > screen_h )) && crop_bottom=$screen_h
crop_w=$((crop_right - crop_x))
crop_h=$((crop_bottom - crop_y))

mkdir -p -- "$(dirname -- "$output_image")"
convert "$raw_image" \
    -crop "${crop_w}x${crop_h}+${crop_x}+${crop_y}" \
    +repage \
    "$output_image"
output_dimensions=$(identify -format '%wx%h' "$output_image")
printf '[%s,%s,%s,%s]\n' "$crop_x" "$crop_y" "$crop_w" "$crop_h" > "${output_image%.png}.crop.json"
printf 'cropped %s %s from %s,%s,%s,%s with 8px inset\n' \
    "$output_image" "$output_dimensions" "$menu_x" "$menu_y" "$menu_w" "$menu_h"
