import React, { useEffect, useRef } from 'react';

function AdBanner() {
  const adRef = useRef(null);

  useEffect(() => {
    // 1. 하이브리드 앱 환경일 경우 Flutter Native로 상단 광고 로드 신호 전달
    if (window.flutter_inappwebview && window.flutter_inappwebview.callHandler) {
      window.flutter_inappwebview.callHandler('showAd', {
        type: 'banner',
        position: 'top',
        index: 0
      }).catch(err => console.error("AdMob showAd error:", err));
    }

    // 2. 구글 AdMob / AdSense 인라인 배너 활성화
    try {
      if (window.adsbygoogle && adRef.current) {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      }
    } catch (e) {
      console.error("AdSense top banner error:", e);
    }
  }, []);

  return (
    <div className="w-full bg-white border-b border-zinc-100 flex flex-col items-center justify-center min-h-[50px] relative overflow-hidden py-0.5">
      {/* 구글 모바일 광고 SDK (AdMob / AdSense) 상단 배너 단위 ID: ca-app-pub-3878859120989916/2421488045 */}
      <ins
        ref={adRef}
        className="adsbygoogle"
        style={{ display: 'block', width: '100%', height: '50px', textAlign: 'center' }}
        data-ad-client="ca-pub-3878859120989916"
        data-ad-slot="2421488045"
        data-ad-format="horizontal"
        data-full-width-responsive="true"
      ></ins>
    </div>
  );
}

export default AdBanner;
