import React, { useEffect, useRef } from 'react';

function AdBanner() {
  const adRef = useRef(null);
  const isNativeApp = typeof window !== 'undefined' && window.flutter_inappwebview && window.flutter_inappwebview.callHandler;

  useEffect(() => {
    if (isNativeApp) {
      // 네이티브 앱(Flutter WebView) 환경: 상단 네이티브 애드몹 광고 호출
      window.flutter_inappwebview.callHandler('showAd', { type: 'banner', position: 'top' }).catch(() => {});
    } else {
      // 일반 웹 브라우저 환경: 구글 애드몹/애드센스 웹 배너 스크립트 실행
      try {
        if (!document.getElementById('google-adsense-script')) {
          const script = document.createElement('script');
          script.id = 'google-adsense-script';
          script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3878859120989916';
          script.async = true;
          script.crossOrigin = 'anonymous';
          document.head.appendChild(script);
        }
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch (e) {
        console.error("[AdBanner] Google Ads init error:", e);
      }
    }
  }, [isNativeApp]);

  // 네이티브 앱에서는 최상단 네이티브 애드몹 배너가 별도로 뜨므로 웹 배너 중복 제거
  if (isNativeApp) {
    return null;
  }

  return (
    <div className="w-full my-2 px-3 py-1 bg-zinc-50 border border-zinc-200/80 rounded-xl overflow-hidden shadow-xs flex justify-center items-center min-h-[50px]">
      <ins
        className="adsbygoogle"
        style={{ display: 'block', width: '100%', height: '50px', textAlign: 'center' }}
        data-ad-client="ca-pub-3878859120989916"
        data-ad-slot="2421488045"
        data-ad-format="horizontal"
        data-full-width-responsive="true"
      />
    </div>
  );
}

export default AdBanner;
