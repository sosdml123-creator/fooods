$ProgressPreference = "SilentlyContinue"

$sdkDir = "d:\food\sdks"
$newFlutterDir = "$sdkDir\flutter_324"

Write-Host "========================================"
Write-Host "Flutter 3.24.5 빌드 시작"
Write-Host "========================================"

# 1. 새 Flutter SDK 다운로드 (없을 때만)
if (-not (Test-Path "$newFlutterDir\bin\flutter.bat")) {
    Write-Host "Flutter 3.24.5 다운로드 중... (~600MB)"
    $flutterUrl = "https://storage.googleapis.com/flutter_infra_release/releases/stable/windows/flutter_windows_3.24.5-stable.zip"
    $flutterZip = "$sdkDir\flutter_324.zip"
    Invoke-WebRequest -Uri $flutterUrl -OutFile $flutterZip -UseBasicParsing
    Write-Host "압축 해제 중..."
    New-Item -ItemType Directory -Force -Path $newFlutterDir | Out-Null
    Expand-Archive -Path $flutterZip -DestinationPath "$sdkDir\flutter-temp324"
    Move-Item -Path "$sdkDir\flutter-temp324\flutter\*" -Destination $newFlutterDir
    Remove-Item -Recurse -Force "$sdkDir\flutter-temp324"
    Remove-Item -Force $flutterZip
    Write-Host "Flutter 3.24.5 설치 완료!"
} else {
    Write-Host "Flutter 3.24.5 이미 설치됨."
}

# 2. 환경변수 설정
$env:JAVA_HOME = "$sdkDir\jdk"
$env:ANDROID_HOME = "$sdkDir\android"
$env:PATH = "$sdkDir\jdk\bin;$sdkDir\android\cmdline-tools\latest\bin;$newFlutterDir\bin;" + $env:PATH

Write-Host "Flutter 버전:"
& "$newFlutterDir\bin\flutter.bat" --version

# 3. Flutter 설정 (오류 무시)
$ErrorActionPreference = "Continue"
& "$newFlutterDir\bin\flutter.bat" config --suppress-analytics
& "$newFlutterDir\bin\flutter.bat" config --android-sdk "$sdkDir\android"
& "$newFlutterDir\bin\flutter.bat" config --jdk-dir "$sdkDir\jdk"

Write-Host "라이선스 동의..."
"y`ny`ny`ny`ny`ny`ny`n" | & "$newFlutterDir\bin\flutter.bat" doctor --android-licenses 2>&1 | Out-Null
Write-Host "라이선스 동의 완료"

$ErrorActionPreference = "Stop"

# 4. 빌드번호
$buildName = "1.0.0"
$buildNumberFile = "d:\food\build_number.txt"
$currentBuildNum = 65
if (Test-Path $buildNumberFile) {
    $fc = (Get-Content $buildNumberFile -Raw).Trim()
    if ($fc -match '^\d+$') { $currentBuildNum = [int]$fc }
}
$buildNumber = ($currentBuildNum + 1).ToString()
Set-Content -Path $buildNumberFile -Value $buildNumber
Write-Host "Build Number: $buildNumber"

# 5. build.gradle
$gradlePath = "d:\food\mobile_app\android\app\build.gradle"
$gc = [System.IO.File]::ReadAllText($gradlePath)
$gc = $gc -replace 'compileSdk\s*=?\s*\d+', 'compileSdk = 36'
$gc = $gc -replace 'targetSdk\s*=?\s*\d+', 'targetSdk = 36'
[System.IO.File]::WriteAllText($gradlePath, $gc)

# 6. Gradle Wrapper
$wrapperPath = "d:\food\mobile_app\android\gradle\wrapper\gradle-wrapper.properties"
$wc = [System.IO.File]::ReadAllText($wrapperPath)
$wc = $wc -replace 'gradle-[\d\.]+-all\.zip', 'gradle-8.7-all.zip'
[System.IO.File]::WriteAllText($wrapperPath, $wc)

# 7. settings.gradle - Kotlin 2.0.21 (flutter_inappwebview 6.1.x 호환)
$settingsPath = "d:\food\mobile_app\android\settings.gradle"
$sc = [System.IO.File]::ReadAllText($settingsPath)
$sc = $sc -replace 'id "com.android.application" version "[^"]+"', 'id "com.android.application" version "8.5.1"'
$sc = $sc -replace 'id "org.jetbrains.kotlin.android" version "[^"]+"', 'id "org.jetbrains.kotlin.android" version "2.0.21"'
[System.IO.File]::WriteAllText($settingsPath, $sc)

# 8. 빌드
Set-Location "d:\food\mobile_app"

Write-Host "flutter clean..."
& "$newFlutterDir\bin\flutter.bat" clean

Write-Host "flutter pub get..."
& "$newFlutterDir\bin\flutter.bat" pub get

Write-Host "런처아이콘 생성..."
& "$newFlutterDir\bin\flutter.bat" pub run flutter_launcher_icons

Write-Host "스플래시 생성..."
& "$newFlutterDir\bin\flutter.bat" pub run flutter_native_splash:create

Write-Host "========================================"
Write-Host "APK 빌드 중..."
Write-Host "========================================"
& "$newFlutterDir\bin\flutter.bat" build apk --release --build-name=$buildName --build-number=$buildNumber --split-debug-info=build/app/outputs/symbols

Write-Host "========================================"
Write-Host "AAB 빌드 중..."
Write-Host "========================================"
& "$newFlutterDir\bin\flutter.bat" build appbundle --release --build-name=$buildName --build-number=$buildNumber --split-debug-info=build/app/outputs/symbols

Write-Host "========================================"
Write-Host "빌드 완료!"
Write-Host "APK: d:\food\mobile_app\build\app\outputs\flutter-apk\app-release.apk"
Write-Host "AAB: d:\food\mobile_app\build\app\outputs\bundle\release\app-release.aab"
Write-Host "========================================"
