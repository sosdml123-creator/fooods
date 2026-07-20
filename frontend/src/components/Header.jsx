import React from 'react';

function Header({ activeTab, setActiveTab, setSelectedCategory }) {
  if (activeTab === "community" || activeTab === "community_detail" || activeTab === "community_write" || activeTab === "notifications") {
    return null;
  }

  return (
    <header className="app-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <h1 className="cursor-pointer flex items-center gap-2" onClick={() => { setActiveTab("home"); setSelectedCategory("전체"); }}>
        <img src="/logo.svg" alt="PLAYTING Logo" className="w-7 h-7 rounded-lg shadow-sm" />
        <span>PLAYTING</span>
      </h1>
      <div className="flex items-center gap-1.5" style={{ marginLeft: "auto", display: "flex", gap: "8px", alignItems: "center" }}>
        {activeTab === "home" && (
          <button 
            className="text-zinc-600 hover:text-zinc-950 p-2 border-none bg-transparent active:scale-95 transition-transform" 
            onClick={() => setActiveTab("notifications")} 
            title="알림"
            style={{ cursor: "pointer" }}
          >
            <i className="fa-regular fa-bell text-lg"></i>
          </button>
        )}
        {activeTab === "mypage" && (
          <button 
            className="text-zinc-600 hover:text-zinc-950 p-2 border-none bg-transparent active:scale-95 transition-transform" 
            onClick={() => setActiveTab("settings")} 
            title="설정"
            style={{ cursor: "pointer" }}
          >
            <i className="fa-solid fa-gear text-base"></i>
          </button>
        )}
      </div>
    </header>
  );
}

export default Header;
