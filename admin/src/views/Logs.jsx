import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import { collection, query, onSnapshot, orderBy } from "firebase/firestore";
import { Search, History } from "lucide-react";

export default function Logs() {
  const [logs, setLogs] = useState([]);
  const [filteredLogs, setFilteredLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    // Audit logs ordered by date
    const q = query(collection(db, "adminLogs"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snap) => {
      setLogs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Filter
  useEffect(() => {
    let result = [...logs];

    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(log => 
        (log.action && log.action.toLowerCase().includes(q)) ||
        (log.detail && log.detail.toLowerCase().includes(q)) ||
        (log.id && log.id.toLowerCase().includes(q))
      );
    }

    setFilteredLogs(result);
  }, [logs, searchQuery]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-brand-green-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search Filter Header */}
      <div className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] p-5 rounded-xl shadow-sm flex flex-wrap gap-4 items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <Search className="w-4 h-4 text-zinc-400" />
            </span>
            <input
              type="text"
              placeholder="액션 유형, 상세 정보 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-zinc-300 dark:border-[#30363d] bg-white dark:bg-[#0e1117] text-xs text-zinc-800 dark:text-zinc-200 focus:outline-none"
            />
          </div>
        </div>

        <span className="text-xs font-semibold text-zinc-400">
          기록된 활동 로그: <strong className="text-zinc-700 dark:text-white">{filteredLogs.length}</strong> 건
        </span>
      </div>

      {/* Logs Registry */}
      <div className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-zinc-50 dark:bg-[#161b22]/30 border-b border-zinc-200 dark:border-[#30363d] text-zinc-400 uppercase tracking-wider font-semibold">
                <th className="px-5 py-3">활동 일시</th>
                <th className="px-5 py-3">액션 유형</th>
                <th className="px-5 py-3">작업 상세 내용</th>
                <th className="px-5 py-3">연동 ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-[#30363d] font-mono">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-5 py-12 text-center text-zinc-400 font-sans">
                    등록된 행동 로그 정보가 없습니다.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const dateStr = log.createdAt ? log.createdAt.replace("T", " ").slice(0, 19) : "-";
                  
                  return (
                    <tr key={log.id} className="hover:bg-zinc-50/50 dark:hover:bg-[#21262d]/25 transition-colors">
                      <td className="px-5 py-3 text-zinc-500 dark:text-zinc-400">{dateStr}</td>
                      <td className="px-5 py-3 font-bold text-zinc-800 dark:text-zinc-200 font-sans">{log.action}</td>
                      <td className="px-5 py-3 text-zinc-500 dark:text-zinc-300 font-sans max-w-sm truncate">{log.detail}</td>
                      <td className="px-5 py-3 text-zinc-400 text-[11px]">{log.targetId || "-"}</td>
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
