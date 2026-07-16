/**
 * 디바이스 고유값(deviceFingerprint)을 추출하는 유틸리티 함수
 * 
 * 1. Android/iOS 네이티브 앱 (Flutter Webview): flutter_inappwebview getDeviceId 핸들러 이용
 * 2. Capacitor 네이티브 앱: @capacitor/device 플러그인 동적 임포트 호출 시도
 * 3. Web 브라우저 환경: Canvas API 픽셀 정보, User Agent, 화면 해상도, 타임존 등을 결합한 고유 해시(Canvas Fingerprint) 생성
 */
export async function getDeviceFingerprint() {
  // 1. Flutter InAppWebView 네이티브 브릿지 확인
  if (window.flutter_inappwebview && typeof window.flutter_inappwebview.callHandler === "function") {
    try {
      const id = await window.flutter_inappwebview.callHandler("getDeviceId");
      if (id) {
        return `flutter_${id}`;
      }
    } catch (e) {
      console.warn("[Fingerprint] Flutter getDeviceId failed:", e);
    }
  }

  // 2. Capacitor 네이티브 플랫폼 확인
  if (window.Capacitor && typeof window.Capacitor.isNativePlatform === "function" && window.Capacitor.isNativePlatform()) {
    try {
      const capDeviceModule = "@capacitor/device";
      const { Device } = await import(/* @vite-ignore */ capDeviceModule);
      const info = await Device.getId();
      if (info && info.identifier) {
        return `cap_${info.identifier}`;
      }
    } catch (e) {
      console.warn("[Fingerprint] Capacitor Device.getId failed, fallback to Web fingerprint:", e);
    }
  }

  // 3. Web 브라우저 고유 Canvas 핑거프린트 생성 (0-dependency)
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context not supported");

    // 그래픽 카드 렌더링 미세 차이 유도를 위한 복합 드로잉
    ctx.textBaseline = "top";
    ctx.font = "14px 'Arial'";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#f60";
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = "#069";
    ctx.fillText("plating_app_device_fingerprint_v1", 2, 15);
    ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
    ctx.fillText("plating_app_device_fingerprint_v1", 4, 17);
    const canvasData = canvas.toDataURL();

    // 부가 정보 수집
    const userAgent = navigator.userAgent || "";
    const language = navigator.language || "";
    const colorDepth = screen.colorDepth || "";
    const screenResolution = `${screen.width}x${screen.height}`;
    const timezoneOffset = new Date().getTimezoneOffset();

    // 결합 문자열 해싱
    const compositeString = canvasData + userAgent + language + colorDepth + screenResolution + timezoneOffset;
    let hash = 0;
    for (let i = 0; i < compositeString.length; i++) {
      const char = compositeString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }

    const uniqueHash = Math.abs(hash).toString(16);
    return `web_${uniqueHash}`;
  } catch (e) {
    console.error("[Fingerprint] Web canvas fingerprint generation failed:", e);
    // 최악의 경우 임시 매칭용 로컬스토리지 복원용 ID 생성
    let fallbackId = localStorage.getItem("plating_fallback_device_id");
    if (!fallbackId) {
      fallbackId = `web_fallback_${Math.random().toString(36).substring(2, 15)}`;
      localStorage.setItem("plating_fallback_device_id", fallbackId);
    }
    return fallbackId;
  }
}
