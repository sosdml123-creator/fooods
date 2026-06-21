$ErrorActionPreference = "Stop"

$sdkDir = "d:\food\sdks"
$env:JAVA_HOME = "$sdkDir\jdk"
$env:ANDROID_HOME = "$sdkDir\android"
$env:PATH = "$sdkDir\jdk\bin;$sdkDir\android\cmdline-tools\latest\bin;$sdkDir\flutter\bin;" + $env:PATH

# 1. 기존 리소스 임시 백업
Write-Host "1. 기존 리소스 임시 백업 중..."
$tempBackupDir = "d:\food\temp_backup"
if (Test-Path $tempBackupDir) { Remove-Item -Recurse -Force $tempBackupDir }
New-Item -ItemType Directory -Force -Path $tempBackupDir
if (Test-Path "d:\food\mobile_app\assets\icon.png") { Copy-Item -Path "d:\food\mobile_app\assets\icon.png" -Destination "$tempBackupDir\icon.png" -Force }
if (Test-Path "d:\food\mobile_app\lib\main.dart") { Copy-Item -Path "d:\food\mobile_app\lib\main.dart" -Destination "$tempBackupDir\main.dart" -Force }
if (Test-Path "d:\food\mobile_app\lib\custom_gallery_picker.dart") { Copy-Item -Path "d:\food\mobile_app\lib\custom_gallery_picker.dart" -Destination "$tempBackupDir\custom_gallery_picker.dart" -Force }
if (Test-Path "d:\food\mobile_app\android\app\upload-keystore.jks") { Copy-Item -Path "d:\food\mobile_app\android\app\upload-keystore.jks" -Destination "$tempBackupDir\upload-keystore.jks" -Force }

# 2. 불완전한 기존 폴더 삭제
Write-Host "2. 기존 폴더 정리 중..."
Remove-Item -Recurse -Force "d:\food\mobile_app"

# 3. 표준 Flutter 프로젝트 생성
Write-Host "3. 표준 Flutter 하이브리드 프로젝트 생성 중..."
Set-Location "d:\food"
& "$sdkDir\flutter\bin\flutter.bat" create --org com.foodhouse --project-name plating_mobile_app mobile_app

# 4. 백업 리소스 복원
Write-Host "4. 백업 리소스 복원 중..."
New-Item -ItemType Directory -Force -Path "d:\food\mobile_app\assets"
if (Test-Path "$tempBackupDir\icon.png") { Copy-Item -Path "$tempBackupDir\icon.png" -Destination "d:\food\mobile_app\assets\icon.png" -Force }
if (Test-Path "$tempBackupDir\main.dart") { Copy-Item -Path "$tempBackupDir\main.dart" -Destination "d:\food\mobile_app\lib\main.dart" -Force }
if (Test-Path "$tempBackupDir\custom_gallery_picker.dart") { Copy-Item -Path "$tempBackupDir\custom_gallery_picker.dart" -Destination "d:\food\mobile_app\lib\custom_gallery_picker.dart" -Force }
if (Test-Path "$tempBackupDir\upload-keystore.jks") {
    New-Item -ItemType Directory -Force -Path "d:\food\mobile_app\android\app"
    Copy-Item -Path "$tempBackupDir\upload-keystore.jks" -Destination "d:\food\mobile_app\android\app\upload-keystore.jks" -Force
}
Remove-Item -Recurse -Force $tempBackupDir

# 5. pubspec.yaml 설정 갱신
Write-Host "5. pubspec.yaml 설정 업데이트 중..."
$pubspecPath = "d:\food\mobile_app\pubspec.yaml"
$pubspecContent = @"
name: plating_mobile_app
description: "Plating hybrid webview application for iOS and Android"
publish_to: 'none'

version: 1.0.0+1

environment:
  sdk: '>=3.0.0 <4.0.0'

dependencies:
  flutter:
    sdk: flutter
  cupertino_icons: ^1.0.8
  flutter_inappwebview: ^6.0.0
  permission_handler: ^11.3.1
  photo_manager: 3.0.0
  image_picker: ^1.1.2
  http: ^1.2.1

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^3.0.0
  flutter_launcher_icons: ^0.13.1
  flutter_native_splash: ^2.4.1

flutter:
  uses-material-design: true
  assets:
    - assets/icon.png

flutter_launcher_icons:
  android: "launcher_icon"
  ios: false
  image_path: "assets/icon.png"
  adaptive_icon_background: "#000000"
  adaptive_icon_foreground: "assets/icon.png"

flutter_native_splash:
  color: "#000000"
  image: "assets/icon.png"
  android: true
  ios: true
"@
[System.IO.File]::WriteAllText($pubspecPath, $pubspecContent)

# 6. AndroidManifest.xml 권한 및 Cleartext 설정 변경
Write-Host "6. AndroidManifest.xml 권한 추가 중..."
$manifestPath = "d:\food\mobile_app\android\app\src\main\AndroidManifest.xml"
$manifestContent = [System.IO.File]::ReadAllText($manifestPath)

# 인터넷 및 광고 ID 권한 추가
$internetPermission = "    <uses-permission android:name=`"android.permission.INTERNET`" />`n    <uses-permission android:name=`"com.google.android.gms.permission.AD_ID`" />"
$manifestContent = $manifestContent.Replace("<manifest xmlns:android=`"http://schemas.android.com/apk/res/android`">", "<manifest xmlns:android=`"http://schemas.android.com/apk/res/android`">`n$internetPermission")

# usesCleartextTraffic="true" 및 AdMob App ID 추가
$admobMetadata = "        <!-- Google AdMob Application ID (Test ID, replace with your actual ID later) -->`n        <meta-data`n            android:name=`"com.google.android.gms.ads.APPLICATION_ID`"`n            android:value=`"ca-app-pub-3940256099942544~3347511713`"/>"
$manifestContent = $manifestContent.Replace("<application", "<application`n        android:usesCleartextTraffic=`"true`"")
$manifestContent = $manifestContent.Replace("<application`n        android:usesCleartextTraffic=`"true`">", "<application`n        android:usesCleartextTraffic=`"true`">`n$admobMetadata")

[System.IO.File]::WriteAllText($manifestPath, $manifestContent)

# 6.5. android/app/build.gradle 설정 변경 (API 35 및 서명 설정)
Write-Host "6.5. build.gradle API 35 및 릴리즈 서명 설정 중..."
$gradlePath = "d:\food\mobile_app\android\app\build.gradle"
$gradleContent = [System.IO.File]::ReadAllText($gradlePath)

# compileSdk 및 targetSdk를 API 35로 지정 (정규식 사용으로 공백 무관하게 매칭)
$gradleContent = $gradleContent -replace 'compileSdk\s*=?\s*flutter\.compileSdkVersion', 'compileSdk = 35'
$gradleContent = $gradleContent -replace 'targetSdk\s*=?\s*flutter\.targetSdkVersion', 'targetSdk = 35'

# signingConfigs 추가
$signingConfigBlock = "    signingConfigs {`n        release {`n            storeFile file('upload-keystore.jks')`n            storePassword 'plating1234'`n            keyAlias 'upload'`n            keyPassword 'plating1234'`n        }`n    }"
$gradleContent = $gradleContent.Replace("    defaultConfig {", "$signingConfigBlock`n`n    defaultConfig {")

# buildTypes.release.signingConfig를 release로 지정 (정규식 사용으로 공백 무관하게 매칭)
$gradleContent = $gradleContent -replace 'signingConfig\s*=?\s*signingConfigs\.debug', 'signingConfig = signingConfigs.release'

[System.IO.File]::WriteAllText($gradlePath, $gradleContent)

# 7. 패키지 설치, 아이콘/스플래시 생성 및 최종 release APK 컴파일
Write-Host "7. Flutter 패키지 수급 및 아이콘/스플래시 자동 생성..."
Set-Location "d:\food\mobile_app"
& "$sdkDir\flutter\bin\flutter.bat" pub get
& "$sdkDir\flutter\bin\flutter.bat" pub run flutter_launcher_icons
& "$sdkDir\flutter\bin\flutter.bat" pub run flutter_native_splash:create

Write-Host "========================================"
Write-Host "8. 릴리즈 배포용 App Bundle (AAB) 최종 빌드 실행..."
Write-Host "========================================"
& "$sdkDir\flutter\bin\flutter.bat" build appbundle --release

Write-Host "========================================"
Write-Host "🎉 하이브리드 앱 빌드 성공 완료!"
Write-Host "최종 App Bundle (.aab) 위치: d:\food\mobile_app\build\app\outputs\bundle\release\app-release.aab"
Write-Host "========================================"
