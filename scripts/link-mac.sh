#!/bin/bash
set -euo pipefail

if [ -z "${1:-}" ]; then
    echo "Usage: link-mac.sh <plugin-id>"
    echo "Example: link-mac.sh com.isrudoy.mactools"
    exit 1
fi

PLUGIN_NAME="$1.sdPlugin"
PLUGIN_DIR="$HOME/Library/Application Support/HotSpot/StreamDock/plugins/$PLUGIN_NAME"
SOURCE_DIR="$(cd "$(dirname "$0")/.." && pwd)/$PLUGIN_NAME"

if [ ! -d "$SOURCE_DIR" ]; then
    echo "Error: source directory not found: $SOURCE_DIR"
    exit 1
fi

if [ -d "$PLUGIN_DIR" ] && [ ! -L "$PLUGIN_DIR" ]; then
    echo "Removing installed plugin: $PLUGIN_DIR"
    rm -rf "$PLUGIN_DIR"
fi

ln -sf "$SOURCE_DIR" "$PLUGIN_DIR"
echo "Linked: $PLUGIN_DIR -> $SOURCE_DIR"
