import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import { collection, query, onSnapshot, doc, updateDoc, deleteDoc, addDoc } from "firebase/firestore";
import { Search, Trash, RotateCcw, AlertTriangle } from "lucide-react";

export default function Comments({ navigateToUser }) {
  const [comments, setComments] = useState([]);
  const [filteredComments, setFilteredComments] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search filter
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // "all", "hidden"

  // Action state
  const [targetComment, setTargetComment] = useState(null);
  const [actionType, setActionType] = useState(null); // 'delete', 'restore'
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "comments"));
    const unsubscribe = onSnapshot(q, (snap) => {
      setComments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Filter
  useEffect(() => {
    let result = [...comments];

    if (statusFilter === "hidden") {
      result = result.filter(c => c.isHidden === true);
    }

    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(c => 
        (c.text && c.text.toLowerCase().includes(q)) ||
        (c.author && c.author.toLowerCase().includes(q)) ||
        (c.postId && c.postId.toLowerCase().includes(q))
      );
    }

    setFilteredComments(result);
  }, [comments, searchQuery, statusFilter]);

  async function handleActionSubmit(e) {
    e.preventDefault();
    if (!reason.trim()) {
      alert("사유를 필히 적어주세요.");
      return;
    }

    setIsSubmitting(true);
    try {
      let actionLabel = "";
      const commentRef = doc(db, "comments", targetComment.id);

      if (actionType === "delete") {
        actionLabel = "댓글 숨김/삭제";
        await updateDoc(commentRef, { isHidden: true });
      } else if (actionType === "restore") {
        actionLabel = "댓글 복구";
        await updateDoc(commentRef, { isHidden: false });
      }

      // Add to audit logs
      await addDoc(collection(db, "adminLogs"), {
        action: actionLabel,
        detail: `댓글 ID: ${targetComment.id} | 본문: ${targetComment.text.slice(0, 20)}... | 사유: ${reason}`,
        targetId: targetComment.id,
        createdAt: new Date().toISOString()
      });

      alert(`${actionLabel} 처리가 완료되었습니다.`);
      setActionType(null);
      setTargetComment(null);
      setReason("");
    } catch (err) {
      alert("댓글 처리 오류: " + err.message);
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
      {/* 1. Filters Header */}
      <div className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] p-5 rounded-xl shadow-sm flex flex-wrap gap-4 items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <Search className="w-4 h-4 text-zinc-400" />
            </span>
            <input
              type="text"
              placeholder="댓글 내용, 작성자, 게시글ID 검색..."
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
            <option value="all">전체 댓글</option>
            <option value="hidden">숨김 처리됨</option>
          </select>
        </div>

        <span className="text-xs font-semibold text-zinc-400">
          댓글 수: <strong className="text-zinc-700 dark:text-white">{filteredComments.length}</strong> 개
        </span>
      </div>

      {/* 2. Comments list table */}
      <div className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-zinc-50 dark:bg-[#161b22]/30 border-b border-zinc-200 dark:border-[#30363d] text-zinc-400 uppercase tracking-wider font-semibold">
                <th className="px-5 py-3">댓글 ID</th>
                <th className="px-5 py-3">본문 내용</th>
                <th className="px-5 py-3">작성자</th>
                <th className="px-5 py-3">게시글 ID</th>
                <th className="px-5 py-3">등록일</th>
                <th className="px-5 py-3">상태</th>
                <th className="px-5 py-3 text-center">동작</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-[#30363d]">
              {filteredComments.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-5 py-12 text-center text-zinc-400">
                    일치하는 댓글 정보가 없습니다.
                  </td>
                </tr>
              ) : (
                filteredComments.map((c) => {
                  const dateStr = c.createdAt ? c.createdAt.split("T")[0] : "-";
                  let statusBadge = <span className="text-emerald-500 font-bold bg-emerald-500/10 px-2 py-0.5 rounded text-[10px]">공개</span>;
                  if (c.isHidden) {
                    statusBadge = <span className="text-zinc-400 font-bold bg-zinc-500/10 px-2 py-0.5 rounded text-[10px]">숨김</span>;
                  }

                  return (
                    <tr key={c.id} className="hover:bg-zinc-50/50 dark:hover:bg-[#21262d]/25 transition-colors">
                      <td className="px-5 py-3 font-mono text-[11px] text-zinc-400">{c.id}</td>
                      <td className="px-5 py-3 font-medium text-zinc-800 dark:text-zinc-200 max-w-xs truncate">{c.text}</td>
                      <td className="px-5 py-3 font-bold text-brand-green-500 hover:underline cursor-pointer" onClick={() => navigateToUser(c.userId)}>
                        {c.author || "익명"}
                      </td>
                      <td className="px-5 py-3 font-mono text-[11px] text-zinc-400">{c.postId}</td>
                      <td className="px-5 py-3 text-zinc-500 dark:text-zinc-400">{dateStr}</td>
                      <td className="px-5 py-3">{statusBadge}</td>
                      <td className="px-5 py-3 text-center">
                        {c.isHidden ? (
                          <button 
                            onClick={() => { setTargetComment(c); setActionType("restore"); }}
                            className="p-1 rounded text-emerald-500 hover:bg-emerald-500/10 flex items-center gap-1 mx-auto"
                            title="복구"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        ) : (
                          <button 
                            onClick={() => { setTargetComment(c); setActionType("delete"); }}
                            className="p-1 rounded text-red-500 hover:bg-red-500/10 flex items-center gap-1 mx-auto"
                            title="삭제"
                          >
                            <Trash className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Action reason modal */}
      {actionType && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form onSubmit={handleActionSubmit} className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] p-6 rounded-xl w-full max-w-[400px] shadow-2xl space-y-4">
            <h4 className="font-extrabold text-sm text-red-500 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              댓글 행정 조치 확인
            </h4>
            <p className="text-xs text-zinc-400 leading-relaxed">
              댓글에 행정 행위를 취하는 사유를 입력해 주세요. 감사 로그(Audit Logs)에 영구 보존됩니다.
            </p>
            <textarea
              required
              rows="3"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="예: 타인 모욕 및 비방 유도성 댓글에 따른 삭제 조치..."
              className="w-full p-3 border border-zinc-350 dark:border-[#30363d] bg-zinc-50 dark:bg-[#0e1117] rounded-lg text-xs focus:outline-none"
            ></textarea>
            <div className="flex justify-end gap-2 text-xs">
              <button type="button" onClick={() => { setActionType(null); setTargetComment(null); }} className="px-4 py-2 border border-zinc-300 dark:border-[#30363d] rounded-lg font-bold text-zinc-600 dark:text-zinc-400">
                취소
              </button>
              <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-red-500 text-white rounded-lg font-bold hover:bg-red-700">
                {isSubmitting ? "처리 중..." : "확인 및 실행"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
