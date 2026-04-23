#!/usr/bin/env bash

if [[ -n "$ANDROID_SDK_ROOT" ]]; then
  SDK_PATH="$ANDROID_SDK_ROOT"
elif [[ -n "$ANDROID_HOME" ]]; then
  SDK_PATH="$ANDROID_HOME"
elif [[ -n "$LOCALAPPDATA" && -d "$LOCALAPPDATA/Android/Sdk" ]]; then
  SDK_PATH="$LOCALAPPDATA/Android/Sdk"
elif [[ "$OSTYPE" == "darwin"* ]]; then
  SDK_PATH="$HOME/Library/Android/sdk"
else
  SDK_PATH="$HOME/Android/Sdk"
fi

cat > android/local.properties <<EOF
sdk.dir=$SDK_PATH
EOF

echo "✅ android/local.properties created with sdk.dir=$SDK_PATH"

