#!/bin/bash
# Quick launcher for the Flutter macOS desktop app (dev)
# Double-clickable on macOS after chmod +x
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
APP_ROOT="${HERE}/../mobile/flutter_app"
API_BASE_URL_DEFAULT="http://localhost:5000"

if ! command -v flutter >/dev/null 2>&1; then
  echo "[!] Flutter not found in PATH. Open Terminal and run: brew install --cask flutter or ensure flutter is in PATH." >&2
  exit 1
fi

cd "$APP_ROOT"

# Ensure macOS desktop is enabled and project files exist
flutter config --enable-macos-desktop >/dev/null 2>&1 || true
if [ ! -d "macos" ]; then
  flutter create . --platforms=macos
fi

flutter pub get

# Use API_BASE_URL from environment if provided; fallback to localhost
API_URL="${API_BASE_URL:-$API_BASE_URL_DEFAULT}"
echo "Launching with API_BASE_URL=$API_URL"

# Run the macOS desktop app
exec flutter run -d macos --dart-define=API_BASE_URL="$API_URL"

