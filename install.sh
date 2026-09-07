#!/usr/bin/env bash
# OxHorse — 安装最新发布版 OmniGraffle 插件
#
#   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/luomgf/OmniGraffle-OxHorse/main/install.sh)"
#
# 可选环境变量：
#   OXH_VERSION=v0.1.1   安装指定版本
#   OXH_REPO=owner/name  覆盖仓库
#   OXH_LAUNCH=1         安装后打开浮动面板
set -euo pipefail

REPO="${OXH_REPO:-luomgf/OmniGraffle-OxHorse}"
ASSET_NAME="OxHorse.omnigrafflejs.zip"
PLUGIN_DIR_NAME="split-text-to-rectangles.omnigrafflejs"
GITHUB="https://github.com/${REPO}"
DEST_DIRS=(
  "${HOME}/Library/Application Support/Plug-Ins/${PLUGIN_DIR_NAME}"
  "${HOME}/Library/Application Support/The Omni Group/OmniGraffle/Plug-Ins/${PLUGIN_DIR_NAME}"
)

red() { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
info() { printf '%s\n' "$*"; }

die() {
  red "安装失败：$1" >&2
  exit 1
}

need() {
  command -v "$1" >/dev/null 2>&1 || die "找不到命令：$1"
}

if [ "$(uname -s)" != "Darwin" ]; then
  die "OxHorse 只能安装在 macOS 上。"
fi

need curl
need unzip
need ditto

WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/oxhorse-install.XXXXXX")"
cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

ZIP="$WORKDIR/plugin.zip"
EXTRACT="$WORKDIR/extract"
mkdir -p "$EXTRACT"

effective_url=""

curl_get() {
  local url="$1"
  local out="$2"
  local quiet="${3:-0}"
  local args=(-fL --retry 3 --retry-delay 1 -A "OxHorse-installer" -o "$out" -w "%{url_effective}")
  if [ "$quiet" = 1 ]; then
    args+=(-sS --retry 0)
    effective_url="$(curl "${args[@]}" "$url" 2>/dev/null)" || return 1
  else
    info "正在下载 ${url}"
    effective_url="$(curl "${args[@]}" "$url")" || return 1
  fi
  return 0
}

tag_from_url() {
  local url="$1"
  local extracted
  extracted="$(printf '%s\n' "$url" | sed -n 's|.*/releases/download/\([^/]*\)/.*|\1|p')"
  if [ -n "$extracted" ]; then
    printf '%s\n' "$extracted"
  fi
}

latest_tag() {
  need git
  git ls-remote --tags --refs "$GITHUB.git" \
    | awk -F/ '{print $NF}' \
    | grep -E '^v?[0-9]' \
    | sort -V \
    | tail -1
}

download_release_asset() {
  local tag="${1:-}"
  local quiet="${2:-1}"
  local url
  if [ -n "$tag" ]; then
    url="${GITHUB}/releases/download/${tag}/${ASSET_NAME}"
  else
    url="${GITHUB}/releases/latest/download/${ASSET_NAME}"
  fi
  curl_get "$url" "$ZIP" "$quiet"
}

download_tag_source() {
  local tag="$1"
  local url="${GITHUB}/archive/refs/tags/${tag}.zip"
  curl_get "$url" "$ZIP" 0
}

TAG="${OXH_VERSION:-}"
DOWNLOADED=0

if [ -n "${OXH_ZIP:-}" ]; then
  [ -f "$OXH_ZIP" ] || die "找不到本地包：${OXH_ZIP}"
  info "使用本地包 ${OXH_ZIP}"
  cp "$OXH_ZIP" "$ZIP"
  TAG="${TAG:-local}"
  DOWNLOADED=1
elif [ -n "$TAG" ]; then
  if download_release_asset "$TAG" 0; then
    DOWNLOADED=1
  elif download_tag_source "$TAG"; then
    DOWNLOADED=1
  else
    die "找不到版本 ${TAG}。"
  fi
else
  if download_release_asset "" 1; then
    DOWNLOADED=1
    TAG="$(tag_from_url "$effective_url")"
    TAG="${TAG:-latest}"
  else
    info "尚未发布插件包，改用最新 git 标签。"
    TAG="$(latest_tag || true)"
    [ -n "${TAG:-}" ] || die "仓库里没有任何版本标签。"
    if download_release_asset "$TAG" 1; then
      DOWNLOADED=1
    elif download_tag_source "$TAG"; then
      DOWNLOADED=1
    else
      die "无法下载版本 ${TAG}。"
    fi
  fi
fi

[ "$DOWNLOADED" = 1 ] || die "下载失败。"
unzip -q "$ZIP" -d "$EXTRACT"

PLUGIN="$(find "$EXTRACT" -type d -name '*.omnigrafflejs' -print 2>/dev/null | head -n 1 || true)"
if [ -z "$PLUGIN" ] || [ ! -f "$PLUGIN/manifest.json" ]; then
  die "压缩包里没有找到 OmniGraffle 插件（*.omnigrafflejs）。"
fi

VERSION="$(/usr/bin/python3 -c 'import json,sys; print(json.load(sys.stdin).get("version",""))' < "$PLUGIN/manifest.json" 2>/dev/null || true)"
LABEL="${TAG}"
if [ -n "${VERSION:-}" ]; then
  LABEL="${TAG}（插件 ${VERSION}）"
fi

info "正在安装 ${LABEL}"

for dest in "${DEST_DIRS[@]}"; do
  mkdir -p "$(dirname "$dest")"
  rm -rf "$dest"
  ditto "$PLUGIN" "$dest"
  xattr -dr com.apple.quarantine "$dest" 2>/dev/null || true
  info "  → ${dest}"
done

APP="$HOME/Library/Application Support/Plug-Ins/${PLUGIN_DIR_NAME}/Resources/OpenFloatingPalette.app"
if [ -d "$APP" ]; then
  codesign --force --deep --sign - "$APP" >/dev/null 2>&1 || true
  xattr -dr com.apple.quarantine "$APP" 2>/dev/null || true
fi

green "OxHorse 已安装：${LABEL}"
info "请打开 OmniGraffle，选择「自动化 → 重新加载插件」。"
info "然后运行「自动化 → 打开 OxHorse 面板」，或："
info "  open $(printf '%q' "$APP")"

if [ "${OXH_LAUNCH:-0}" = "1" ] && [ -d "$APP" ]; then
  open "$APP"
fi
