param (
    [string]$buildName = "1.0.0",
    [string]$buildNumber = $null
)
$ErrorActionPreference = "Stop"

# Auto-increment version code logic
$buildNumberFile = "d:\food\build_number.txt"
if ([string]::IsNullOrEmpty($buildNumber)) {
    $currentBuildNum = 2 # Default starting value
    $hasFile = Test-Path $buildNumberFile

    if ($hasFile) {
        $fileContent = Get-Content $buildNumberFile -Raw
        if ($fileContent -match '\d+') {
            $currentBuildNum = [int]$fileContent.Trim()
        }
    }

    if (-not $hasFile) {
        $localPropPath = "d:\food\mobile_app\android\local.properties"
        if (Test-Path $localPropPath) {
            $propLines = Get-Content $localPropPath
            foreach ($line in $propLines) {
                if ($line -like "flutter.versionCode=*") {
                    $val = $line.Split("=")[1]
                    if ($val -match '\d+') {
                        $currentBuildNum = [int]$val.Trim()
                    }
                }
            }
        }
    }
    $buildNumber = ($currentBuildNum + 1).ToString()
}

# Sync and save build number
if ($buildNumber -match '^\d+$') {
    Set-Content -Path $buildNumberFile -Value $buildNumber
}

Write-Host "========================================"
Write-Host "Selected Build Number (Version Code): $buildNumber"
Write-Host "========================================"

$sdkDir = "d:\food\sdks"
$env:JAVA_HOME = "$sdkDir\jdk"
$env:ANDROID_HOME = "$sdkDir\android"
$env:PATH = "$sdkDir\jdk\bin;$sdkDir\android\cmdline-tools\latest\bin;$sdkDir\flutter\bin;" + $env:PATH

# 1. Backup keystore and restore Git HEAD mobile_app
Write-Host "1. Restoring mobile_app from Git HEAD and protecting keystore..."
$keystorePath = "d:\food\mobile_app\android\app\upload-keystore.jks"
$tempBackupKeystore = "d:\food\upload-keystore.jks.temp"

if (Test-Path $keystorePath) {
    Copy-Item -Path $keystorePath -Destination $tempBackupKeystore -Force
}

# & git restore mobile_app

if (Test-Path $tempBackupKeystore) {
    New-Item -ItemType Directory -Force -Path "d:\food\mobile_app\android\app"
    Move-Item -Path $tempBackupKeystore -Destination $keystorePath -Force
}

# 2. Clean Flutter project
Write-Host "2. Running flutter clean..."
Set-Location "d:\food\mobile_app"
& "$sdkDir\flutter\bin\flutter.bat" clean

# 3. Android API 36 settings configuration
Write-Host "3. Updating build.gradle for compileSdk/targetSdk 36..."
$gradlePath = "d:\food\mobile_app\android\app\build.gradle"
$gradleContent = [System.IO.File]::ReadAllText($gradlePath)
$gradleContent = $gradleContent -replace 'compileSdk\s*=?\s*\d+', 'compileSdk = 36'
$gradleContent = $gradleContent -replace 'targetSdk\s*=?\s*\d+', 'targetSdk = 36'
[System.IO.File]::WriteAllText($gradlePath, $gradleContent)

# 4. Upgrade Gradle and Kotlin versions
Write-Host "4. Upgrading Gradle Wrapper and Kotlin versions..."
$wrapperPath = "d:\food\mobile_app\android\gradle\wrapper\gradle-wrapper.properties"
$wrapperContent = [System.IO.File]::ReadAllText($wrapperPath)
$wrapperContent = $wrapperContent.Replace("gradle-7.6.3-all.zip", "gradle-8.7-all.zip")
$wrapperContent = $wrapperContent.Replace("gradle-8.4-all.zip", "gradle-8.7-all.zip")
[System.IO.File]::WriteAllText($wrapperPath, $wrapperContent)

$settingsPath = "d:\food\mobile_app\android\settings.gradle"
$settingsContent = [System.IO.File]::ReadAllText($settingsPath)
$settingsContent = $settingsContent -replace 'id "com.android.application" version "[^"]+"', 'id "com.android.application" version "8.5.1"'
$settingsContent = $settingsContent -replace 'id "org.jetbrains.kotlin.android" version "[^"]+"', 'id "org.jetbrains.kotlin.android" version "2.3.0"'
[System.IO.File]::WriteAllText($settingsPath, $settingsContent)

# 5. Pub get and launcher/splash generation
Write-Host "5. Running pub get and generating icons/splash..."
Set-Location "d:\food\mobile_app"
& "$sdkDir\flutter\bin\flutter.bat" pub get
& "$sdkDir\flutter\bin\flutter.bat" pub run flutter_launcher_icons
& "$sdkDir\flutter\bin\flutter.bat" pub run flutter_native_splash:create

# 6. Build final App Bundle (AAB)
Write-Host "========================================"
Write-Host "6. Building release App Bundle (AAB) (Name: $buildName, Number: $buildNumber)..."
Write-Host "========================================"
& "$sdkDir\flutter\bin\flutter.bat" build appbundle --release --build-name=$buildName --build-number=$buildNumber --split-debug-info=build/app/outputs/symbols

Write-Host "========================================"
Write-Host "🎉 App Bundle build completed successfully!"
Write-Host "Path: d:\food\mobile_app\build\app\outputs\bundle\release\app-release.aab"
Write-Host "========================================"
