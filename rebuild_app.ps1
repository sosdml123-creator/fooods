$ErrorActionPreference = "Stop"

$sdkDir = "d:\food\sdks"
$env:JAVA_HOME = "$sdkDir\jdk"
$env:ANDROID_HOME = "$sdkDir\android"
$env:PATH = "$sdkDir\jdk\bin;$sdkDir\android\cmdline-tools\latest\bin;$sdkDir\flutter\bin;" + $env:PATH

# 1. 기존 keystore 백업 및 Git HEAD 기준 복원
Write-Host "1. Git HEAD 기준 원본 코드 복원 및 keystore 보호 중..."
$keystorePath = "d:\food\mobile_app\android\app\upload-keystore.jks"
$tempBackupKeystore = "d:\food\upload-keystore.jks.temp"

# 임시 폴더 대신 루트에 임시 복사
if (Test-Path $keystorePath) {
    Copy-Item -Path $keystorePath -Destination $tempBackupKeystore -Force
}

# Git HEAD 기준으로 모바일 앱 리소스 원상 복구 (권한, Kakao login 등 보존)
Set-Location "d:\food"
& git restore mobile_app

# 백업한 keystore를 다시 제자리에 위치
if (Test-Path $tempBackupKeystore) {
    New-Item -ItemType Directory -Force -Path "d:\food\mobile_app\android\app"
    Move-Item -Path $tempBackupKeystore -Destination $keystorePath -Force
}

# 2. Flutter 프로젝트 클린
Write-Host "2. Flutter Clean 실행..."
Set-Location "d:\food\mobile_app"
& "$sdkDir\flutter\bin\flutter.bat" clean

# 3. Android API 35 타겟 설정 및 JVM 호환성 수정 (in-place)
Write-Host "3. Android build.gradle API 35 및 JVM 호환성 설정 수정 중..."
$gradlePath = "d:\food\mobile_app\android\app\build.gradle"
$gradleContent = [System.IO.File]::ReadAllText($gradlePath)

$gradleContent = $gradleContent -replace 'compileSdk\s*=?\s*flutter\.compileSdkVersion', 'compileSdk = 35'
$gradleContent = $gradleContent -replace 'targetSdk\s*=?\s*flutter\.targetSdkVersion', 'targetSdk = 35'
$gradleContent = $gradleContent -replace 'compileOptions\s*\{', "kotlinOptions {`n        jvmTarget = '1.8'`n    }`n`n    compileOptions {"

[System.IO.File]::WriteAllText($gradlePath, $gradleContent)

# 4. Gradle 및 Kotlin 버전 업그레이드 (API 35 빌드 호환성 확보)
Write-Host "4. Gradle Wrapper 및 Kotlin 플러그인 업그레이드 중..."
$wrapperPath = "d:\food\mobile_app\android\gradle\wrapper\gradle-wrapper.properties"
$wrapperContent = [System.IO.File]::ReadAllText($wrapperPath)
$wrapperContent = $wrapperContent.Replace("gradle-7.6.3-all.zip", "gradle-8.4-all.zip")
[System.IO.File]::WriteAllText($wrapperPath, $wrapperContent)

$settingsPath = "d:\food\mobile_app\android\settings.gradle"
$settingsContent = [System.IO.File]::ReadAllText($settingsPath)
$settingsContent = $settingsContent.Replace('id "com.android.application" version "7.3.0"', 'id "com.android.application" version "8.1.0"')
$settingsContent = $settingsContent.Replace('id "org.jetbrains.kotlin.android" version "1.7.10"', 'id "org.jetbrains.kotlin.android" version "1.8.22"')
[System.IO.File]::WriteAllText($settingsPath, $settingsContent)

# 5. 패키지 설치, 아이콘/스플래시 생성
Write-Host "5. Flutter 패키지 설치 및 런처 리소스 생성..."
Set-Location "d:\food\mobile_app"
& "$sdkDir\flutter\bin\flutter.bat" pub get
& "$sdkDir\flutter\bin\flutter.bat" pub run flutter_launcher_icons
& "$sdkDir\flutter\bin\flutter.bat" pub run flutter_native_splash:create

# 6. 최종 배포용 App Bundle (AAB) 빌드
Write-Host "========================================"
Write-Host "6. 릴리즈 배포용 App Bundle (AAB) 최종 빌드 실행..."
Write-Host "========================================"
& "$sdkDir\flutter\bin\flutter.bat" build appbundle --release

Write-Host "========================================"
Write-Host "🎉 App Bundle 서명 및 빌드 성공 완료!"
Write-Host "최종 App Bundle (.aab) 위치: d:\food\mobile_app\build\app\outputs\bundle\release\app-release.aab"
Write-Host "========================================"
