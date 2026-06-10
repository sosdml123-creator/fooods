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
Copy-Item -Path "d:\food\mobile_app\assets\icon.png" -Destination "$tempBackupDir\icon.png" -Force
Copy-Item -Path "d:\food\mobile_app\lib\main.dart" -Destination "$tempBackupDir\main.dart" -Force

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
Copy-Item -Path "$tempBackupDir\icon.png" -Destination "d:\food\mobile_app\assets\icon.png" -Force
Copy-Item -Path "$tempBackupDir\main.dart" -Destination "d:\food\mobile_app\lib\main.dart" -Force
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
  webview_flutter: ^4.8.0

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
Set-Content -Path $pubspecPath -Value $pubspecContent -Encoding UTF8

# 6. AndroidManifest.xml 권한 및 Cleartext 설정 변경
Write-Host "6. AndroidManifest.xml 권한 추가 중..."
$manifestPath = "d:\food\mobile_app\android\app\src\main\AndroidManifest.xml"
$manifestContent = Get-Content -Path $manifestPath -Raw

# 인터넷 권한 추가
$internetPermission = "    <uses-permission android:name=`"android.permission.INTERNET`" />"
$manifestContent = $manifestContent.Replace("<manifest xmlns:android=`"http://schemas.android.com/apk/res/android`">", "<manifest xmlns:android=`"http://schemas.android.com/apk/res/android`">`n$internetPermission")

# usesCleartextTraffic="true" 추가 (이중 따옴표 내 백틱 개행 처리)
$manifestContent = $manifestContent.Replace("<application", "<application`n        android:usesCleartextTraffic=`"true`"")

Set-Content -Path $manifestPath -Value $manifestContent -Encoding UTF8

# 7. 패키지 설치, 아이콘/스플래시 생성 및 최종 release APK 컴파일
Write-Host "7. Flutter 패키지 수급 및 아이콘/스플래시 자동 생성..."
Set-Location "d:\food\mobile_app"
& "$sdkDir\flutter\bin\flutter.bat" pub get
& "$sdkDir\flutter\bin\flutter.bat" pub run flutter_launcher_icons
& "$sdkDir\flutter\bin\flutter.bat" pub run flutter_native_splash:create

Write-Host "========================================"
Write-Host "8. 릴리즈 배포용 APK 최종 빌드 실행..."
Write-Host "========================================"
& "$sdkDir\flutter\bin\flutter.bat" build apk --release

Write-Host "========================================"
Write-Host "🎉 하이브리드 앱 빌드 성공 완료!"
Write-Host "최종 APK 위치: d:\food\mobile_app\build\app\outputs\flutter-apk\app-release.apk"
Write-Host "========================================"
