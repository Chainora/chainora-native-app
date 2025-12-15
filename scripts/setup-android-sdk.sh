#!/usr/bin/env bash

if [[ "$OSTYPE" == "darwin"* ]]; then
  SDK_PATH="/opt/homebrew/share/android-commandlinetools"
else
  SDK_PATH="$HOME/Android/Sdk"
fi

cat > android/local.properties <<EOF
sdk.dir=$SDK_PATH
EOF

echo "✅ android/local.properties created with sdk.dir=$SDK_PATH"

