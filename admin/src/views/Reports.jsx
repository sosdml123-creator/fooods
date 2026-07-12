import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import { collection, query, onSnapshot, doc, updateDoc, addDoc } from "firebase/firestore";
import { Search, Eye, AlertTriangle, CheckCircle, Trash } from "lucide-react";

export default function Reports({ navigateToUser }) {
  const [reports, setReports] = useState([]);
  const [filteredReports, setFilteredReports] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Selected report detail modal state
  const [selectedReport, setSelectedReport] = useState(null);
  const [actionType, setActionType] = useState(null); // 'delete_post', 'delete_comment', 'dismiss', 'suspend_7', 'suspend_30', 'suspend_perm'
  const [actionReason, setActionReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "reports"));
    const unsubscribe = onSnapshot(q, (snap) => {
      const allReports = snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
      }));
      setReports(allReports);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Filter logic
  useEffect(() => {
    let result = [...reports];

    // Status filter
    if (statusFilter !== "all") {
      result = result.filter(r => r.status === statusFilter);
    }

    // Query filter
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(r => 
        (r.reporter && r.reporter.toLowerCase().includes(q)) ||
        (r.author && r.author.toLowerCase().includes(q)) ||
        (r.reason && r.reason.toLowerCase().includes(q)) ||
        (r.id && r.id.toLowerCase().includes(q))
      );
    }

    setFilteredReports(result);
  }, [reports, searchQuery, statusFilter]);

  // Handle moderation actions
  async function handleModerationSubmit(e) {
    e.preventDefault();
    if (!actionReason.trim()) {
      alert("처리 사유를 필수 입력해 주세요.");
      return;
    }

    setIsSubmitting(true);
    try {
      const batchUpdate = {};
      let actionLabel = "";

      if (actionType === "delete_post") {
        actionLabel = "신고된 게시글 삭제";
        // Mark target post hidden in firestore
        if (selectedReport.targetId) {
          await updateDoc(doc(db, "posts", selectedReport.targetId), {
            isHidden: true,
            deletedByAdmin: true,
            deletedReason: actionReason
          });
        }
      } else if (actionType === "delete_comment") {
        actionLabel = "신고된 댓글 삭제";
        if (selectedReport.targetId) {
          await updateDoc(doc(db, "comments", selectedReport.targetId), {
            isHidden: true,
            deletedByAdmin: true,
            deletedReason: actionReason
          });
        }
      } else if (actionType === "dismiss") {
        actionLabel = "신고 기각";
      }

      // Update report status
      await updateDoc(doc(db, "reports", selectedReport.id), {
        status: actionType === "dismiss" ? "rejected" : "completed",
        resolvedAt: new Date().toISOString(),
        resolvedAction: actionLabel,
        resolvedReason: actionReason
      });

      // Write to audit log
      await addDoc(collection(db, "adminLogs"), {
        action: actionLabel,
        detail: `신고 ID: ${selectedReport.id} | 처리 결과: ${actionLabel} | 사유: ${actionReason}`,
        targetId: selectedReport.targetId,
        createdAt: new Date().toISOString()
      });

      alert("신고 처리가 성공적으로 반영되었습니다.");
      setActionType(null);
      setSelectedReport(null);
      setActionReason("");
    } catch (err) {
      alert("신고 처리 오류: " + err.message);
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
      {/* Search Header Bar */}
      <div className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] p-5 rounded-xl shadow-sm flex flex-wrap gap-4 items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <Search className="w-4 h-4 text-zinc-400" />
            </span>
            <input
              type="text"
              placeholder="신고자, 대상회원, 사유 검색..."
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
            <option value="waiting">대기</option>
            <option value="completed">처리완료</option>
            <option value="rejected">기각</option>
          </select>
        </div>

        <span className="text-xs font-semibold text-zinc-400">
          접수된 신고: <strong className="text-zinc-700 dark:text-white">{filteredReports.length}</strong> 건
        </span>
      </div>

      {/* Reports Table Grid */}
      <div className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-zinc-50 dark:bg-[#161b22]/30 border-b border-zinc-200 dark:border-[#30363d] text-zinc-400 uppercase tracking-wider font-semibold">
                <th className="px-5 py-3">신고번호</th>
                <th className="px-5 py-3">신고일</th>
                <th className="px-5 py-3">신고자</th>
                <th className="px-5 py-3">대상회원</th>
                <th className="px-5 py-3">구분</th>
                <th className="px-5 py-3">사유</th>
                <th className="px-5 py-3">상태</th>
                <th className="px-5 py-3 text-center">동작</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-[#30363d]">
              {filteredReports.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-5 py-12 text-center text-zinc-400">
                    접수된 신고 내역이 존재하지 않습니다.
                  </td>
                </tr>
              ) : (
                filteredReports.map((rep) => {
                  const dateStr = rep.createdAt ? rep.createdAt.split("T")[0] : "-";
                  
                  // Status badge format
                  let statusBadge = <span className="text-red-500 font-bold bg-red-500/10 px-2.5 py-0.5 rounded-full text-[10px]">대기중</span>;
                  if (rep.status === "completed") {
                    statusBadge = <span className="text-emerald-500 font-bold bg-emerald-500/10 px-2.5 py-0.5 rounded-full text-[10px]">처리완료</span>;
                  } else if (rep.status === "rejected") {
                    statusBadge = <span className="text-zinc-400 font-bold bg-zinc-500/10 px-2.5 py-0.5 rounded-full text-[10px]">기각</span>;
                  }

                  return (
                    <tr key={rep.id} className="hover:bg-zinc-50/50 dark:hover:bg-[#21262d]/25 transition-colors">
                      <td className="px-5 py-3 font-mono text-[11px] text-zinc-400">{rep.id ? rep.id.slice(0, 8) : "-"}</td>
                      <td className="px-5 py-3 text-zinc-500 dark:text-zinc-400">{dateStr}</td>
                      <td className="px-5 py-3 font-bold text-zinc-800 dark:text-zinc-200">{rep.reporter || "익명"}</td>
                      <td className="px-5 py-3 font-medium text-zinc-700 dark:text-zinc-300">{rep.author || "알 수 없음"}</td>
                      <td className="px-5 py-3 font-semibold text-zinc-500 dark:text-zinc-400">{rep.targetType === "post" ? "게시물" : "댓글"}</td>
                      <td className="px-5 py-3 font-semibold text-zinc-800 dark:text-zinc-200">{rep.reason || "기타"}</td>
                      <td className="px-5 py-3">{statusBadge}</td>
                      <td className="px-5 py-3 text-center">
                        <button 
                          onClick={() => setSelectedReport(rep)}
                          className="px-3 py-1 rounded bg-zinc-100 hover:bg-zinc-200 dark:bg-[#30363d] dark:hover:bg-[#21262d] text-zinc-700 dark:text-white font-bold flex items-center gap-1.5 mx-auto"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          검토
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

      {/* Report detailed modal panel */}
      {selectedReport && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] rounded-xl w-full max-w-[500px] shadow-2xl overflow-hidden flex flex-col">
            <div className="p-5 border-b border-zinc-200 dark:border-[#30363d] bg-zinc-50 dark:bg-[#161b22]/50 flex justify-between items-center">
              <h4 className="font-extrabold text-sm text-zinc-800 dark:text-white">신고 검토 상세 정보</h4>
              <button onClick={() => setSelectedReport(null)} className="text-zinc-400 hover:text-white text-base font-bold">×</button>
            </div>
            
            <div className="p-5 space-y-4 overflow-y-auto max-h-[400px] custom-scrollbar text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-zinc-400 font-semibold">신고자</span>
                  <p className="font-bold text-zinc-800 dark:text-zinc-200 mt-1">{selectedReport.reporter || "익명"}</p>
                </div>
                <div>
                  <span className="text-zinc-400 font-semibold">피신고자(작성자)</span>
                  <p className="font-bold text-zinc-800 dark:text-zinc-200 mt-1">{selectedReport.author || "알 수 없음"}</p>
                </div>
                <div>
                  <span className="text-zinc-400 font-semibold">신고 사유</span>
                  <p className="font-bold text-red-500 mt-1">{selectedReport.reason}</p>
                </div>
                <div>
                  <span className="text-zinc-400 font-semibold">대상 유형</span>
                  <p className="font-bold text-zinc-800 dark:text-zinc-200 mt-1">{selectedReport.targetType === "post" ? "게시글" : "댓글"}</p>
                </div>
              </div>

              <div>
                <span className="text-zinc-400 font-semibold">신고 상세 설명</span>
                <p className="mt-1.5 p-3 rounded-lg bg-zinc-50 dark:bg-[#0e1117]/60 border border-zinc-200 dark:border-[#30363d] text-zinc-800 dark:text-zinc-300 leading-relaxed font-mono">
                  {selectedReport.text || "별도의 추가 설명이 없습니다."}
                </p>
              </div>

              {/* Action operations controls */}
              <div className="border-t border-zinc-150 dark:border-[#30363d] pt-4 space-y-3">
                <span className="text-zinc-400 font-semibold">처리 행정 행위 선택</span>
                <div className="grid grid-cols-3 gap-2">
                  {selectedReport.targetType === "post" ? (
                    <button onClick={() => setActionType("delete_post")} className="flex items-center justify-center gap-1.5 p-2 rounded bg-red-500/10 text-red-500 border border-red-500/20 font-bold hover:bg-red-500/20">
                      <Trash className="w-3.5 h-3.5" />
                      글 삭제
                    </button>
                  ) : (
                    <button onClick={() => setActionType("delete_comment")} className="flex items-center justify-center gap-1.5 p-2 rounded bg-red-500/10 text-red-500 border border-red-500/20 font-bold hover:bg-red-500/20">
                      <Trash className="w-3.5 h-3.5" />
                      댓글 삭제
                    </button>
                  )}
                  <button onClick={() => setActionType("dismiss")} className="flex items-center justify-center gap-1.5 p-2 rounded bg-zinc-100 dark:bg-[#30363d] text-zinc-700 dark:text-white font-bold hover:bg-zinc-200 dark:hover:bg-[#21262d]">
                    <CheckCircle className="w-3.5 h-3.5" />
                    기각(무시)
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {actionType && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form onSubmit={handleModerationSubmit} className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] p-6 rounded-xl w-full max-w-[400px] shadow-2xl space-y-4">
            <h4 className="font-extrabold text-sm text-red-500 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              신고 처리 실행 의사 확인
            </h4>
            <p className="text-xs text-zinc-400 leading-relaxed">
              본 행정 조치는 Firestore 데이터베이스에 영구 반영되며 관리 행정 로그에 기록됩니다. 실행 사유를 필히 기입해 주세요.
            </p>
            <textarea
              required
              rows="3"
              value={actionReason}
              onChange={(e) => setActionReason(e.target.value)}
              placeholder="예: 욕설 및 타인 비방성 문구 노출에 의한 게시글 삭제..."
              className="w-full p-3 border border-zinc-350 dark:border-[#30363d] bg-zinc-50 dark:bg-[#0e1117] rounded-lg text-xs focus:outline-none"
            ></textarea>
            <div className="flex justify-end gap-2 text-xs">
              <button type="button" onClick={() => setActionType(null)} className="px-4 py-2 border border-zinc-300 dark:border-[#30363d] rounded-lg font-bold text-zinc-600 dark:text-zinc-400">
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
