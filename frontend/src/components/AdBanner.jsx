import React, { useEffect, useRef, useState } from 'react';

function AdBanner() {
  const adRef = useRef(null);
  const pushedRef = useRef(false);
  const [adError, setAdError] = useState(false);
  const isNativeApp = typeof window !== 'undefined' && window.flutter_inappwebview && window.flutter_inappwebview.callHandler;

  useEffect(() => {
    if (isNativeApp) {
      // 네이티브 앱(Flutter WebView) 환경: 상단 네이티브 애드몹 광고 호출
      window.flutter_inappwebview.callHandler('showAd', { type: 'banner', position: 'top' }).catch(() => {});
      return;
    }

    // 일반 웹 브라우저 환경: 중복 push 방지 및 에러 안전 핸들링
    if (pushedRef.current) return;

    try {
      if (!document.getElementById('google-adsense-script')) {
        const script = document.createElement('script');
        script.id = 'google-adsense-script';
        script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3878859120989916';
        script.async = true;
        script.crossOrigin = 'anonymous';
        script.onerror = () => setAdError(true);
        document.head.appendChild(script);
      }

      const timer = setTimeout(() => {
        if (
          adRef.current &&
          !adRef.current.getAttribute('data-adsbygoogle-status') &&
          !adRef.current.getAttribute('data-ad-status')
        ) {
          try {
            (window.adsbygoogle = window.adsbygoogle || []).push({});
            pushedRef.current = true;
          } catch (e) {
            console.warn("[AdBanner] adsbygoogle push safe warning:", e);
          }
        }
      }, 250);

      return () => clearTimeout(timer);
    } catch (e) {
      console.warn("[AdBanner] Google Ads init safe catch:", e);
      setAdError(true);
    }
  }, [isNativeApp]);

  // 네이티브 앱에서는 최상단 네이티브 애드몹 배너가 별도로 뜨므로 웹 배너 중복 제거
  if (isNativeApp) {
    return null;
  }

  if (adError) {
    return (
      <div className="w-full my-2 px-3 py-2 bg-gradient-to-r from-zinc-50 via-amber-50/50 to-zinc-50 border border-zinc-200/80 rounded-xl shadow-xs flex items-center justify-between min-h-[46px]">
        <div className="flex items-center gap-2">
          <span className="bg-amber-100 text-amber-800 text-[9px] font-extrabold px-1.5 py-0.5 rounded border border-amber-200">
            SPONSORED
          </span>
          <span className="text-xs font-bold text-zinc-700">🍳 오늘 뭐 해먹지? 플레이팅 추천 레시피</span>
        </div>
        <span className="text-[10px] text-zinc-400 font-medium">Plating Partner</span>
      </div>
    );
  }

  return (
    <div className="w-full my-2 px-3 py-1 bg-zinc-50 border border-zinc-200/80 rounded-xl overflow-hidden shadow-xs flex justify-center items-center min-h-[50px]">
      <ins
        ref={adRef}
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
