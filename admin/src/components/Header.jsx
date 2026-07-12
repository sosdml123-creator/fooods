import React from "react";
import { Sun, Moon, Bell, Search, User } from "lucide-react";

const VIEW_TITLES = {
  dashboard: "Dashboard",
  users: "회원관리",
  user_details: "회원 상세 정보",
  reports: "신고관리",
  posts: "게시글관리",
  comments: "댓글관리",
  photos: "사진관리",
  blocks: "차단관리",
  notices: "공지관리",
  push: "푸시관리",
  statistics: "통계분석",
  logs: "로그관리 (Audit Logs)",
  admins: "관리자관리",
  settings: "설정 및 정책",
};

export default function Header({ darkMode, setDarkMode, user, currentView }) {
  const viewTitle = VIEW_TITLES[currentView] || "플레이팅 관리";

  return (
    <header className="h-16 flex items-center justify-between px-6 bg-white dark:bg-[#161b22] border-b border-zinc-200 dark:border-[#30363d] transition-colors">
      {/* Title / Section Name */}
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-bold text-zinc-800 dark:text-white">{viewTitle}</h2>
      </div>

      {/* Header Actions */}
      <div className="flex items-center gap-4">
        {/* Global Search Mockup */}
        <div className="relative hidden md:block w-64">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <Search className="w-4 h-4 text-zinc-400" />
          </span>
          <input
            type="text"
            placeholder="통합 검색..."
            className="w-full pl-9 pr-4 py-1.5 rounded-lg border border-zinc-300 dark:border-[#30363d] bg-zinc-50 dark:bg-[#0e1117] text-sm text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-brand-green-500 focus:ring-1 focus:ring-brand-green-500"
          />
        </div>

        {/* Notifications Icon (Mock) */}
        <button className="relative p-2 rounded-lg text-zinc-500 hover:text-zinc-800 dark:text-[#8b949e] dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-[#21262d] transition-all">
          <Bell className="w-4.5 h-4.5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
        </button>

        {/* Theme Toggle */}
        <button
          onClick={() => setDarkMode(!darkMode)}
          className="p-2 rounded-lg text-zinc-500 hover:text-zinc-800 dark:text-[#8b949e] dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-[#21262d] transition-all"
          title={darkMode ? "라이트모드 전환" : "다크모드 전환"}
        >
          {darkMode ? <Sun className="w-4.5 h-4.5" /> : <Moon className="w-4.5 h-4.5" />}
        </button>

        {/* Vertical divider */}
        <div className="h-6 w-px bg-zinc-200 dark:bg-[#30363d]"></div>

        {/* Admin profile indicator */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-brand-green-100 dark:bg-brand-green-900/50 flex items-center justify-center border border-brand-green-500/20">
            <User className="w-4 h-4 text-brand-green-700 dark:text-brand-green-100" />
          </div>
          <div className="hidden sm:block text-left">
            <p className="text-xs font-bold leading-none text-zinc-800 dark:text-white">마스터 관리자</p>
            <p className="text-[10px] text-zinc-400 mt-0.5">{user?.email || "admin@myplating.kr"}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
