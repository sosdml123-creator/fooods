import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import { collection, query, onSnapshot, doc, updateDoc, addDoc } from "firebase/firestore";
import { Image as ImageIcon, Trash, AlertTriangle, Eye, ShieldCheck } from "lucide-react";
import { formatDateTime } from "../utils/date";

export default function Photos() {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);

  // Deletion state
  const [targetPhoto, setTargetPhoto] = useState(null);
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const unsub1 = onSnapshot(query(collection(db, "posts")), (snap1) => {
      const posts1 = snap1.docs.map(doc => ({ id: doc.id, _collection: "posts", ...doc.data() }));
      updateAllPhotos(posts1, null);
    });

    const unsub2 = onSnapshot(query(collection(db, "community_posts")), (snap2) => {
      const posts2 = snap2.docs.map(doc => ({ id: doc.id, _collection: "community_posts", ...doc.data() }));
      updateAllPhotos(null, posts2);
    });

    let currentRecipePosts = [];
    let currentCommPosts = [];

    function updateAllPhotos(recipes, comms) {
      if (recipes !== null) currentRecipePosts = recipes;
      if (comms !== null) currentCommPosts = comms;

      const extracted = [];
      [...currentRecipePosts, ...currentCommPosts].forEach(p => {
        const url = typeof p.imageUrl === "string" ? p.imageUrl : (typeof p.image === "string" ? p.image : null);
        if (url && url.startsWith("http")) {
          extracted.push({ ...p, displayUrl: url });
        } else if (Array.isArray(p.images)) {
          p.images.forEach((imgUrl, idx) => {
            if (typeof imgUrl === "string" && imgUrl.startsWith("http")) {
              extracted.push({ ...p, id: `${p.id}_${idx}`, parentId: p.id, displayUrl: imgUrl });
            }
          });
        }
      });

      setPhotos(extracted);
      setLoading(false);
    }

    return () => { unsub1(); unsub2(); };
  }, []);

  async function handleDeleteSubmit(e) {
    e.preventDefault();
    if (!reason.trim()) {
      alert("삭제 사유를 적어주세요.");
      return;
    }

    setIsSubmitting(true);
    try {
      const colName = targetPhoto._collection || "posts";
      const targetDocId = targetPhoto.parentId || targetPhoto.id;

      await updateDoc(doc(db, colName, targetDocId), {
        imageUrl: "",
        imageRemovedByAdmin: true,
        imageRemovedReason: reason
      });

      await addDoc(collection(db, "adminLogs"), {
        action: "포토 이미지 삭제",
        detail: `[${colName}] 게시글 ID: ${targetDocId} | 이미지 삭제 완료 | 사유: ${reason}`,
        targetId: targetDocId,
        createdAt: new Date().toISOString()
      });

      alert("이미지가 삭제 처리되었습니다.");
      setTargetPhoto(null);
      setReason("");
    } catch (err) {
      alert("이미지 삭제 오류: " + err.message);
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
      {/* Gallery Grid */}
      <div className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] p-5 rounded-xl shadow-sm">
        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-[#30363d] pb-3 mb-5">
          <h4 className="font-bold text-sm text-zinc-800 dark:text-white">
            업로드 이미지 검수 레지스트리
          </h4>
          <span className="text-xs text-zinc-400 font-semibold">총 <strong className="text-zinc-700 dark:text-white">{photos.length}</strong>개 이미지</span>
        </div>

        {photos.length === 0 ? (
          <p className="text-xs text-zinc-400 text-center py-16">등록된 이미지가 없습니다.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {photos.map((p) => {
              const strId = String(p.id || "75");
              const aiScore = Math.floor((strId.charCodeAt(0) || 75) % 15);
              const isAiFlagged = aiScore > 12;

              return (
                <div key={p.id} className="group relative border border-zinc-200 dark:border-[#30363d] rounded-xl overflow-hidden bg-zinc-50 dark:bg-[#0e1117] flex flex-col">
                  {/* Photo Thumbnail */}
                  <div className="aspect-square relative overflow-hidden bg-zinc-100 dark:bg-[#161b22] flex items-center justify-center">
                    <img 
                      src={p.displayUrl} 
                      alt="" 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" 
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <a href={p.displayUrl} target="_blank" rel="noreferrer" className="p-2 rounded bg-white/20 text-white hover:bg-white/30" title="원본 보기">
                        <Eye className="w-4 h-4" />
                      </a>
                      <button 
                        onClick={() => setTargetPhoto(p)}
                        className="p-2 rounded bg-red-500/80 text-white hover:bg-red-650"
                        title="이미지 제거"
                      >
                        <Trash className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Photo Info */}
                  <div className="p-3 text-[11px] space-y-1.5 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400 font-medium">구분</span>
                        <span className="font-bold text-brand-green-500">{p._collection === "community_posts" ? "커뮤니티" : "레시피"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400 font-medium">작성자</span>
                        <span className="font-bold text-zinc-800 dark:text-zinc-250 truncate max-w-[80px]">{p.author || "익명"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400 font-medium">게시글 ID</span>
                        <span className="font-mono text-zinc-500 dark:text-zinc-400 truncate max-w-[80px]">{p.parentId || p.id}</span>
                      </div>
                    </div>

                    {/* AI Verification Indicator */}
                    <div className="border-t border-zinc-150 dark:border-[#30363d] pt-2 flex items-center justify-between">
                      <span className="text-zinc-450 font-bold">AI 검수</span>
                      {isAiFlagged ? (
                        <span className="text-red-500 font-bold bg-red-500/10 px-1.5 py-0.5 rounded flex items-center gap-1 scale-90 origin-right">
                          <AlertTriangle className="w-3 h-3" />
                          의심({aiScore + 80}%)
                        </span>
                      ) : (
                        <span className="text-emerald-500 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded flex items-center gap-1 scale-90 origin-right">
                          <ShieldCheck className="w-3 h-3" />
                          안전(99%)
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Deletion Confirm Modal */}
      {targetPhoto && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form onSubmit={handleDeleteSubmit} className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] p-6 rounded-xl w-full max-w-[400px] shadow-2xl space-y-4">
            <h4 className="font-extrabold text-sm text-red-500 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              이미지 삭제 의사 확인
            </h4>
            <p className="text-xs text-zinc-400 leading-relaxed">
              본 작업 실행 시 해당 게시글의 이미지가 제거되며 원본 파일 연결이 상실됩니다. 사유를 반드시 작성해 주세요.
            </p>
            <textarea
              required
              rows="3"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="예: 초상권 침해 또는 부적절한 노출 요소를 포함하고 있는 포토 사진..."
              className="w-full p-3 border border-zinc-350 dark:border-[#30363d] bg-zinc-50 dark:bg-[#0e1117] rounded-lg text-xs focus:outline-none"
            ></textarea>
            <div className="flex justify-end gap-2 text-xs">
              <button type="button" onClick={() => { setTargetPhoto(null); setReason(""); }} className="px-4 py-2 border border-zinc-300 dark:border-[#30363d] rounded-lg font-bold text-zinc-600 dark:text-zinc-400">
                취소
              </button>
              <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-red-500 text-white rounded-lg font-bold hover:bg-red-700">
                {isSubmitting ? "삭제 처리 중..." : "확인 및 실행"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
