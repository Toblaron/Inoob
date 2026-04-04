# ============================================================
# build-apk.ps1 — Build inoob Android APK (Windows)
# ============================================================
# Prerequisites:
#   - Node.js + pnpm installed
#   - Android Studio installed (includes SDK + Gradle)
#   - ANDROID_HOME set (e.g. $env:LOCALAPPDATA\Android\Sdk)
#   - Java 17+ installed and on PATH
#
# Usage (PowerShell):
#   $env:API_URL="https://your-api-server.com"; .\build-apk.ps1
#
# APK output:
#   artifacts\suno-generator\android\app\build\outputs\apk\debug\app-debug.apk
# ============================================================

$ErrorActionPreference = "Stop"

if (-not $env:API_URL) {
    Write-Error "Set `$env:API_URL to your deployed API server URL first.`n  Example: `$env:API_URL='https://your-server.com'; .\build-apk.ps1"
    exit 1
}

Write-Host ">> Installing dependencies..." -ForegroundColor Cyan
pnpm install

Write-Host ">> Building frontend with API_URL=$env:API_URL..." -ForegroundColor Cyan
Push-Location artifacts\suno-generator
$env:VITE_API_BASE_URL = $env:API_URL
npx vite build --config vite.config.ts

Write-Host ">> Initialising Capacitor Android platform (first run only)..." -ForegroundColor Cyan
if (-not (Test-Path "android")) {
    npx cap add android
}

Write-Host ">> Syncing web assets into Android project..." -ForegroundColor Cyan
npx cap sync android

Write-Host ">> Building debug APK via Gradle..." -ForegroundColor Cyan
Push-Location android
.\gradlew.bat assembleDebug
Pop-Location

Pop-Location

$apk = "artifacts\suno-generator\android\app\build\outputs\apk\debug\app-debug.apk"
Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  APK ready: $apk" -ForegroundColor Green
Write-Host "  Install:   adb install $apk" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
