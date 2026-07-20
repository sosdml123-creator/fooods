import React from 'react';

function BottomNav({ activeTab, setActiveTab, setActiveComPostId }) {
  return (
    <nav className="bottom-nav">
      <button className={`bottom-nav-item ${activeTab === 'home' ? 'active' : ''}`} onClick={() => setActiveTab('home')}>
        <i className="fa-solid fa-house"></i>
        <span>홈</span>
      </button>
      <button className={`bottom-nav-item ${activeTab === 'search' ? 'active' : ''}`} onClick={() => setActiveTab('search')}>
        <i className="fa-solid fa-magnifying-glass"></i>
        <span>검색</span>
      </button>
      <button className={`bottom-nav-item ${activeTab === 'map' ? 'active' : ''}`} onClick={() => setActiveTab('map')}>
        <i className="fa-solid fa-map-location-dot text-emerald-500"></i>
        <span className="text-emerald-600 font-bold">지도</span>
      </button>
      <button className={`bottom-nav-item ${(activeTab === 'community' || activeTab === 'community_detail') ? 'active' : ''}`} onClick={() => { setActiveTab('community'); setActiveComPostId(null); }}>
        <i className="fa-solid fa-comments"></i>
        <span>커뮤니티</span>
      </button>
      <button className={`bottom-nav-item ${activeTab === 'mypage' ? 'active' : ''}`} onClick={() => setActiveTab('mypage')}>
        <i className="fa-solid fa-user"></i>
        <span>마이페이지</span>
      </button>
    </nav>
  );
}

export default BottomNav;
