import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import { collection, query, onSnapshot, doc, getDoc, addDoc, updateDoc, deleteDoc, writeBatch } from "firebase/firestore";
import { FileText, Save, Plus, Edit2, Trash, AlertTriangle, Pin, PinOff } from "lucide-react";

export default function Notices() {
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isPinned, setIsPinned] = useState(false);
  const [isPopup, setIsPopup] = useState(false);
  const [isImportant, setIsImportant] = useState(false);
  const [publishDate, setPublishDate] = useState("");

  // Deletion confirm modal
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "notices"));
    const unsubscribe = onSnapshot(q, (snap) => {
      setNotices(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => {
      console.error("Notices listener error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  function handleStartCreate() {
    setIsEditing(true);
    setEditingId(null);
    setTitle("");
    setContent("");
    setIsPinned(false);
    setIsPopup(false);
    setIsImportant(false);
    setPublishDate(new Date().toISOString().slice(0, 16));
  }

  function handleStartEdit(notice) {
    setIsEditing(true);
    setEditingId(notice.id);
    setTitle(notice.title);
    setContent(notice.content);
    setIsPinned(notice.isPinned || false);
    setIsPopup(notice.isPopup || false);
    setIsImportant(notice.isImportant || false);
    setPublishDate(notice.publishDate || new Date().toISOString().slice(0, 16));
  }

  async function handleSaveNotice(e) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      alert("제목과 내용을 입력해 주세요.");
      return;
    }

    try {
      // If setting as pinned, we must unpin other notices first (per specifications)
      if (isPinned) {
        const batch = writeBatch(db);
        const otherPinned = notices.filter(n => n.isPinned && n.id !== editingId);
        otherPinned.forEach(notice => {
          batch.update(doc(db, "notices", notice.id), { isPinned: false });
        });
        await batch.commit();
      }

      const payload = {
        title,
        content,
        isPinned,
        isPopup,
        isImportant,
        publishDate,
        createdAt: new Date().toISOString()
      };

      if (editingId) {
        // 1. Edit Notice document
        await updateDoc(doc(db, "notices", editingId), payload);

        // 2. Edit linked community_posts document if exists
        const noticeSnap = await getDoc(doc(db, "notices", editingId));
        const commPostId = noticeSnap.data()?.communityPostId;
        if (commPostId) {
          await updateDoc(doc(db, "community_posts", commPostId), {
            title: title,
            body: content,
            isPinned: isPinned,
          });
        }
        
        // Add audit logs
        await addDoc(collection(db, "adminLogs"), {
          action: "공지사항 수정",
          detail: `공지 ID: ${editingId} | 제목: ${title}`,
          targetId: editingId,
          createdAt: new Date().toISOString()
        });

        alert("공지가 성공적으로 수정되었습니다.");
      } else {
        // 1. Create linked community_posts document first
        const commPostRef = await addDoc(collection(db, "community_posts"), {
          title: title,
          body: content,
          category: "자유",
          author: "관리자",
          avatarImg: "/admin_logo.png",
          userId: "admin",
          isAnnouncement: true,
          isPinned: isPinned,
          timestamp: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          likeCount: 0,
          viewCount: 0,
          commentCount: 0,
          likedBy: [],
          scrappedBy: [],
        });

        // 2. Create Notice document referencing communityPostId
        const noticePayload = {
          ...payload,
          communityPostId: commPostRef.id
        };
        const docRef = await addDoc(collection(db, "notices"), noticePayload);
        
        // Add audit logs
        await addDoc(collection(db, "adminLogs"), {
          action: "공지사항 신규 작성",
          detail: `공지 ID: ${docRef.id} | 제목: ${title}`,
          targetId: docRef.id,
          createdAt: new Date().toISOString()
        });

        alert("공지가 새로 생성되었습니다.");
      }

      setIsEditing(false);
      setEditingId(null);
    } catch (err) {
      alert("공지 저장 실패: " + err.message);
    }
  }

  async function handleDeleteConfirm(e) {
    e.preventDefault();
    if (!deleteReason.trim()) {
      alert("삭제 사유를 기입해 주세요.");
      return;
    }

    setIsDeleting(true);
    try {
      // 1. Delete linked community_posts document if exists
      if (deleteTarget.communityPostId) {
        await deleteDoc(doc(db, "community_posts", deleteTarget.communityPostId));
      }

      // 2. Delete Notice document
      await deleteDoc(doc(db, "notices", deleteTarget.id));

      // Add audit logs
      await addDoc(collection(db, "adminLogs"), {
        action: "공지사항 삭제",
        detail: `공지 ID: ${deleteTarget.id} | 제목: ${deleteTarget.title} | 사유: ${deleteReason}`,
        targetId: deleteTarget.id,
        createdAt: new Date().toISOString()
      });

      alert("공지가 성공적으로 삭제되었습니다.");
      setDeleteTarget(null);
      setDeleteReason("");
    } catch (err) {
      alert("삭제 실패: " + err.message);
    } finally {
      setIsDeleting(false);
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
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left Columns: List of Notices */}
      <div className="lg:col-span-2 bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] p-5 rounded-xl shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-150 dark:border-[#30363d] pb-3">
          <h4 className="font-bold text-sm text-zinc-800 dark:text-white">공지사항 리스트</h4>
          <button 
            onClick={handleStartCreate}
            className="px-3 py-1.5 rounded-lg bg-brand-green-500 hover:bg-brand-green-700 text-white text-xs font-bold flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            공지 작성
          </button>
        </div>

        <div className="space-y-3">
          {notices.length === 0 ? (
            <p className="text-xs text-zinc-400 text-center py-10">등록된 공지가 없습니다.</p>
          ) : (
            notices.map(notice => (
              <div key={notice.id} className="p-4 rounded-xl border border-zinc-200 dark:border-[#30363d] bg-zinc-50 dark:bg-[#0e1117]/35 flex justify-between items-start">
                <div className="space-y-1 max-w-[80%]">
                  <div className="flex items-center gap-2 flex-wrap">
                    {notice.isPinned && (
                      <span className="bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded text-[9px] font-bold flex items-center gap-1">
                        <Pin className="w-3 h-3" />
                        상단고정
                      </span>
                    )}
                    {notice.isImportant && (
                      <span className="bg-red-500/10 text-red-500 px-2 py-0.5 rounded text-[9px] font-bold">중요</span>
                    )}
                    {notice.isPopup && (
                      <span className="bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded text-[9px] font-bold">팝업</span>
                    )}
                    <h5 className="font-bold text-xs text-zinc-800 dark:text-zinc-200">{notice.title}</h5>
                  </div>
                  <p className="text-xs text-zinc-400 font-mono line-clamp-2 leading-relaxed">{notice.content}</p>
                  <span className="text-[10px] text-zinc-400 block mt-2">ID: {notice.id} | 예약일시: {notice.publishDate ? notice.publishDate.replace("T", " ") : "-"}</span>
                </div>
                
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => handleStartEdit(notice)} className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800" title="수정">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => setDeleteTarget(notice)} className="p-1 rounded text-red-400 hover:text-red-300 hover:bg-red-950/20" title="삭제">
                    <Trash className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right Column: Edit/Create form */}
      <div className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] p-5 rounded-xl shadow-sm flex flex-col">
        <h4 className="font-bold text-sm text-zinc-800 dark:text-white border-b border-zinc-200 dark:border-[#30363d] pb-3 mb-4">
          {isEditing ? (editingId ? "공지사항 수정" : "공지사항 신규 작성") : "공지 상세 및 편집"}
        </h4>

        {isEditing ? (
          <form onSubmit={handleSaveNotice} className="flex-1 flex flex-col justify-between space-y-4 text-xs">
            <div className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <label className="font-semibold text-zinc-400">공지 제목</label>
                <input 
                  type="text" 
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="제목 입력"
                  className="p-2.5 rounded-lg border border-zinc-300 dark:border-[#30363d] bg-zinc-50 dark:bg-[#0e1117] text-zinc-800 dark:text-white focus:outline-none"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-semibold text-zinc-400">공지 내용</label>
                <textarea
                  rows="6"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="공지 세부 본문 내용 입력..."
                  className="p-2.5 rounded-lg border border-zinc-300 dark:border-[#30363d] bg-zinc-50 dark:bg-[#0e1117] text-zinc-800 dark:text-white focus:outline-none"
                  required
                ></textarea>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-semibold text-zinc-400">예약 발행 일시</label>
                <input 
                  type="datetime-local" 
                  value={publishDate}
                  onChange={(e) => setPublishDate(e.target.value)}
                  className="p-2.5 rounded-lg border border-zinc-300 dark:border-[#30363d] bg-zinc-50 dark:bg-[#0e1117] text-zinc-800 dark:text-white focus:outline-none"
                  required
                />
              </div>

              <div className="space-y-2 border-t border-zinc-150 dark:border-[#30363d] pt-3">
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-zinc-400">
                  <input type="checkbox" checked={isPinned} onChange={(e) => setIsPinned(e.target.checked)} className="w-3.5 h-3.5 rounded" />
                  상단 고정 공지 지정 (기존 고정 자동 해제)
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-zinc-400">
                  <input type="checkbox" checked={isImportant} onChange={(e) => setIsImportant(e.target.checked)} className="w-3.5 h-3.5 rounded" />
                  중요 공지사항 배지 부착
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-zinc-400">
                  <input type="checkbox" checked={isPopup} onChange={(e) => setIsPopup(e.target.checked)} className="w-3.5 h-3.5 rounded" />
                  로그인 팝업 공지 지정
                </label>
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <button type="button" onClick={() => setIsEditing(false)} className="flex-1 py-2.5 rounded-lg border border-zinc-300 dark:border-[#30363d] text-zinc-700 dark:text-zinc-400 font-bold">
                취소
              </button>
              <button type="submit" className="flex-1 py-2.5 rounded-lg bg-brand-green-500 hover:bg-brand-green-700 text-white font-bold flex items-center justify-center gap-1.5">
                <Save className="w-4 h-4" />
                저장
              </button>
            </div>
          </form>
        ) : (
          <p className="text-xs text-zinc-400 py-16 text-center">우측 상단 '공지 작성' 또는 목록의 '수정' 아이콘을 클릭하여 작성을 진행해 주세요.</p>
        )}
      </div>

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form onSubmit={handleDeleteConfirm} className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] p-6 rounded-xl w-full max-w-[400px] shadow-2xl space-y-4">
            <h4 className="font-extrabold text-sm text-red-500 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              공지사항 삭제 확인
            </h4>
            <p className="text-xs text-zinc-400 leading-relaxed">
              공지사항 '{deleteTarget.title}'을 완전히 제거하시겠습니까? 삭제 행정 사유를 적어주세요.
            </p>
            <textarea
              required
              rows="3"
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="예: 공지 기한 만료 및 부적절한 노출 요소를 포함하고 있는 내용 정정..."
              className="w-full p-3 border border-zinc-350 dark:border-[#30363d] bg-zinc-50 dark:bg-[#0e1117] rounded-lg text-xs focus:outline-none"
            ></textarea>
            <div className="flex justify-end gap-2 text-xs">
              <button type="button" onClick={() => { setDeleteTarget(null); setDeleteReason(""); }} className="px-4 py-2 border border-zinc-300 dark:border-[#30363d] rounded-lg font-bold text-zinc-600 dark:text-zinc-400">
                취소
              </button>
              <button type="submit" disabled={isDeleting} className="px-4 py-2 bg-red-500 text-white rounded-lg font-bold hover:bg-red-700">
                {isDeleting ? "삭제 처리 중..." : "확인 및 삭제"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
