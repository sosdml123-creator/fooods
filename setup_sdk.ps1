$ErrorActionPreference = "Stop"

# 기존 sdks 폴더가 존재한다면 깔끔하게 사전 정리
$sdkDir = "d:\food\sdks"
if (Test-Path $sdkDir) {
    Write-Host "기존 sdks 디렉터리를 정리합니다..."
    Remove-Item -Recurse -Force $sdkDir
}

# SDK 저장 폴더 생성
New-Item -ItemType Directory -Force -Path $sdkDir
New-Item -ItemType Directory -Force -Path "$sdkDir\flutter"
New-Item -ItemType Directory -Force -Path "$sdkDir\jdk"
New-Item -ItemType Directory -Force -Path "$sdkDir\android\cmdline-tools"

# 1. Java JDK 17 다운로드 및 설정
Write-Host "========================================"
Write-Host "1. 자바 JDK 17 다운로드 중..."
Write-Host "========================================"
$jdkUrl = "https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.11%2B9/OpenJDK17U-jdk_x64_windows_hotspot_17.0.11_9.zip"
$jdkZip = "$sdkDir\jdk.zip"
Invoke-WebRequest -Uri $jdkUrl -OutFile $jdkZip

Write-Host "JDK 17 압축 해제 중..."
Expand-Archive -Path $jdkZip -DestinationPath "$sdkDir\jdk-temp"
$extractedJdkDir = Get-ChildItem -Path "$sdkDir\jdk-temp" -Directory | Select-Object -First 1
Move-Item -Path "$($extractedJdkDir.FullName)\*" -Destination "$sdkDir\jdk"
Remove-Item -Recurse -Force "$sdkDir\jdk-temp"
Remove-Item -Force $jdkZip

# 2. 안드로이드 CLI 도구 다운로드 및 설정
Write-Host "========================================"
Write-Host "2. 안드로이드 Command Line Tools 다운로드 중..."
Write-Host "========================================"
$androidUrl = "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip"
$androidZip = "$sdkDir\android.zip"
Invoke-WebRequest -Uri $androidUrl -OutFile $androidZip

Write-Host "안드로이드 CLI 도구 압축 해제 중..."
Expand-Archive -Path $androidZip -DestinationPath "$sdkDir\android\cmdline-tools\temp"
New-Item -ItemType Directory -Force -Path "$sdkDir\android\cmdline-tools\latest"
Move-Item -Path "$sdkDir\android\cmdline-tools\temp\cmdline-tools\*" -Destination "$sdkDir\android\cmdline-tools\latest"
Remove-Item -Recurse -Force "$sdkDir\android\cmdline-tools\temp"
Remove-Item -Force $androidZip

# 라이선스 자동 동의 및 패키지 설치용 환경변수 임시 설정
$env:JAVA_HOME = "$sdkDir\jdk"
$env:ANDROID_HOME = "$sdkDir\android"
$env:PATH = "$sdkDir\jdk\bin;$sdkDir\android\cmdline-tools\latest\bin;" + $env:PATH

# 3. 안드로이드 SDK 패키지 설치 (플랫폼, 빌드 도구)
Write-Host "========================================"
Write-Host "3. 안드로이드 SDK 필수 컴포넌트 다운로드 및 라이선스 동의 중..."
Write-Host "========================================"
$sdkManager = "$sdkDir\android\cmdline-tools\latest\bin\sdkmanager.bat"
$inputs = "y`ny`ny`ny`ny`ny`ny`n"
$inputs | & $sdkManager --sdk_root="$sdkDir\android" "platform-tools" "platforms;android-36" "build-tools;36.0.0"

# 4. Flutter SDK 다운로드 및 설정
Write-Host "========================================"
Write-Host "4. Flutter SDK 다운로드 중..."
Write-Host "========================================"
$flutterUrl = "https://storage.googleapis.com/flutter_infra_release/releases/stable/windows/flutter_windows_3.22.2-stable.zip"
$flutterZip = "$sdkDir\flutter.zip"
Invoke-WebRequest -Uri $flutterUrl -OutFile $flutterZip

Write-Host "Flutter SDK 압축 해제 중..."
Expand-Archive -Path $flutterZip -DestinationPath "$sdkDir\flutter-temp"
Move-Item -Path "$sdkDir\flutter-temp\flutter\*" -Destination "$sdkDir\flutter"
Remove-Item -Recurse -Force "$sdkDir\flutter-temp"
Remove-Item -Force $flutterZip

# 환경변수 재설정 (Flutter 경로 추가)
$env:PATH = "$sdkDir\flutter\bin;" + $env:PATH

# 5. Flutter 빌드 대상 도구 경로 수동 지정
Write-Host "========================================"
Write-Host "5. Flutter 개발 환경 설정 맵핑 및 라이선스 승인..."
Write-Host "========================================"
& "$sdkDir\flutter\bin\flutter.bat" config --android-sdk "$sdkDir\android"
& "$sdkDir\flutter\bin\flutter.bat" config --jdk-dir "$sdkDir\jdk"

# 안드로이드 라이선스 자동 승인 처리
$inputs | & "$sdkDir\flutter\bin\flutter.bat" doctor --android-licenses

# 6. Flutter 프로젝트 아이콘, 스플래시 생성 및 릴리즈 APK 최종 빌드
Write-Host "========================================"
Write-Host "6. Flutter 하이브리드 앱 APK 컴파일 및 빌드 시작..."
Write-Host "========================================"
Set-Location "d:\food\mobile_app"
& "$sdkDir\flutter\bin\flutter.bat" pub get
& "$sdkDir\flutter\bin\flutter.bat" pub run flutter_launcher_icons
& "$sdkDir\flutter\bin\flutter.bat" pub run flutter_native_splash:create
& "$sdkDir\flutter\bin\flutter.bat" build apk --release

Write-Host "========================================"
Write-Host "🎉 모든 작업 완료! APK 파일이 빌드되었습니다."
Write-Host "위치: d:\food\mobile_app\build\app\outputs\flutter-apk\app-release.apk"
Write-Host "========================================"
