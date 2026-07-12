import React from "react";
import { 
  LayoutDashboard, 
  Users, 
  Flag, 
  FileText, 
  MessageSquare, 
  Image, 
  Ban, 
  Bell, 
  Send, 
  BarChart3, 
  History, 
  ShieldCheck, 
  Settings,
  LogOut
} from "lucide-react";
import { auth } from "../firebase";

const MENUS = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "users", label: "회원관리", icon: Users },
  { key: "reports", label: "신고관리", icon: Flag },
  { key: "posts", label: "게시글관리", icon: FileText },
  { key: "comments", label: "댓글관리", icon: MessageSquare },
  { key: "photos", label: "사진관리", icon: Image },
  { key: "blocks", label: "차단관리", icon: Ban },
  { key: "notices", label: "공지관리", icon: Bell },
  { key: "push", label: "푸시관리", icon: Send },
  { key: "statistics", label: "통계", icon: BarChart3 },
  { key: "logs", label: "로그관리", icon: History },
  { key: "admins", label: "관리자관리", icon: ShieldCheck },
  { key: "settings", label: "설정", icon: Settings },
];

export default function Sidebar({ currentView, setCurrentView }) {
  async function handleLogout() {
    if (confirm("로그아웃 하시겠습니까?")) {
      await auth.signOut();
    }
  }

  // Normalize details subview to match 'users' active state in sidebar
  const activeMenu = currentView === "user_details" ? "users" : currentView;

  return (
    <aside className="w-64 flex-shrink-0 bg-[#161b22] border-r border-[#30363d] flex flex-col text-[#c9d1d9] hidden lg:flex">
      {/* Sidebar Header Brand */}
      <div className="h-16 flex items-center px-6 border-b border-[#30363d]">
        <span className="text-lg font-black tracking-wider text-white flex items-center gap-2">
          <img src="/admin_logo.png" className="w-6 h-6 rounded-md object-cover border border-[#30363d]" alt="" />
          PLAYTING ADMIN
        </span>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 py-4 overflow-y-auto custom-scrollbar px-3 space-y-1">
        {MENUS.map((menu) => {
          const Icon = menu.icon;
          const isActive = activeMenu === menu.key;
          return (
            <button
              key={menu.key}
              onClick={() => setCurrentView(menu.key)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive 
                  ? "bg-[#21262d] text-white border border-[#30363d]" 
                  : "text-[#8b949e] hover:text-white hover:bg-[#21262d]/50"
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? "text-brand-green-500" : ""}`} />
              {menu.label}
            </button>
          );
        })}
      </nav>

      {/* Sidebar Footer Logout */}
      <div className="p-4 border-t border-[#30363d]">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-950/20 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          로그아웃
        </button>
      </div>
    </aside>
  );
}
