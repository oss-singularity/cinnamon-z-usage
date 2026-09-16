#!/usr/bin/env bash
# shellcheck disable=SC2016
set -Eeuo pipefail

usage() {
    cat >&2 <<'USAGE'
Usage: run-isolated.sh [options] -- command [args...]

Options:
  --server auto|xvfb       Headless provider (default: auto)
  --stage-applet DIR       Copy one applet directory into private HOME
  --stage-extension DIR    Copy and enable one Cinnamon extension privately
  --stage-extension-config FILE
                            Copy one extension settings JSON into private XDG config
  --output PATH             Capture one private root frame after settling
  --geometry WxHxD          Xvfb screen geometry (default: 1920x1080x24)
  --settle-ms N             Wait before capture (default: 1500)
  --background-image PATH   Local background image (default: bundled SVG)
  --background-color COLOR  Solid fallback color (default: #0b7285)
  -h, --help                Show this help
USAGE
}

die() {
    printf 'cinnamon-isolated-capture: %s\n' "$*" >&2
    exit 2
}

server_mode='auto'
stage_applet=''
stage_extensions=()
stage_extension_configs=()
output=''
geometry='1920x1080x24'
settle_ms='1500'
background_color='#0b7285'
background_image=''

while (($#)); do
    case "$1" in
        --server)
            (($# >= 2)) || die '--server needs a value'
            server_mode="$2"
            shift 2
            ;;
        --stage-applet)
            (($# >= 2)) || die '--stage-applet needs a directory'
            stage_applet="$2"
            shift 2
            ;;
        --stage-extension)
            (($# >= 2)) || die '--stage-extension needs a directory'
            stage_extensions+=("$2")
            shift 2
            ;;
        --stage-extension-config)
            (($# >= 2)) || die '--stage-extension-config needs a JSON file'
            stage_extension_configs+=("$2")
            shift 2
            ;;
        --output)
            (($# >= 2)) || die '--output needs a path'
            output="$2"
            shift 2
            ;;
        --geometry)
            (($# >= 2)) || die '--geometry needs a value'
            geometry="$2"
            shift 2
            ;;
        --settle-ms)
            (($# >= 2)) || die '--settle-ms needs a value'
            settle_ms="$2"
            shift 2
            ;;
        --background-image)
            (($# >= 2)) || die '--background-image needs a path'
            background_image="$2"
            shift 2
            ;;
        --background-color)
            (($# >= 2)) || die '--background-color needs a value'
            background_color="$2"
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        --)
            shift
            break
            ;;
        *)
            die "unknown option: $1"
            ;;
    esac
done

(( $# > 0 )) || { usage; exit 2; }
[[ "$server_mode" == auto || "$server_mode" == xvfb ]] || die "unsupported server: $server_mode"
[[ "$geometry" =~ ^[0-9]+x[0-9]+x[0-9]+$ ]] || die "invalid geometry: $geometry"
[[ "$settle_ms" =~ ^[0-9]+$ ]] || die "invalid settle delay: $settle_ms"

command -v dbus-run-session >/dev/null 2>&1 || die 'dbus-run-session is not installed'
command -v setsid >/dev/null 2>&1 || die 'setsid is not installed'

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
if [[ -z "$background_image" ]]; then
    background_image="$script_dir/../assets/cinnamon-teal-background.svg"
fi
if [[ ! -f "$background_image" ]]; then
    die "background image does not exist: $background_image"
fi
background_image="$(realpath -e -- "$background_image")"

if [[ -n "$stage_applet" ]]; then
    [[ -d "$stage_applet" ]] || die "applet directory does not exist: $stage_applet"
    stage_applet="$(realpath -e -- "$stage_applet")"
fi

for index in "${!stage_extensions[@]}"; do
    extension="${stage_extensions[$index]}"
    [[ -d "$extension" ]] || die "extension directory does not exist: $extension"
    stage_extensions[index]="$(realpath -e -- "$extension")"
done

for index in "${!stage_extension_configs[@]}"; do
    config="${stage_extension_configs[$index]}"
    [[ -f "$config" ]] || die "extension config does not exist: $config"
    [[ "$config" == *.json ]] || die "extension config must be a JSON file: $config"
    stage_extension_configs[index]="$(realpath -e -- "$config")"
done

if ((${#stage_extensions[@]} > 0 || ${#stage_extension_configs[@]} > 0)); then
    command -v gsettings >/dev/null 2>&1 || die 'gsettings is required when staging extensions'
fi

if [[ -n "$output" ]]; then
    [[ "$output" == /* ]] || die '--output must be an absolute path'
    output="$(realpath -m -- "$output")"
    output_dir="$(dirname -- "$output")"
    mkdir -p -- "$output_dir"
    command -v import >/dev/null 2>&1 || die 'ImageMagick import is required for --output'
fi

runtime_dir="$(mktemp -d "${TMPDIR:-/tmp}/cinnamon-isolated-capture.XXXXXX")"
private_home="$runtime_dir/home"
private_config="$runtime_dir/config"
private_data="$private_home/.local/share"
private_cache="$runtime_dir/cache"
private_runtime="$runtime_dir/runtime"
private_dconf_profile="$runtime_dir/dconf-profile"
display_file="$runtime_dir/display-number"
xserver_log="$runtime_dir/xserver.log"
x_server_pid=''
display=''

mkdir -p -- "$private_home" "$private_home/.config/autostart" "$private_config" "$private_config/autostart" "$private_config/dconf" "$private_data" "$private_cache"
mkdir -m 700 -- "$private_runtime"
cp -- "$script_dir/../assets/dconf-user-profile" "$private_dconf_profile"

staged_extension_names=''
for extension in "${stage_extensions[@]}"; do
    extension_name="$(basename -- "$extension")"
    [[ "$extension_name" =~ ^[A-Za-z0-9._@+-]+$ ]] || die "invalid extension directory name: $extension_name"
    staged_extension_destination="$private_data/cinnamon/extensions/$extension_name"
    mkdir -p -- "$(dirname -- "$staged_extension_destination")"
    cp -a -- "$extension" "$staged_extension_destination"
    if [[ -n "$staged_extension_names" ]]; then
        staged_extension_names+=','
    fi
    staged_extension_names+="$extension_name"
done

for config in "${stage_extension_configs[@]}"; do
    config_name="$(basename -- "$config")"
    extension_name="${config_name%.json}"
    [[ "$extension_name" =~ ^[A-Za-z0-9._@+-]+$ ]] || die "invalid extension config name: $config_name"
    config_destination="$private_config/cinnamon/spices/$extension_name/$config_name"
    mkdir -p -- "$(dirname -- "$config_destination")"
    cp -- "$config" "$config_destination"
done

# dbus-run-session starts its bus daemon before the command after `--`. Export
# the private user environment first so dconf-service activation cannot inherit
# the host profile or write to the real user's database.
export HOME="$private_home"
export XDG_CONFIG_HOME="$private_config"
export XDG_DATA_HOME="$private_data"
export XDG_CACHE_HOME="$private_cache"
export XDG_STATE_HOME="$private_home/.local/state"
# No fake Codex home needed: the Z applet runs its demo fixture without
# account-backed requests.
export XDG_RUNTIME_DIR="$private_runtime"
export DCONF_PROFILE="$private_dconf_profile"
export GSETTINGS_BACKEND=dconf
export GIO_USE_VFS=local

cleanup() {
    local status=$?
    set +e
    if [[ -n "${x_server_pid:-}" ]] && kill -0 "$x_server_pid" 2>/dev/null; then
        kill -TERM "$x_server_pid" 2>/dev/null || true
        for _ in {1..40}; do
            kill -0 "$x_server_pid" 2>/dev/null || break
            sleep 0.05
        done
        kill -KILL "$x_server_pid" 2>/dev/null || true
    fi
    rm -rf -- "$runtime_dir"
    exit "$status"
}
trap cleanup EXIT INT TERM

start_xvfb() {
    local xvfb_bin
    xvfb_bin="$(command -v Xvfb || true)"
    [[ -n "$xvfb_bin" ]] || return 1

    : > "$display_file"
    "$xvfb_bin" \
        -displayfd 3 \
        -screen 0 "$geometry" \
        -nolisten tcp \
        -noreset \
        >"$xserver_log" 2>&1 3>"$display_file" &
    x_server_pid=$!

    for _ in {1..100}; do
        if [[ -s "$display_file" ]]; then
            break
        fi
        if ! kill -0 "$x_server_pid" 2>/dev/null; then
            return 1
        fi
        sleep 0.05
    done

    [[ -s "$display_file" ]] || return 1
    local display_number
    display_number="$(head -n 1 "$display_file" | tr -d '[:space:]')"
    [[ "$display_number" =~ ^[0-9]+$ ]] || return 1
    display=":$display_number"
    return 0
}

case "$server_mode" in
    auto|xvfb)
        if ! start_xvfb; then
            if [[ "$server_mode" == xvfb ]]; then
                die "Xvfb could not be started; see $xserver_log"
            fi
            die "no private Xvfb display provider is available (install or provision Xvfb); live DISPLAY was not used"
        fi
        ;;
esac

staged_applet=''
if [[ -n "$stage_applet" ]]; then
    applet_name="$(basename -- "$stage_applet")"
    # Cinnamon's AppletManager and GLib/XDG now share this exact private
    # HOME/.local/share tree, so the staged regular file is visible to both
    # search paths without a live symlink.
    staged_applet="$private_data/cinnamon/applets/$applet_name"
    mkdir -p -- "$(dirname -- "$staged_applet")"
    cp -a -- "$stage_applet" "$staged_applet"
fi

export CINNAMON_ISOLATED_DISPLAY="$display"
export CINNAMON_ISOLATED_HOME="$private_home"

dbus-run-session -- env \
    DISPLAY="$display" \
    HOME="$private_home" \
    XDG_CONFIG_HOME="$private_config" \
    XDG_DATA_HOME="$private_data" \
    XDG_CACHE_HOME="$private_cache" \
    XDG_RUNTIME_DIR="$private_runtime" \
    DCONF_PROFILE="$private_dconf_profile" \
    GSETTINGS_BACKEND=dconf \
    GIO_USE_VFS=local \
    CINNAMON_ISOLATED_DISPLAY="$display" \
    CINNAMON_ISOLATED_HOME="$private_home" \
    CINNAMON_ISOLATED_APPLET="$staged_applet" \
    CINNAMON_ISOLATED_STAGED_EXTENSIONS="$staged_extension_names" \
    CINNAMON_ISOLATED_BACKGROUND_IMAGE="$background_image" \
    CINNAMON_ISOLATED_BACKGROUND_COLOR="$background_color" \
    CINNAMON_ISOLATED_SETTLE_MS="$settle_ms" \
    CINNAMON_ISOLATED_OUTPUT="$output" \
    LIBGL_ALWAYS_SOFTWARE=1 \
    CLUTTER_BACKEND=x11 \
    NO_AT_BRIDGE=1 \
    bash -c '
set -Eeuo pipefail

sleep_ms() {
    local millis="$1"
    local seconds=$((millis / 1000))
    local remainder=$((millis % 1000))
    printf -v delay "%d.%03d" "$seconds" "$remainder"
    sleep "$delay"
}

set_background() {
    xsetroot -solid "$CINNAMON_ISOLATED_BACKGROUND_COLOR" >/dev/null 2>&1 || true
    if command -v gsettings >/dev/null 2>&1 && command -v python3 >/dev/null 2>&1 && [[ -f "$CINNAMON_ISOLATED_BACKGROUND_IMAGE" ]]; then
        local image_uri
        image_uri="$(python3 -c '\''import pathlib, sys, urllib.parse; print("file://" + urllib.parse.quote(str(pathlib.Path(sys.argv[1]).resolve())))'\'' "$CINNAMON_ISOLATED_BACKGROUND_IMAGE")"
        gsettings set org.gnome.desktop.background picture-uri "$image_uri" >/dev/null 2>&1 || true
        gsettings set org.gnome.desktop.background picture-uri-dark "$image_uri" >/dev/null 2>&1 || true
        gsettings set org.gnome.desktop.background picture-options zoom >/dev/null 2>&1 || true
        gsettings set org.cinnamon.desktop.background picture-uri "$image_uri" >/dev/null 2>&1 || true
        gsettings set org.cinnamon.desktop.background picture-uri-dark "$image_uri" >/dev/null 2>&1 || true
        gsettings set org.cinnamon.desktop.background picture-options zoom >/dev/null 2>&1 || true
    fi
}

enable_staged_extensions() {
    local raw="${CINNAMON_ISOLATED_STAGED_EXTENSIONS:-}"
    [[ -n "$raw" ]] || return 0

    local setting="["
    local first=1
    local extension
    local quote
    local -a extensions
    IFS=, read -r -a extensions <<< "$raw"
    printf -v quote "%b" "\\047"
    for extension in "${extensions[@]}"; do
        [[ "$extension" =~ ^[A-Za-z0-9._@+-]+$ ]] || {
            printf "cinnamon-isolated-capture: invalid staged extension name: %s\\n" "$extension" >&2
            return 1
        }
        if (( ! first )); then setting+=","; fi
        setting+="${quote}${extension}${quote}"
        first=0
    done
    setting+="]"
    gsettings set org.cinnamon enabled-extensions "$setting" >/dev/null
}

enable_staged_extensions
set_background

child_pid=""
capture_status=0
child_status=0

terminate_child() {
    if [[ -n "$child_pid" ]] && kill -0 "$child_pid" 2>/dev/null; then
        kill -TERM -- "-$child_pid" 2>/dev/null || kill -TERM "$child_pid" 2>/dev/null || true
        for _ in {1..40}; do
            kill -0 "$child_pid" 2>/dev/null || break
            sleep 0.05
        done
        kill -KILL -- "-$child_pid" 2>/dev/null || kill -KILL "$child_pid" 2>/dev/null || true
    fi
}
trap terminate_child EXIT INT TERM

setsid -- "$@" &
child_pid=$!

if [[ -n "${CINNAMON_ISOLATED_OUTPUT:-}" ]]; then
    sleep_ms "$CINNAMON_ISOLATED_SETTLE_MS"
    if ! kill -0 "$child_pid" 2>/dev/null; then
        if wait "$child_pid"; then
            child_status=0
        else
            child_status=$?
        fi
        printf "cinnamon-isolated-capture: driver exited before capture (status=%d)\n" "$child_status" >&2
        exit "$child_status"
    fi
    if import -window root "$CINNAMON_ISOLATED_OUTPUT"; then
        capture_status=0
    else
        capture_status=$?
    fi
    printf "private-display=%s output=%s\n" "$CINNAMON_ISOLATED_DISPLAY" "$CINNAMON_ISOLATED_OUTPUT"
    terminate_child
else
    printf "private-display=%s private-home=%s\n" "$CINNAMON_ISOLATED_DISPLAY" "$CINNAMON_ISOLATED_HOME"
fi

if wait "$child_pid"; then
    child_status=0
else
    child_status=$?
fi

if (( capture_status != 0 )); then
    exit "$capture_status"
fi
exit "$child_status"
' isolated-driver "$@"
