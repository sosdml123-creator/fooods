import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import { collection, query, onSnapshot, doc, updateDoc, addDoc } from "firebase/firestore";
import { Search, UserCheck, Shield, Ban, AlertTriangle, RefreshCw } from "lucide-react";

const STATUS_CONFIG = {
  normal:              { label: "정상",   color: "text-emerald-500", bg: "bg-emerald-500/10", dot: "🟢" },
  warn:                { label: "경고",   color: "text-amber-500",   bg: "bg-amber-500/10",   dot: "🟡" },
  suspended:           { label: "임시정지", color: "text-orange-500", bg: "bg-orange-500/10",  dot: "🟠" },
  permanent_suspended: { label: "영구정지", color: "text-red-500",   bg: "bg-red-500/10",     dot: "🔴" },
  locked:              { label: "잠금",   color: "text-purple-500",  bg: "bg-purple-500/10",  dot: "🔒" },
  withdrawn:           { label: "탈퇴",   color: "text-zinc-400",    bg: "bg-zinc-500/10",    dot: "⚫" },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.normal;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${cfg.color} ${cfg.bg}`}>
      {cfg.dot} {cfg.label}
    </span>
  );
}

// 개별 유저 빠른 액션 드롭다운
function QuickActionDropdown({ user, onDone }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const userName = user.nickname || user.name || user.displayName || "해당 회원";

  async function applyAction(newStatus, label) {
    if (!window.confirm(`${userName}을(를) [${label}] 처리하시겠습니까?`)) return;
    setLoading(true);
    try {
      const update = { status: newStatus };
      if (newStatus === "suspended") {
        const until = new Date();
        until.setDate(until.getDate() + 7);
        update.suspendedUntil = until.toISOString();
      }
      await updateDoc(doc(db, "users", user.id), update);
      await addDoc(collection(db, "adminLogs"), {
        action: label,
        detail: `대상: ${userName} (${user.id})`,
        targetId: user.id,
        createdAt: new Date().toISOString(),
      });
      onDone && onDone();
    } catch (err) {
      alert("처리 실패: " + err.message);
    } finally {
      setLoading(false);
      setOpen(false);
    }
  }

  const actions = [
    { label: "정상 복구", status: "normal", color: "text-emerald-500" },
    { label: "경고 부여", status: "warn", color: "text-amber-500" },
    { label: "7일 정지", status: "suspended", color: "text-orange-500" },
    { label: "영구 정지", status: "permanent_suspended", color: "text-red-500" },
    { label: "계정 잠금", status: "locked", color: "text-purple-500" },
  ];

  return (
    <div className="relative" onClick={e => e.stopPropagation()}>
      <button
        onClick={() => setOpen(!open)}
        disabled={loading}
        className="text-[10px] px-2 py-1 rounded border border-zinc-300 dark:border-[#30363d] text-zinc-500 hover:text-zinc-800 dark:hover:text-white hover:border-zinc-400 transition-colors font-bold"
      >
        {loading ? "처리중..." : "조치 ▾"}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] rounded-lg shadow-xl py-1 min-w-[120px]">
            {actions.map(action => (
              <button
                key={action.status}
                onClick={() => applyAction(action.status, action.label)}
                className={`w-full text-left px-3 py-2 text-[11px] font-bold hover:bg-zinc-50 dark:hover:bg-[#21262d] transition-colors ${action.color}`}
              >
                {action.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function Users({ navigateToUser }) {
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [searchType, setSearchType] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("createdAt_desc");

  useEffect(() => {
    const q = query(collection(db, "users"));
    const unsubscribe = onSnapshot(q, (snap) => {
      const allUsers = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setUsers(allUsers);
      setLoading(false);
    }, (error) => {
      console.error("Users snapshot error:", error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let result = [...users];

    if (statusFilter !== "all") {
      result = result.filter(u => (u.status || "normal") === statusFilter);
    }

    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(u => {
        const uid = (u.id || "").toLowerCase();
        const userName = (u.nickname || u.name || u.displayName || "").toLowerCase();
        const email = (u.email || "").toLowerCase();

        if (searchType === "name") return userName.includes(q);
        if (searchType === "uid") return uid.includes(q);
        if (searchType === "email") return email.includes(q);
        
        return uid.includes(q) || userName.includes(q) || email.includes(q);
      });
    }

    // 정렬
    result.sort((a, b) => {
      const nameA = a.nickname || a.name || a.displayName || "";
      const nameB = b.nickname || b.name || b.displayName || "";
      if (sortBy === "createdAt_desc") return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      if (sortBy === "createdAt_asc") return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
      if (sortBy === "name_asc") return nameA.localeCompare(nameB);
      if (sortBy === "reports_desc") return (b.reportCount || 0) - (a.reportCount || 0);
      return 0;
    });

    setFilteredUsers(result);
  }, [users, searchQuery, searchType, statusFilter, sortBy]);

  // 상태별 카운트
  const statusCounts = users.reduce((acc, u) => {
    const s = u.status || "normal";
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-brand-green-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* 상태별 요약 카드 */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <button
            key={key}
            onClick={() => setStatusFilter(statusFilter === key ? "all" : key)}
            className={`p-3 rounded-xl border text-center transition-all ${
              statusFilter === key
                ? `border-current ${cfg.color} bg-current/10`
                : "border-zinc-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] hover:border-zinc-300"
            }`}
          >
            <p className="text-lg">{cfg.dot}</p>
            <p className={`text-lg font-black mt-1 ${statusFilter === key ? cfg.color : "text-zinc-800 dark:text-white"}`}>
              {(statusCounts[key] || 0)}
            </p>
            <p className="text-[10px] text-zinc-400 font-semibold mt-0.5">{cfg.label}</p>
          </button>
        ))}
      </div>

      {/* 검색 및 필터 */}
      <div className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] p-4 rounded-xl shadow-sm flex flex-wrap gap-3 items-center justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={searchType}
            onChange={(e) => setSearchType(e.target.value)}
            className="px-3 py-2 rounded-lg border border-zinc-300 dark:border-[#30363d] bg-white dark:bg-[#0e1117] text-xs font-semibold text-zinc-700 dark:text-zinc-300 focus:outline-none"
          >
            <option value="all">통합검색</option>
            <option value="uid">UID</option>
            <option value="name">닉네임</option>
            <option value="email">이메일</option>
          </select>

          <div className="relative w-56">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <Search className="w-4 h-4 text-zinc-400" />
            </span>
            <input
              type="text"
              placeholder="검색어 입력..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-zinc-300 dark:border-[#30363d] bg-white dark:bg-[#0e1117] text-xs text-zinc-800 dark:text-zinc-200 focus:outline-none"
            />
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3 py-2 rounded-lg border border-zinc-300 dark:border-[#30363d] bg-white dark:bg-[#0e1117] text-xs font-semibold text-zinc-700 dark:text-zinc-300 focus:outline-none"
          >
            <option value="createdAt_desc">최신 가입순</option>
            <option value="createdAt_asc">오래된 가입순</option>
            <option value="name_asc">이름순</option>
            <option value="reports_desc">신고 많은순</option>
          </select>
        </div>

        <span className="text-xs font-semibold text-zinc-400">
          결과: <strong className="text-zinc-700 dark:text-white">{filteredUsers.length}</strong> / {users.length} 명
        </span>
      </div>

      {/* 테이블 */}
      <div className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-zinc-50 dark:bg-[#161b22]/30 border-b border-zinc-200 dark:border-[#30363d] text-zinc-400 uppercase tracking-wider font-semibold">
                <th className="px-4 py-3">프로필</th>
                <th className="px-4 py-3">닉네임</th>
                <th className="px-4 py-3">이메일</th>
                <th className="px-4 py-3">가입일</th>
                <th className="px-4 py-3">마지막 접속</th>
                <th className="px-4 py-3">상태</th>
                <th className="px-4 py-3 text-center">신고</th>
                <th className="px-4 py-3 text-center">빠른 조치</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-[#30363d]">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-5 py-12 text-center text-zinc-400">
                    조건에 일치하는 회원이 없습니다.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const displayName = u.nickname || u.name || u.displayName || "플레이터";
                  const hasAvatar = u.avatarImg && u.avatarImg.startsWith("http");
                  const dateJoin = u.createdAt ? u.createdAt.split("T")[0] : "-";
                  const lastLogin = u.lastLoginAt ? u.lastLoginAt.split("T")[0] : "-";
                  const isToday = u.createdAt && u.createdAt.split("T")[0] === new Date().toISOString().split("T")[0];

                  return (
                    <tr
                      key={u.id}
                      className="hover:bg-zinc-50/50 dark:hover:bg-[#21262d]/25 transition-colors cursor-pointer"
                      onClick={() => navigateToUser(u.id)}
                    >
                      <td className="px-4 py-3">
                        <div className="relative">
                          <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-[#30363d] overflow-hidden flex items-center justify-center">
                            {hasAvatar ? (
                              <img src={u.avatarImg} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span className="font-bold text-zinc-500 dark:text-zinc-300">{displayName ? displayName[0] : "?"}</span>
                            )}
                          </div>
                          {isToday && (
                            <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white dark:border-[#161b22]"></span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-bold text-zinc-800 dark:text-zinc-200">{displayName}</p>
                          <p className="text-[10px] font-mono text-zinc-400 truncate max-w-[100px]" title={u.id}>{u.id}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400">{u.email || "-"}</td>
                      <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400">
                        {dateJoin}
                        {isToday && <span className="ml-1 text-[9px] bg-emerald-500/10 text-emerald-500 font-bold px-1 rounded">NEW</span>}
                      </td>
                      <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400">{lastLogin}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={u.status || "normal"} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-black ${(u.reportCount || 0) > 0 ? "text-red-500" : "text-zinc-400"}`}>
                          {u.reportCount || 0}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                        <QuickActionDropdown user={u} onDone={() => {}} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
