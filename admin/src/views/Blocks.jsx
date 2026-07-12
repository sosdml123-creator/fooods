import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import { collection, query, onSnapshot, doc, deleteDoc, addDoc } from "firebase/firestore";
import { Search, Ban, Unlock, AlertTriangle } from "lucide-react";

export default function Blocks() {
  const [blocks, setBlocks] = useState([]);
  const [filteredBlocks, setFilteredBlocks] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");

  // Action states
  const [targetBlock, setTargetBlock] = useState(null);
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "blocks"));
    const unsubscribe = onSnapshot(q, (snap) => {
      setBlocks(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Filter
  useEffect(() => {
    let result = [...blocks];

    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(b => 
        (b.blockerName && b.blockerName.toLowerCase().includes(q)) ||
        (b.blockedName && b.blockedName.toLowerCase().includes(q)) ||
        (b.blockerId && b.blockerId.toLowerCase().includes(q)) ||
        (b.blockedId && b.blockedId.toLowerCase().includes(q))
      );
    }

    setFilteredBlocks(result);
  }, [blocks, searchQuery]);

  async function handleUnblockSubmit(e) {
    e.preventDefault();
    if (!reason.trim()) {
      alert("해제 사유를 적어주세요.");
      return;
    }

    setIsSubmitting(true);
    try {
      await deleteDoc(doc(db, "blocks", targetBlock.id));

      // Audit Log write
      await addDoc(collection(db, "adminLogs"), {
        action: "차단 관계 강제 해제",
        detail: `차단자: ${targetBlock.blockerName || targetBlock.blockerId} -> 차단대상: ${targetBlock.blockedName || targetBlock.blockedId} | 사유: ${reason}`,
        targetId: targetBlock.id,
        createdAt: new Date().toISOString()
      });

      alert("차단 관계가 강제 해제되었습니다.");
      setTargetBlock(null);
      setReason("");
    } catch (err) {
      alert("차단 해제 오류: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-brand-green-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Header Filters */}
      <div className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] p-5 rounded-xl shadow-sm flex flex-wrap gap-4 items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <Search className="w-4 h-4 text-zinc-400" />
            </span>
            <input
              type="text"
              placeholder="차단자명, 차단대상명 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-zinc-300 dark:border-[#30363d] bg-white dark:bg-[#0e1117] text-xs text-zinc-800 dark:text-zinc-200 focus:outline-none"
            />
          </div>
        </div>

        <span className="text-xs font-semibold text-zinc-400">
          차단 관계: <strong className="text-zinc-700 dark:text-white">{filteredBlocks.length}</strong> 쌍
        </span>
      </div>

      {/* 2. Blocks Table */}
      <div className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-zinc-50 dark:bg-[#161b22]/30 border-b border-zinc-200 dark:border-[#30363d] text-zinc-400 uppercase tracking-wider font-semibold">
                <th className="px-5 py-3">차단자 (Blocker)</th>
                <th className="px-5 py-3">차단자 UID</th>
                <th className="px-5 py-3">차단 대상 (Blocked User)</th>
                <th className="px-5 py-3">대상 UID</th>
                <th className="px-5 py-3">차단일시</th>
                <th className="px-5 py-3 text-center">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-[#30363d]">
              {filteredBlocks.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-5 py-12 text-center text-zinc-400">
                    등록된 차단 관계 정보가 없습니다.
                  </td>
                </tr>
              ) : (
                filteredBlocks.map((b) => {
                  const dateStr = b.createdAt ? b.createdAt.replace("T", " ").slice(0, 16) : "-";
                  
                  return (
                    <tr key={b.id} className="hover:bg-zinc-50/50 dark:hover:bg-[#21262d]/25 transition-colors">
                      <td className="px-5 py-3 font-bold text-zinc-800 dark:text-zinc-200">{b.blockerName || "플레이터 A"}</td>
                      <td className="px-5 py-3 font-mono text-[11px] text-zinc-400">{b.blockerId}</td>
                      <td className="px-5 py-3 font-bold text-zinc-800 dark:text-zinc-200">{b.blockedName || "플레이터 B"}</td>
                      <td className="px-5 py-3 font-mono text-[11px] text-zinc-400">{b.blockedId}</td>
                      <td className="px-5 py-3 text-zinc-500 dark:text-zinc-400">{dateStr}</td>
                      <td className="px-5 py-3 text-center">
                        <button 
                          onClick={() => setTargetBlock(b)}
                          className="px-3 py-1 rounded bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 font-bold flex items-center gap-1 mx-auto"
                          title="차단 강제 해제"
                        >
                          <Unlock className="w-3.5 h-3.5" />
                          해제
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation Modal */}
      {targetBlock && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form onSubmit={handleUnblockSubmit} className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] p-6 rounded-xl w-full max-w-[400px] shadow-2xl space-y-4">
            <h4 className="font-extrabold text-sm text-red-500 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              차단 해제 의사 확인
            </h4>
            <p className="text-xs text-zinc-400 leading-relaxed">
              사용자 간의 차단 관계를 강제로 해제하시겠습니까? 사유를 적어주세요.
            </p>
            <textarea
              required
              rows="3"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="예: CS 접수에 따른 오해 불식 및 쌍방 합의 차단 해제..."
              className="w-full p-3 border border-zinc-350 dark:border-[#30363d] bg-zinc-50 dark:bg-[#0e1117] rounded-lg text-xs focus:outline-none"
            ></textarea>
            <div className="flex justify-end gap-2 text-xs">
              <button type="button" onClick={() => { setTargetBlock(null); setReason(""); }} className="px-4 py-2 border border-zinc-300 dark:border-[#30363d] rounded-lg font-bold text-zinc-600 dark:text-zinc-400">
                취소
              </button>
              <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-red-500 text-white rounded-lg font-bold hover:bg-red-700">
                {isSubmitting ? "해제 중..." : "확인 및 실행"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
