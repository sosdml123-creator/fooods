import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import { collection, query, onSnapshot } from "firebase/firestore";
import { Search, UserCheck, HelpCircle } from "lucide-react";

export default function Users({ navigateToUser }) {
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search filter states
  const [searchType, setSearchType] = useState("all"); // "uid", "name", "email", "all"
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    const q = query(collection(db, "users"));
    const unsubscribe = onSnapshot(q, (snap) => {
      const allUsers = snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
      }));
      setUsers(allUsers);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Filter users based on query conditions
  useEffect(() => {
    let result = [...users];

    // Filter by Status
    if (statusFilter !== "all") {
      result = result.filter(u => u.status === statusFilter);
    }

    // Filter by Search Query
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase().trim();
      if (searchType === "uid") {
        result = result.filter(u => u.id && u.id.toLowerCase().includes(q));
      } else if (searchType === "name") {
        result = result.filter(u => u.name && u.name.toLowerCase().includes(q));
      } else if (searchType === "email") {
        result = result.filter(u => u.email && u.email.toLowerCase().includes(q));
      } else {
        // "all" search
        result = result.filter(u => 
          (u.id && u.id.toLowerCase().includes(q)) ||
          (u.name && u.name.toLowerCase().includes(q)) ||
          (u.email && u.email.toLowerCase().includes(q))
        );
      }
    }

    setFilteredUsers(result);
  }, [users, searchQuery, searchType, statusFilter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-brand-green-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] rounded-xl shadow-sm overflow-hidden">
      {/* 1. Control Header (Search & Filters) */}
      <div className="p-5 border-b border-zinc-200 dark:border-[#30363d] flex flex-wrap gap-4 items-center justify-between bg-zinc-50 dark:bg-[#161b22]/50">
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

          <div className="relative w-64">
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
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-zinc-300 dark:border-[#30363d] bg-white dark:bg-[#0e1117] text-xs font-semibold text-zinc-700 dark:text-zinc-300 focus:outline-none"
          >
            <option value="all">모든 상태</option>
            <option value="normal">🟢 정상</option>
            <option value="warn">🟡 경고</option>
            <option value="suspended">🟠 임시정지</option>
            <option value="permanent_suspended">🔴 영구정지</option>
            <option value="locked">🔒 잠금</option>
            <option value="withdrawn">⚫ 탈퇴</option>
          </select>
        </div>

        <span className="text-xs font-semibold text-zinc-400">
          검색 결과: <strong className="text-zinc-700 dark:text-white">{filteredUsers.length}</strong> 명
        </span>
      </div>

      {/* 2. Responsive Table */}
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-zinc-50 dark:bg-[#161b22]/30 border-b border-zinc-200 dark:border-[#30363d] text-zinc-400 uppercase tracking-wider font-semibold">
              <th className="px-5 py-3">프로필</th>
              <th className="px-5 py-3">UID</th>
              <th className="px-5 py-3">닉네임</th>
              <th className="px-5 py-3">이메일</th>
              <th className="px-5 py-3">가입일</th>
              <th className="px-5 py-3">마지막 접속</th>
              <th className="px-5 py-3">상태</th>
              <th className="px-5 py-3 text-center">신고</th>
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
                const hasAvatar = u.avatarImg && u.avatarImg.startsWith("http");
                const dateJoin = u.createdAt ? u.createdAt.split("T")[0] : "-";
                const lastLogin = u.lastLoginAt ? u.lastLoginAt.split("T")[0] : "-";

                // Resolve Status Colors
                let statusBadge = <span className="text-emerald-500 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full text-[10px]">🟢 정상</span>;
                if (u.status === "warn") {
                  statusBadge = <span className="text-amber-500 font-bold bg-amber-500/10 px-2 py-0.5 rounded-full text-[10px]">🟡 경고</span>;
                } else if (u.status === "suspended") {
                  statusBadge = <span className="text-orange-500 font-bold bg-orange-500/10 px-2 py-0.5 rounded-full text-[10px]">🟠 임시정지</span>;
                } else if (u.status === "permanent_suspended") {
                  statusBadge = <span className="text-red-500 font-bold bg-red-500/10 px-2 py-0.5 rounded-full text-[10px]">🔴 영구정지</span>;
                } else if (u.status === "locked") {
                  statusBadge = <span className="text-purple-500 font-bold bg-purple-500/10 px-2 py-0.5 rounded-full text-[10px]">🔒 잠금</span>;
                } else if (u.status === "withdrawn") {
                  statusBadge = <span className="text-zinc-400 font-bold bg-zinc-500/10 px-2 py-0.5 rounded-full text-[10px]">⚫ 탈퇴</span>;
                }

                return (
                  <tr 
                    key={u.id} 
                    className="hover:bg-zinc-50/50 dark:hover:bg-[#21262d]/25 transition-colors cursor-pointer"
                    onClick={() => navigateToUser(u.id)}
                  >
                    <td className="px-5 py-3">
                      <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-[#30363d] overflow-hidden flex items-center justify-center">
                        {hasAvatar ? (
                          <img src={u.avatarImg} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="font-bold text-zinc-500 dark:text-zinc-300">{u.name ? u.name[0] : "?"}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 font-mono text-[11px] text-zinc-400">{u.id}</td>
                    <td className="px-5 py-3 font-bold text-zinc-800 dark:text-zinc-200">{u.name || "플레이터"}</td>
                    <td className="px-5 py-3 text-zinc-500 dark:text-zinc-400">{u.email || "-"}</td>
                    <td className="px-5 py-3 text-zinc-500 dark:text-zinc-400">{dateJoin}</td>
                    <td className="px-5 py-3 text-zinc-500 dark:text-zinc-400">{lastLogin}</td>
                    <td className="px-5 py-3">{statusBadge}</td>
                    <td className="px-5 py-3 text-center font-bold text-red-500 bg-red-500/5">{u.reportCount || 0}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
