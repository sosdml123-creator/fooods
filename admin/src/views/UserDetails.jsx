import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import { doc, getDoc, updateDoc, addDoc, collection, query, where, getDocs, serverTimestamp } from "firebase/firestore";
import { ArrowLeft, Save, AlertTriangle, ShieldCheck, RefreshCw, Trash, UserX, Unlock, Ban } from "lucide-react";

export default function UserDetails({ uid, onBack }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [memo, setMemo] = useState("");
  const [isSavingMemo, setIsSavingMemo] = useState(false);

  // Modal actions states
  const [actionType, setActionType] = useState(null); // 'warn', 'lock', 'unlock', 'suspend_7', 'suspend_30', 'suspend_perm', 'unsuspend', 'logout'
  const [reason, setReason] = useState("");
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);

  // Activity Tabs states
  const [activeTab, setActiveTab] = useState("posts");
  const [activityData, setActivityData] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);

  useEffect(() => {
    loadUser();
  }, [uid]);

  async function loadUser() {
    setLoading(true);
    try {
      const userSnap = await getDoc(doc(db, "users", uid));
      if (userSnap.exists()) {
        const uData = userSnap.data();
        setUser({ id: userSnap.id, ...uData });
        setMemo(uData.adminMemo || "");
      }
    } catch (err) {
      console.error("Error loading user:", err);
    } finally {
      setLoading(false);
    }
  }

  // Load activities based on tab
  useEffect(() => {
    if (!uid) return;
    loadActivities();
  }, [uid, activeTab]);

  async function loadActivities() {
    setActivityLoading(true);
    setActivityData([]);
    try {
      let q;
      if (activeTab === "posts") {
        q = query(collection(db, "posts"), where("userId", "==", uid));
      } else if (activeTab === "comments") {
        q = query(collection(db, "comments"), where("userId", "==", uid));
      } else if (activeTab === "reports_filed") {
        q = query(collection(db, "reports"), where("reporter", "==", user?.name || ""));
      } else if (activeTab === "reports_received") {
        q = query(collection(db, "reports"), where("targetId", "==", uid)); // or author match
      } else if (activeTab === "blocks") {
        q = query(collection(db, "blocks"), where("blockerId", "==", uid));
      }

      if (q) {
        const snap = await getDocs(q);
        const docs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setActivityData(docs);
      }
    } catch (err) {
      console.error("Error loading activities:", err);
    } finally {
      setActivityLoading(false);
    }
  }

  // Save Memo
  async function handleSaveMemo() {
    setIsSavingMemo(true);
    try {
      await updateDoc(doc(db, "users", uid), {
        adminMemo: memo
      });
      alert("관리자 메모가 저장되었습니다.");
    } catch (err) {
      alert("메모 저장 실패: " + err.message);
    } finally {
      setIsSavingMemo(false);
    }
  }

  // Perform moderation action (Warn, Lock, Suspend)
  async function handleActionSubmit(e) {
    e.preventDefault();
    if (!reason.trim()) {
      alert("처리 사유를 입력해 주세요.");
      return;
    }

    setIsSubmittingAction(true);
    try {
      let statusUpdate = {};
      let actionName = "";

      if (actionType === "warn") {
        statusUpdate = { status: "warn" };
        actionName = "경고 조치";
      } else if (actionType === "lock") {
        statusUpdate = { status: "locked" };
        actionName = "계정 잠금";
      } else if (actionType === "unlock") {
        statusUpdate = { status: "normal" };
        actionName = "잠금 해제";
      } else if (actionType === "suspend_7") {
        const until = new Date();
        until.setDate(until.getDate() + 7);
        statusUpdate = { status: "suspended", suspendedUntil: until.toISOString() };
        actionName = "7일 이용정지";
      } else if (actionType === "suspend_30") {
        const until = new Date();
        until.setDate(until.getDate() + 30);
        statusUpdate = { status: "suspended", suspendedUntil: until.toISOString() };
        actionName = "30일 이용정지";
      } else if (actionType === "suspend_perm") {
        statusUpdate = { status: "permanent_suspended" };
        actionName = "영구 정지";
      } else if (actionType === "unsuspend") {
        statusUpdate = { status: "normal", suspendedUntil: null };
        actionName = "정지 해제";
      } else if (actionType === "logout") {
        statusUpdate = { sessionToken: null };
        actionName = "강제 로그아웃";
      }

      // 1. Update user document status
      await updateDoc(doc(db, "users", uid), statusUpdate);

      // 2. Add audit log
      await addDoc(collection(db, "adminLogs"), {
        action: actionName,
        detail: `대상 회원: ${user?.name || "알 수 없음"} (${uid}) | 사유: ${reason}`,
        targetId: uid,
        createdAt: new Date().toISOString(),
      });

      alert(`${actionName} 처리가 완료되었습니다.`);
      setActionType(null);
      setReason("");
      loadUser();
    } catch (err) {
      alert("작업 처리 실패: " + err.message);
    } finally {
      setIsSubmittingAction(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-brand-green-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center py-20 text-zinc-400">
        존재하지 않는 회원 정보입니다.
      </div>
    );
  }

  const hasAvatar = user.avatarImg && user.avatarImg.startsWith("http");

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button 
        onClick={onBack}
        className="flex items-center gap-2 text-xs font-semibold text-zinc-500 hover:text-zinc-800 dark:text-[#8b949e] dark:hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        회원 리스트로 돌아가기
      </button>

      {/* Main grids */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Side: Profile Detail Card */}
        <div className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] p-6 rounded-xl shadow-sm space-y-6">
          <div className="flex flex-col items-center text-center">
            <div className="w-20 h-20 rounded-full bg-zinc-150 dark:bg-[#30363d] border-2 border-brand-green-500/20 overflow-hidden flex items-center justify-center mb-3">
              {hasAvatar ? (
                <img src={user.avatarImg} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-xl font-bold text-zinc-400">{user.name ? user.name[0] : "?"}</span>
              )}
            </div>
            <h3 className="text-base font-extrabold text-zinc-800 dark:text-white">{user.name || "플레이터"}</h3>
            <p className="text-[10px] font-mono text-zinc-400 mt-1">{user.id}</p>
          </div>

          <div className="border-t border-zinc-100 dark:border-[#30363d] pt-4 space-y-3 text-xs">
            <div className="flex justify-between">
              <span className="text-zinc-400 font-semibold">이메일</span>
              <span className="text-zinc-800 dark:text-zinc-200 font-medium">{user.email || "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400 font-semibold">가입일시</span>
              <span className="text-zinc-800 dark:text-zinc-200 font-medium">{user.createdAt ? user.createdAt.replace("T", " ").slice(0, 16) : "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400 font-semibold">마지막 로그인</span>
              <span className="text-zinc-800 dark:text-zinc-200 font-medium">{user.lastLoginAt ? user.lastLoginAt.replace("T", " ").slice(0, 16) : "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400 font-semibold">계정상태</span>
              <span className="font-bold uppercase">{user.status || "normal"}</span>
            </div>
          </div>
        </div>

        {/* Middle: Action Panel */}
        <div className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] p-6 rounded-xl shadow-sm space-y-6">
          <h4 className="font-bold text-sm text-zinc-800 dark:text-white border-b border-zinc-200 dark:border-[#30363d] pb-3">관리자 조치 패널</h4>
          
          <div className="grid grid-cols-2 gap-2 text-xs">
            <button onClick={() => setActionType("warn")} className="flex items-center justify-center gap-2 p-2.5 rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-500 font-bold hover:bg-amber-500/20">
              <AlertTriangle className="w-4 h-4" />
              경고 부여
            </button>
            <button onClick={() => setActionType("lock")} className="flex items-center justify-center gap-2 p-2.5 rounded-lg border border-purple-500/20 bg-purple-500/10 text-purple-500 font-bold hover:bg-purple-500/20">
              <UserX className="w-4 h-4" />
              계정 잠금
            </button>
            <button onClick={() => setActionType("unlock")} className="flex items-center justify-center gap-2 p-2.5 rounded-lg border border-zinc-500/20 bg-zinc-500/10 text-zinc-500 font-bold hover:bg-zinc-500/20">
              <Unlock className="w-4 h-4" />
              잠금 해제
            </button>
            <button onClick={() => setActionType("suspend_7")} className="flex items-center justify-center gap-2 p-2.5 rounded-lg border border-red-500/20 bg-red-500/10 text-red-500 font-bold hover:bg-red-500/20">
              <Ban className="w-4 h-4" />
              7일 이용정지
            </button>
            <button onClick={() => setActionType("suspend_30")} className="flex items-center justify-center gap-2 p-2.5 rounded-lg border border-red-500/20 bg-red-500/10 text-red-500 font-bold hover:bg-red-500/20">
              <Ban className="w-4 h-4" />
              30일 이용정지
            </button>
            <button onClick={() => setActionType("suspend_perm")} className="flex items-center justify-center gap-2 p-2.5 rounded-lg border border-red-500/20 bg-red-500/10 text-red-500 font-bold hover:bg-red-500/20">
              <Ban className="w-4 h-4" />
              영구 정지
            </button>
            <button onClick={() => setActionType("unsuspend")} className="col-span-2 flex items-center justify-center gap-2 p-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-500 font-bold hover:bg-emerald-500/20">
              <ShieldCheck className="w-4 h-4" />
              모든 정지 해제
            </button>
          </div>
        </div>

        {/* Right Side: Admin Memo */}
        <div className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] p-6 rounded-xl shadow-sm flex flex-col">
          <h4 className="font-bold text-sm text-zinc-800 dark:text-white border-b border-zinc-200 dark:border-[#30363d] pb-3 mb-4">관리자 메모</h4>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="회원에 대한 메모나 특이사항 기록..."
            className="flex-1 w-full p-3 rounded-lg border border-zinc-350 dark:border-[#30363d] bg-zinc-50 dark:bg-[#0e1117] text-xs resize-none focus:outline-none"
          ></textarea>
          <button 
            onClick={handleSaveMemo}
            disabled={isSavingMemo}
            className="w-full mt-3 py-2.5 rounded-lg bg-brand-green-500 hover:bg-brand-green-700 text-white text-xs font-bold flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            메모 저장
          </button>
        </div>
      </div>

      {/* 5. Activities Tab Sections */}
      <div className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] rounded-xl shadow-sm overflow-hidden">
        {/* Tab Header Bar */}
        <div className="flex border-b border-zinc-200 dark:border-[#30363d] overflow-x-auto no-scrollbar">
          {[
            { key: "posts", label: "작성 게시글" },
            { key: "comments", label: "작성 댓글" },
            { key: "reports_filed", label: "신고한 내역" },
            { key: "reports_received", label: "신고받은 내역" },
            { key: "blocks", label: "차단한 회원" },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-5 py-3 text-xs font-bold border-b-2 whitespace-nowrap transition-colors ${
                activeTab === tab.key 
                  ? "border-brand-green-500 text-brand-green-500 bg-brand-green-500/5" 
                  : "border-transparent text-zinc-400 hover:text-zinc-600 dark:hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Contents Panel */}
        <div className="p-5">
          {activityLoading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-6 h-6 border-3 border-brand-green-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : activityData.length === 0 ? (
            <p className="text-xs text-zinc-400 text-center py-8">이력이 존재하지 않습니다.</p>
          ) : (
            <div className="space-y-3">
              {activityData.map((act) => (
                <div key={act.id} className="text-xs p-3.5 rounded-lg border border-zinc-200 dark:border-[#30363d] bg-zinc-50 dark:bg-[#0e1117]/35 flex justify-between items-center">
                  <div>
                    {activeTab === "posts" && <p className="font-bold text-zinc-800 dark:text-zinc-200">{act.title}</p>}
                    {activeTab === "comments" && <p className="text-zinc-800 dark:text-zinc-200">{act.text}</p>}
                    {activeTab === "reports_filed" && <p className="text-zinc-800 dark:text-zinc-200">[{act.targetType === "post" ? "게시물" : "댓글"} 신고] 사유: {act.reason}</p>}
                    {activeTab === "reports_received" && <p className="text-zinc-800 dark:text-zinc-200">신고자: {act.reporter} | 사유: {act.reason}</p>}
                    {activeTab === "blocks" && <p className="text-zinc-800 dark:text-zinc-200">차단한 유저 UID: {act.blockedId}</p>}
                    <span className="text-[10px] text-zinc-400 mt-1 block">ID: {act.id} | 등록일: {act.createdAt || act.timestamp}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Action execution reason input Modal */}
      {actionType && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form onSubmit={handleActionSubmit} className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] p-6 rounded-xl w-full max-w-[400px] shadow-2xl space-y-4">
            <h4 className="font-extrabold text-sm text-red-500 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              조치 사유 입력 필수
            </h4>
            <p className="text-xs text-zinc-400 leading-relaxed">
              본 작업은 감사 로그(Audit Logs)에 기록되며 취소가 불가능합니다. 작업을 실행하는 합당한 행정 사유를 입력해 주세요.
            </p>
            <textarea
              required
              rows="3"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="사유를 작성해 주세요 (예: 커뮤니티 욕설 신고 다수 누적)..."
              className="w-full p-3 border border-zinc-350 dark:border-[#30363d] bg-zinc-50 dark:bg-[#0e1117] rounded-lg text-xs focus:outline-none"
            ></textarea>
            <div className="flex justify-end gap-2 text-xs">
              <button type="button" onClick={() => setActionType(null)} className="px-4 py-2 border border-zinc-300 dark:border-[#30363d] rounded-lg font-bold text-zinc-600 dark:text-zinc-400">
                취소
              </button>
              <button type="submit" disabled={isSubmittingAction} className="px-4 py-2 bg-red-500 text-white rounded-lg font-bold hover:bg-red-700">
                {isSubmittingAction ? "처리 중..." : "확인 및 실행"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
