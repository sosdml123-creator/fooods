import React, { useEffect, useRef } from 'react';

function AdBanner() {
  const adRef = useRef(null);

  useEffect(() => {
    // 1. 하이브리드 앱 환경 시 Flutter Native로 상단 광고 로드 신호 전달
    if (window.flutter_inappwebview && window.flutter_inappwebview.callHandler) {
      window.flutter_inappwebview.callHandler('showAd', {
        type: 'banner',
        position: 'top',
        index: 0
      }).catch(err => console.error("AdMob showAd error:", err));
    }

    // 2. 웹 / 인라인 환경 시 Google AdSense / AdMob 인라인 배너 태그 활성화
    try {
      if (window.adsbygoogle && adRef.current) {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      }
    } catch (e) {
      console.error("AdSense top banner error:", e);
    }
  }, []);

  return (
    <div className="ad-banner-wrapper w-full bg-zinc-50 border-b border-zinc-200/80 flex flex-col items-center justify-center min-h-[50px] relative py-1">
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

      {/* 기존 감성 타이머 특가 안내 라벨 (광고 영역 하단 표시) */}
      <div className="flex items-center gap-1.5 mt-0.5 px-2 py-0.5 rounded text-[10px] text-zinc-500 font-medium">
        <span className="bg-orange-500 text-white text-[8px] font-extrabold px-1.5 py-0.2 rounded-full">AD</span>
        <span>🍳 요리할 때 필수! 감성 타이머 특가 할인 중</span>
      </div>
    </div>
  );
}

export default AdBanner;
