#!/usr/bin/env bash
# ============================================================
# build-apk.sh — Build inoob Android APK
# ============================================================
# Prerequisites:
#   - Node.js + pnpm installed
#   - Android Studio OR Android SDK command-line tools installed
#   - ANDROID_HOME set (e.g. ~/Android/Sdk)
#   - Java 17+ installed
#
# Usage:
#   API_URL=https://your-api-server.com bash build-apk.sh
#
# The APK will be at:
#   artifacts/suno-generator/android/app/build/outputs/apk/debug/app-debug.apk
# ============================================================

set -e

if [ -z "$API_URL" ]; then
  echo "ERROR: Set API_URL to your deployed API server URL."
  echo "  Example: API_URL=https://your-server.com bash build-apk.sh"
  exit 1
fi

echo ">> Installing dependencies..."
pnpm install

echo ">> Building frontend with API_URL=$API_URL..."
cd artifacts/suno-generator
VITE_API_BASE_URL="$API_URL" npx vite build --config vite.config.ts

echo ">> Initialising Capacitor Android platform (first run only)..."
if [ ! -d "android" ]; then
  npx cap add android
fi

echo ">> Syncing web assets into Android project..."
npx cap sync android

echo ">> Building debug APK via Gradle..."
cd android
./gradlew assembleDebug

APK_PATH="app/build/outputs/apk/debug/app-debug.apk"
echo ""
echo "============================================================"
echo "  APK ready: artifacts/suno-generator/android/$APK_PATH"
echo "  Install on device: adb install $APK_PATH"
echo "============================================================"
