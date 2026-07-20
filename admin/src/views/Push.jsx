import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import { collection, query, onSnapshot, addDoc, doc, updateDoc, getDocs } from "firebase/firestore";
import { Send, Clock, User, AlertTriangle, ShieldCheck, History } from "lucide-react";

// API URL: 개발환경은 localhost, 프로덕션은 실제 서버
const API_BASE = typeof window !== "undefined" && window.location.hostname === "localhost"
  ? "http://localhost:4000"
  : "https://myplating.kr";

export default function Push() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [targetSegment, setTargetSegment] = useState("all"); // "all", "active", "inactive", "user"
  const [targetUserUid, setTargetUserUid] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduleTime, setScheduleTime] = useState("");
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "pushHistory"));
    const unsubscribe = onSnapshot(q, (snap) => {
      setHistory(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => {
      console.error("Push history listener error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  async function handleSendPush(e) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      alert("제목과 내용을 모두 기입해 주세요.");
      return;
    }

    if (targetSegment === "user" && !targetUserUid.trim()) {
      alert("특정 회원의 UID를 입력해 주세요.");
      return;
    }

    if (isScheduled && !scheduleTime) {
      alert("예약 발송 일시를 설정해 주세요.");
      return;
    }

    setIsSending(true);
    try {
      const sendTimeStr = isScheduled ? scheduleTime : new Date().toISOString();
      const statusLabel = isScheduled ? "scheduled" : "sent";

      // 1. Resolve target UIDs
      let targetUids = [];
      if (targetSegment === "user") {
        targetUids = [targetUserUid.trim()];
      } else {
        const usersSnap = await getDocs(collection(db, "users"));
        const allUsers = usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (targetSegment === "all") {
          targetUids = allUsers.map(u => u.id);
        } else if (targetSegment === "active") {
          targetUids = allUsers.filter(u => u.status === "normal" || !u.status).map(u => u.id);
        } else if (targetSegment === "inactive") {
          targetUids = allUsers.filter(u => u.status && u.status !== "normal").map(u => u.id);
        }
      }

      const payload = {
        targetSegment,
        targetUserUid: targetSegment === "user" ? targetUserUid.trim() : null,
        title,
        body,
        status: statusLabel,
        sentAt: sendTimeStr,
        createdAt: new Date().toISOString()
      };

      // 2. Add to pushHistory in Firestore
      const docRef = await addDoc(collection(db, "pushHistory"), payload);

      // 3. Trigger FCM via local backend for immediate pushes
      if (!isScheduled) {
        let successCount = 0;
        let failCount = 0;
        
        for (const uid of targetUids) {
          try {
            const response = await fetch(`${API_BASE}/api/v1/admin/send-push`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                targetUid: uid,
                title: title,
                body: body,
                type: "admin_broadcast"
              })
            });
            const resData = await response.json();
            if (resData.success) {
              successCount++;
            } else {
              failCount++;
            }
          } catch (err) {
            failCount++;
          }
        }
        
        alert(`푸시 전송 완료! (성공: ${successCount}건, 실패/FCM미등록: ${failCount}건)`);
      } else {
        alert("푸시 발송 예약이 설정되었습니다.");
      }

      // 4. Add to admin logs
      await addDoc(collection(db, "adminLogs"), {
        action: isScheduled ? "푸시 발송 예약" : "푸시 발송 실행",
        detail: `대상: ${targetSegment === "user" ? targetUserUid : targetSegment} | 제목: ${title} | 시간: ${sendTimeStr}`,
        targetId: docRef.id,
        createdAt: new Date().toISOString()
      });

      // Reset form
      setTitle("");
      setBody("");
      setTargetUserUid("");
      setIsScheduled(false);
      setScheduleTime("");
    } catch (err) {
      alert("푸시 발송 처리 실패: " + err.message);
    } finally {
      setIsSending(false);
    }
  }

  async function handleSendNow(item) {
    if (!window.confirm("선택한 예약을 지금 즉시 발송하시겠습니까?")) return;
    setIsSending(true);
    try {
      let targetUids = [];
      if (item.targetSegment === "user" && item.targetUserUid) {
        targetUids = [item.targetUserUid];
      } else {
        const usersSnap = await getDocs(collection(db, "users"));
        const allUsers = usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (item.targetSegment === "all") {
          targetUids = allUsers.map(u => u.id);
        } else if (item.targetSegment === "active") {
          targetUids = allUsers.filter(u => u.status === "normal" || !u.status).map(u => u.id);
        } else if (item.targetSegment === "inactive") {
          targetUids = allUsers.filter(u => u.status && u.status !== "normal").map(u => u.id);
        }
      }

      let successCount = 0;
      let failCount = 0;

      for (const uid of targetUids) {
        try {
          const response = await fetch(`${API_BASE}/api/v1/admin/send-push`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              targetUid: uid,
              title: item.title,
              body: item.body,
              type: "admin_broadcast"
            })
          });
          const resData = await response.json();
          if (resData.success) {
            successCount++;
          } else {
            failCount++;
          }
        } catch (err) {
          failCount++;
        }
      }

      await updateDoc(doc(db, "pushHistory", item.id), {
        status: "completed",
        successCount,
        failCount,
        sentAt: new Date().toISOString()
      });

      await addDoc(collection(db, "adminLogs"), {
        action: "예약 푸시 즉시 전송",
        detail: `대상: ${item.targetSegment} | 제목: ${item.title} | 성공: ${successCount}건`,
        targetId: item.id,
        createdAt: new Date().toISOString()
      });

      alert(`푸시 전송 완료! (성공: ${successCount}건, 실패: ${failCount}건)`);
    } catch (err) {
      alert("푸시 전송 실패: " + err.message);
    } finally {
      setIsSending(false);
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
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left side: push form */}
      <div className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] p-5 rounded-xl shadow-sm space-y-4">
        <h4 className="font-bold text-sm text-zinc-800 dark:text-white border-b border-zinc-200 dark:border-[#30363d] pb-3 mb-4">
          푸시 알림 콘솔
        </h4>

        <form onSubmit={handleSendPush} className="space-y-4 text-xs">
          {/* Target Segment */}
          <div className="flex flex-col gap-1.5">
            <label className="font-semibold text-zinc-400">수신 대상자 세그먼트</label>
            <select
              value={targetSegment}
              onChange={(e) => setTargetSegment(e.target.value)}
              className="p-2.5 rounded-lg border border-zinc-300 dark:border-[#30363d] bg-zinc-50 dark:bg-[#0e1117] text-zinc-800 dark:text-white focus:outline-none"
            >
              <option value="all">전체 회원</option>
              <option value="active">활성 회원</option>
              <option value="inactive">휴면 회원</option>
              <option value="user">특정 회원</option>
            </select>
          </div>

          {/* Specific User Input */}
          {targetSegment === "user" && (
            <div className="flex flex-col gap-1.5 animate-fadeIn">
              <label className="font-semibold text-zinc-400">수신 회원 UID</label>
              <input
                type="text"
                placeholder="대상 회원 UID 입력"
                value={targetUserUid}
                onChange={(e) => setTargetUserUid(e.target.value)}
                className="p-2.5 rounded-lg border border-zinc-300 dark:border-[#30363d] bg-zinc-50 dark:bg-[#0e1117] text-zinc-800 dark:text-white focus:outline-none font-mono"
                required
              />
            </div>
          )}

          {/* Push Title */}
          <div className="flex flex-col gap-1.5">
            <label className="font-semibold text-zinc-400">푸시 알림 제목</label>
            <input
              type="text"
              placeholder="제목 입력 (예: 📢 주간 인기 레시피 추천)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="p-2.5 rounded-lg border border-zinc-300 dark:border-[#30363d] bg-zinc-50 dark:bg-[#0e1117] text-zinc-800 dark:text-white focus:outline-none"
              required
            />
          </div>

          {/* Push Message Body */}
          <div className="flex flex-col gap-1.5">
            <label className="font-semibold text-zinc-400">푸시 알림 본문</label>
            <textarea
              rows="4"
              placeholder="알림 본문 내용을 입력해 주세요..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="p-2.5 rounded-lg border border-zinc-300 dark:border-[#30363d] bg-zinc-50 dark:bg-[#0e1117] text-zinc-800 dark:text-white focus:outline-none"
              required
            ></textarea>
          </div>

          {/* Schedule Settings */}
          <div className="border-t border-zinc-150 dark:border-[#30363d] pt-4 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer font-semibold text-zinc-400">
              <input 
                type="checkbox" 
                checked={isScheduled} 
                onChange={(e) => setIsScheduled(e.target.checked)} 
                className="w-3.5 h-3.5 rounded" 
              />
              발송 예약 시간 설정 (미설정 시 즉시 발송)
            </label>

            {isScheduled && (
              <div className="flex flex-col gap-1.5 animate-fadeIn">
                <label className="font-semibold text-zinc-400">예약 발송 일시</label>
                <input
                  type="datetime-local"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  className="p-2.5 rounded-lg border border-zinc-300 dark:border-[#30363d] bg-zinc-50 dark:bg-[#0e1117] text-zinc-800 dark:text-white focus:outline-none"
                  required
                />
              </div>
            )}
          </div>

          {/* Send Trigger */}
          <button
            type="submit"
            disabled={isSending}
            className="w-full py-3 rounded-lg bg-brand-green-500 hover:bg-brand-green-700 text-white font-bold flex items-center justify-center gap-2 shadow-lg transition-colors"
          >
            {isScheduled ? <Clock className="w-4 h-4" /> : <Send className="w-4 h-4" />}
            {isSending ? "발송 요청 중..." : (isScheduled ? "예약 푸시 등록" : "즉시 푸시 발송")}
          </button>
        </form>
      </div>

      {/* Right side: push history */}
      <div className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] p-5 rounded-xl shadow-sm flex flex-col">
        <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-[#30363d] pb-3 mb-4">
          <History className="w-4 h-4 text-brand-green-500" />
          <h4 className="font-bold text-sm text-zinc-800 dark:text-white">푸시 발송 이력</h4>
        </div>

        <div className="space-y-3 flex-1 overflow-y-auto max-h-[460px] custom-scrollbar">
          {history.length === 0 ? (
            <p className="text-xs text-zinc-400 text-center py-16">발송 내역이 비어 있습니다.</p>
          ) : (
            [...history]
              .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
              .map((item) => (
                <div key={item.id} className="p-3.5 rounded-xl border border-zinc-200 dark:border-[#30363d] bg-zinc-50 dark:bg-[#0e1117]/35 text-xs">
                  <div className="flex justify-between items-center mb-1.5">
                    <div className="flex gap-1.5 items-center">
                      <span className="bg-brand-green-500/10 text-brand-green-500 px-2 py-0.5 rounded text-[9px] font-bold">
                        {item.targetSegment === "all" ? "전체" : item.targetSegment === "user" ? "특정" : item.targetSegment}
                      </span>
                      {item.status === "scheduled" ? (
                        <span className="bg-yellow-500/10 text-yellow-500 px-2 py-0.5 rounded text-[9px] font-bold">
                          예약대기
                        </span>
                      ) : item.status === "completed" ? (
                        <span className="bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded text-[9px] font-bold">
                          발송완료
                        </span>
                      ) : (
                        <span className="bg-zinc-500/10 text-zinc-400 px-2 py-0.5 rounded text-[9px] font-bold">
                          즉시발송
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-zinc-400">{item.sentAt ? item.sentAt.replace("T", " ").slice(0, 16) : "-"}</span>
                  </div>
                  <h5 className="font-bold text-zinc-800 dark:text-zinc-200">{item.title}</h5>
                  <p className="text-zinc-450 mt-1">{item.body}</p>
                  
                  {item.status === "scheduled" && (
                    <div className="mt-2.5 pt-2 border-t border-zinc-200 dark:border-[#30363d] flex justify-end">
                      <button
                        onClick={() => handleSendNow(item)}
                        disabled={isSending}
                        className="px-3 py-1 bg-brand-green-500 hover:bg-brand-green-700 text-white rounded text-[10px] font-bold transition-colors"
                      >
                        지금 즉시 전송
                      </button>
                    </div>
                  )}
                </div>
              ))
          )}
        </div>
      </div>
    </div>
  );
}
