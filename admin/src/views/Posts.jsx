import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import { collection, query, onSnapshot, doc, updateDoc, deleteDoc, addDoc } from "firebase/firestore";
import { Search, Eye, EyeOff, Pin, PinOff, Trash, AlertTriangle, AlertCircle } from "lucide-react";

export default function Posts({ navigateToUser }) {
  const [posts, setPosts] = useState([]);
  const [filteredPosts, setFilteredPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState("title"); // "title", "uid", "author", "postId"
  const [statusFilter, setStatusFilter] = useState("all"); // "all", "hidden", "reported"

  // Action states
  const [targetPost, setTargetPost] = useState(null);
  const [actionType, setActionType] = useState(null); // 'hide', 'restore', 'delete', 'pin', 'unpin'
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // Listen to both posts and community_posts if needed.
    // For simplicity, we can listen to the "posts" collection which holds the recipes and posts
    const q = query(collection(db, "posts"));
    const unsubscribe = onSnapshot(q, (snap) => {
      const allPosts = snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
      }));
      setPosts(allPosts);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Filter Logic
  useEffect(() => {
    let result = [...posts];

    // Status filter
    if (statusFilter === "hidden") {
      result = result.filter(p => p.isHidden === true);
    } else if (statusFilter === "reported") {
      result = result.filter(p => (p.reportCount || 0) > 0);
    }

    // Search query filter
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase().trim();
      if (searchType === "title") {
        result = result.filter(p => p.title && p.title.toLowerCase().includes(q));
      } else if (searchType === "uid") {
        result = result.filter(p => p.userId && p.userId.toLowerCase().includes(q));
      } else if (searchType === "author") {
        result = result.filter(p => p.author && p.author.toLowerCase().includes(q));
      } else if (searchType === "postId") {
        result = result.filter(p => p.id && p.id.toLowerCase().includes(q));
      }
    }

    setFilteredPosts(result);
  }, [posts, searchQuery, searchType, statusFilter]);

  // Handle operations
  async function handleActionSubmit(e) {
    e.preventDefault();
    if (!reason.trim()) {
      alert("작업 처리 사유를 기입해 주세요.");
      return;
    }

    setIsSubmitting(true);
    try {
      let actionLabel = "";
      const postRef = doc(db, "posts", targetPost.id);

      if (actionType === "hide") {
        actionLabel = "게시물 숨김";
        await updateDoc(postRef, { isHidden: true });
      } else if (actionType === "restore") {
        actionLabel = "게시물 복구";
        await updateDoc(postRef, { isHidden: false });
      } else if (actionType === "delete") {
        actionLabel = "게시물 완전 삭제";
        await deleteDoc(postRef);
      } else if (actionType === "pin") {
        actionLabel = "게시물 고정";
        await updateDoc(postRef, { isPinned: true });
      } else if (actionType === "unpin") {
        actionLabel = "게시물 고정 해제";
        await updateDoc(postRef, { isPinned: false });
      }

      // Audit Log write
      await addDoc(collection(db, "adminLogs"), {
        action: actionLabel,
        detail: `게시물 ID: ${targetPost.id} | 제목: ${targetPost.title} | 사유: ${reason}`,
        targetId: targetPost.id,
        createdAt: new Date().toISOString()
      });

      alert(`${actionLabel} 처리가 성공적으로 실행되었습니다.`);
      setActionType(null);
      setTargetPost(null);
      setReason("");
    } catch (err) {
      alert("게시글 처리 오류: " + err.message);
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
      {/* 1. Filter Header */}
      <div className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] p-5 rounded-xl shadow-sm flex flex-wrap gap-4 items-center justify-between">
        <div className="flex items-center gap-3">
          <select 
            value={searchType}
            onChange={(e) => setSearchType(e.target.value)}
            className="px-3 py-2 rounded-lg border border-zinc-300 dark:border-[#30363d] bg-white dark:bg-[#0e1117] text-xs font-semibold text-zinc-700 dark:text-zinc-300 focus:outline-none"
          >
            <option value="title">제목</option>
            <option value="uid">UID</option>
            <option value="author">작성자</option>
            <option value="postId">게시글 ID</option>
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
            <option value="all">전체 목록</option>
            <option value="hidden">숨김 처리됨</option>
            <option value="reported">신고 접수됨</option>
          </select>
        </div>

        <span className="text-xs font-semibold text-zinc-400">
          게시글 수: <strong className="text-zinc-700 dark:text-white">{filteredPosts.length}</strong> 개
        </span>
      </div>

      {/* 2. Posts Table */}
      <div className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-zinc-50 dark:bg-[#161b22]/30 border-b border-zinc-200 dark:border-[#30363d] text-zinc-400 uppercase tracking-wider font-semibold">
                <th className="px-5 py-3">게시글 ID</th>
                <th className="px-5 py-3">제목</th>
                <th className="px-5 py-3">작성자</th>
                <th className="px-5 py-3">조회수</th>
                <th className="px-5 py-3">좋아요</th>
                <th className="px-5 py-3 text-center">신고</th>
                <th className="px-5 py-3">상태</th>
                <th className="px-5 py-3 text-center">동작</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-[#30363d]">
              {filteredPosts.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-5 py-12 text-center text-zinc-400">
                    일치하는 게시글 정보가 없습니다.
                  </td>
                </tr>
              ) : (
                filteredPosts.map((p) => {
                  const reportsCount = p.reportCount || 0;
                  
                  // Status layout
                  let statusBadge = <span className="text-emerald-500 font-bold bg-emerald-500/10 px-2 py-0.5 rounded text-[10px]">공개</span>;
                  if (p.isHidden) {
                    statusBadge = <span className="text-zinc-400 font-bold bg-zinc-500/10 px-2 py-0.5 rounded text-[10px]">숨김</span>;
                  }

                  return (
                    <tr key={p.id} className="hover:bg-zinc-50/50 dark:hover:bg-[#21262d]/25 transition-colors">
                      <td className="px-5 py-3 font-mono text-[11px] text-zinc-400">{p.id}</td>
                      <td className="px-5 py-3 font-bold text-zinc-800 dark:text-zinc-200">
                        <div className="flex items-center gap-2">
                          {p.isPinned && <Pin className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
                          <span className="truncate max-w-[200px]">{p.title}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 font-medium text-brand-green-500 hover:underline cursor-pointer" onClick={() => navigateToUser(p.userId)}>
                        {p.author || "익명"}
                      </td>
                      <td className="px-5 py-3 text-zinc-500 dark:text-zinc-400">{p.viewCount || 0}</td>
                      <td className="px-5 py-3 text-zinc-500 dark:text-zinc-400">{p.likeCount || 0}</td>
                      <td className={`px-5 py-3 text-center font-bold ${reportsCount > 0 ? "text-red-500 bg-red-500/5" : "text-zinc-400"}`}>
                        {reportsCount}
                      </td>
                      <td className="px-5 py-3">{statusBadge}</td>
                      <td className="px-5 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {p.isHidden ? (
                            <button 
                              onClick={() => { setTargetPost(p); setActionType("restore"); }}
                              className="p-1 rounded text-emerald-500 hover:bg-emerald-500/10"
                              title="보이기"
                            >
                              <Eye className="w-4.5 h-4.5" />
                            </button>
                          ) : (
                            <button 
                              onClick={() => { setTargetPost(p); setActionType("hide"); }}
                              className="p-1 rounded text-zinc-500 hover:bg-zinc-500/10"
                              title="숨기기"
                            >
                              <EyeOff className="w-4.5 h-4.5" />
                            </button>
                          )}
                          {p.isPinned ? (
                            <button 
                              onClick={() => { setTargetPost(p); setActionType("unpin"); }}
                              className="p-1 rounded text-amber-500 hover:bg-amber-500/10"
                              title="고정 해제"
                            >
                              <PinOff className="w-4.5 h-4.5" />
                            </button>
                          ) : (
                            <button 
                              onClick={() => { setTargetPost(p); setActionType("pin"); }}
                              className="p-1 rounded text-zinc-400 hover:bg-zinc-500/10"
                              title="고정"
                            >
                              <Pin className="w-4.5 h-4.5" />
                            </button>
                          )}
                          <button 
                            onClick={() => { setTargetPost(p); setActionType("delete"); }}
                            className="p-1 rounded text-red-500 hover:bg-red-500/10"
                            title="삭제"
                          >
                            <Trash className="w-4.5 h-4.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Action modal */}
      {actionType && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form onSubmit={handleActionSubmit} className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] p-6 rounded-xl w-full max-w-[400px] shadow-2xl space-y-4">
            <h4 className="font-extrabold text-sm text-red-500 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              게시물 행정 조치 확인
            </h4>
            <p className="text-xs text-zinc-400 leading-relaxed">
              선택한 조치를 실행하는 이유를 상세히 적어주세요. 감사 로그(Audit Logs)에 기록됩니다.
            </p>
            <textarea
              required
              rows="3"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="예: 신고가 누적되어 부적절한 광고 유도 글로 판별됨..."
              className="w-full p-3 border border-zinc-350 dark:border-[#30363d] bg-zinc-50 dark:bg-[#0e1117] rounded-lg text-xs focus:outline-none"
            ></textarea>
            <div className="flex justify-end gap-2 text-xs">
              <button type="button" onClick={() => { setActionType(null); setTargetPost(null); }} className="px-4 py-2 border border-zinc-300 dark:border-[#30363d] rounded-lg font-bold text-zinc-600 dark:text-zinc-400">
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
