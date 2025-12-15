#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$ROOT_DIR/android"
GRADLEW="$ANDROID_DIR/gradlew"

if ! command -v adb >/dev/null 2>&1; then
  echo "adb not found. Install Android platform tools and ensure adb is on your PATH." >&2
  exit 1
fi

cd "$ANDROID_DIR"

if [[ ! -x "$GRADLEW" ]]; then
  chmod +x "$GRADLEW"
fi

./gradlew assembleRelease

APK_PATH=$(find "$ANDROID_DIR/app/build/outputs/apk/release" -name "*-release.apk" -print -quit)

if [[ -z "$APK_PATH" ]]; then
  echo "Release APK not found in app/build/outputs/apk/release" >&2
  exit 1
fi

echo "Generated APK: $APK_PATH"

device_count=$(adb devices | tail -n +2 | awk 'NF {count++} END {print count+0}')
if [[ "$device_count" -eq 0 ]]; then
  echo "No connected Android devices or emulators detected." >&2
  exit 1
fi

adb install -r "$APK_PATH"

echo "Deployment complete. Check your device for the updated Chainora build."
