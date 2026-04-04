# ============================================================
# build-apk.ps1 — Build inoob Android APK (Windows)
# ============================================================
# Usage:
#   $env:API_URL="https://your-api-server.com"; .\build-apk.ps1
#
# APK output:
#   artifacts\suno-generator\android\app\build\outputs\apk\debug\app-debug.apk
# ============================================================

$ErrorActionPreference = "Stop"
$RootDir = $PSScriptRoot

# ── 1. Check API_URL ─────────────────────────────────────────
if (-not $env:API_URL) {
    Write-Error "Set `$env:API_URL first.`n  Example: `$env:API_URL='https://your-server.com'; .\build-apk.ps1"
    exit 1
}

# ── 2. Auto-detect JAVA_HOME ─────────────────────────────────
if (-not $env:JAVA_HOME) {
    $javaSearchPaths = @(
        "C:\Program Files\Android\Android Studio1\jbr",
        "C:\Program Files\Android\Android Studio1\jre",
        "C:\Program Files\Android\Android Studio\jbr",
        "C:\Program Files\Android\Android Studio\jre",
        "$env:LOCALAPPDATA\Programs\Eclipse Adoptium",
        "C:\Program Files\Eclipse Adoptium",
        "C:\Program Files\Java",
        "C:\Program Files\Microsoft"
    )
    foreach ($path in $javaSearchPaths) {
        if (Test-Path "$path\bin\java.exe") {
            $env:JAVA_HOME = $path
            Write-Host ">> Auto-detected JAVA_HOME: $env:JAVA_HOME" -ForegroundColor DarkGray
            break
        }
        # Check one level deep (e.g. C:\Program Files\Java\jdk-17)
        if (Test-Path $path) {
            $sub = Get-ChildItem $path -Directory | Where-Object { Test-Path "$($_.FullName)\bin\java.exe" } | Select-Object -First 1
            if ($sub) {
                $env:JAVA_HOME = $sub.FullName
                Write-Host ">> Auto-detected JAVA_HOME: $env:JAVA_HOME" -ForegroundColor DarkGray
                break
            }
        }
    }
    if (-not $env:JAVA_HOME) {
        Write-Error "Java not found. Install Android Studio (includes JDK) or set JAVA_HOME manually."
        exit 1
    }
}
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"

# ── 3. Install dependencies ───────────────────────────────────
Write-Host ">> Installing dependencies..." -ForegroundColor Cyan
Set-Location $RootDir
pnpm install --ignore-scripts  # skip the sh preinstall on Windows

# ── 4. Build frontend ─────────────────────────────────────────
Write-Host ">> Building frontend (API_URL=$env:API_URL)..." -ForegroundColor Cyan
Set-Location "$RootDir\artifacts\suno-generator"
$env:VITE_API_BASE_URL = $env:API_URL
npx vite build --config vite.config.ts

# ── 5. Capacitor: add Android platform (first run only) ───────
Write-Host ">> Setting up Capacitor Android..." -ForegroundColor Cyan
if (-not (Test-Path "android")) {
    npx cap add android
}

# ── 5b. Write local.properties if missing ────────────────────
$localProps = "$RootDir\artifacts\suno-generator\android\local.properties"
if (-not (Test-Path $localProps)) {
    $sdkDir = "$env:LOCALAPPDATA\Android\Sdk"
    if ($env:ANDROID_HOME) { $sdkDir = $env:ANDROID_HOME }
    elseif ($env:ANDROID_SDK_ROOT) { $sdkDir = $env:ANDROID_SDK_ROOT }
    $escapedSdk = $sdkDir.Replace("\", "\\")
    "sdk.dir=$escapedSdk" | Out-File $localProps -Encoding ascii
    Write-Host ">> Wrote local.properties: sdk.dir=$sdkDir" -ForegroundColor DarkGray
}

# ── 6. Sync web assets ────────────────────────────────────────
Write-Host ">> Syncing web assets..." -ForegroundColor Cyan
npx cap sync android

# ── 7. Build APK ─────────────────────────────────────────────
Write-Host ">> Building debug APK..." -ForegroundColor Cyan
Set-Location "$RootDir\artifacts\suno-generator\android"
.\gradlew.bat assembleDebug

Set-Location $RootDir

$apk = "artifacts\suno-generator\android\app\build\outputs\apk\debug\app-debug.apk"
if (Test-Path $apk) {
    $size = [math]::Round((Get-Item $apk).Length / 1MB, 1)
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Green
    Write-Host "  APK ready ($size MB): $apk" -ForegroundColor Green
    Write-Host "  Install:   adb install $apk" -ForegroundColor Green
    Write-Host "  Or copy the .apk to your phone and open it directly." -ForegroundColor Green
    Write-Host "============================================================" -ForegroundColor Green
} else {
    Write-Error "APK not found — check Gradle output above for errors."
}
