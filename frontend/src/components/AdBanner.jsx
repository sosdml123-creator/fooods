import React from 'react';

function AdBanner() {
  return (
    <div className="ad-banner cursor-pointer" onClick={() => alert("구글 애드센스 광고가 송출되는 구역입니다.")}>
      <div className="text-xs font-semibold text-zinc-950">🍳 요리할 때 필수! 감성 타이머 특가 할인 중</div>
      <div className="text-[10px] text-zinc-400">sponsored by Plating Partner</div>
    </div>
  );
}

export default AdBanner;
