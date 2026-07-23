import React, { useEffect } from 'react';

function AdBanner() {
  useEffect(() => {
    // 1. 하이브리드 앱 환경일 경우 Flutter Native로 상단 광고 로드 신호 전달
    if (window.flutter_inappwebview && window.flutter_inappwebview.callHandler) {
      window.flutter_inappwebview.callHandler('showAd', {
        type: 'banner',
        position: 'top',
        index: 0
      }).catch(err => console.error("AdMob showAd error:", err));
    }
  }, []);

  const handleClick = () => {
    // 쿠팡/파트너스 타이머 할인 페이지 연결
    window.open("https://link.coupang.com", "_blank");
  };

  return (
    <div className="w-full px-3 py-2 bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 text-white shadow-sm flex items-center justify-between cursor-pointer transition-all hover:brightness-105 active:scale-[0.99]" onClick={handleClick}>
      <div className="flex items-center gap-2 min-w-0">
        <span className="bg-black/20 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-full flex-shrink-0 border border-white/20">
          AD
        </span>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm">🍳</span>
          <span className="text-xs font-bold truncate tracking-tight">
            요리할 때 필수! 감성 타이머 특가 50% 할인
          </span>
        </div>
      </div>
      
      <div className="flex-shrink-0 flex items-center gap-1 bg-white/20 hover:bg-white/30 backdrop-blur-md px-2.5 py-1 rounded-full text-[11px] font-bold text-white transition-colors border border-white/30">
        <span>혜택보기</span>
        <i className="fa-solid fa-chevron-right text-[9px]"></i>
      </div>
    </div>
  );
}

export default AdBanner;
