import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import { doc, getDoc, setDoc, addDoc, collection } from "firebase/firestore";
import { Save, ShieldAlert, BadgePlus } from "lucide-react";

export default function Settings() {
  const [settings, setSettings] = useState({
    warnThresholdReview: 10,
    warnThresholdLock: 20,
    warnThresholdBan: 30,
    forbiddenWords: "",
    nicknameMinLength: 2,
    nicknameMaxLength: 10,
    profileImageSizeLimitMb: 5,
  });

  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const docSnap = await getDoc(doc(db, "settings", "moderation"));
      if (docSnap.exists()) {
        setSettings(docSnap.data());
      }
    } catch (err) {
      console.error("Error loading settings:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveSettings(e) {
    e.preventDefault();
    setIsSaving(true);
    try {
      await setDoc(doc(db, "settings", "moderation"), settings);
      
      // Add audit log
      await addDoc(collection(db, "adminLogs"), {
        action: "시스템 설정 변경",
        detail: "자동 차단 정지 임계치 및 금칙어 설정 업데이트 완료",
        createdAt: new Date().toISOString()
      });

      alert("모든 설정이 성공적으로 저장되었습니다.");
    } catch (err) {
      alert("설정 저장 실패: " + err.message);
    } finally {
      setIsSaving(false);
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
    <form onSubmit={handleSaveSettings} className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
      {/* Left side: auto block policy */}
      <div className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] p-5 rounded-xl shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b border-zinc-150 dark:border-[#30363d] pb-3 mb-4">
          <ShieldAlert className="w-4.5 h-4.5 text-brand-green-500" />
          <h4 className="font-bold text-sm text-zinc-800 dark:text-white">자동 정지 및 제재 기준 설정</h4>
        </div>

        <div className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <label className="font-semibold text-zinc-400">신고 몇 회 누적 시 운영진 검토가 필요한가요?</label>
            <input 
              type="number"
              value={settings.warnThresholdReview}
              onChange={e => setSettings({ ...settings, warnThresholdReview: parseInt(e.target.value) || 0 })}
              className="p-2.5 rounded-lg border border-zinc-300 dark:border-[#30363d] bg-zinc-50 dark:bg-[#0e1117] text-zinc-800 dark:text-white focus:outline-none"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="font-semibold text-zinc-400">신고 몇 회 누적 시 임시 잠금(Lock) 처리를 가할까요?</label>
            <input 
              type="number"
              value={settings.warnThresholdLock}
              onChange={e => setSettings({ ...settings, warnThresholdLock: parseInt(e.target.value) || 0 })}
              className="p-2.5 rounded-lg border border-zinc-300 dark:border-[#30363d] bg-zinc-50 dark:bg-[#0e1117] text-zinc-800 dark:text-white focus:outline-none"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="font-semibold text-zinc-400">신고 몇 회 누적 시 강제 영구정지 검토를 진행할까요?</label>
            <input 
              type="number"
              value={settings.warnThresholdBan}
              onChange={e => setSettings({ ...settings, warnThresholdBan: parseInt(e.target.value) || 0 })}
              className="p-2.5 rounded-lg border border-zinc-300 dark:border-[#30363d] bg-zinc-50 dark:bg-[#0e1117] text-zinc-800 dark:text-white focus:outline-none"
              required
            />
          </div>
        </div>
      </div>

      {/* Right side: forbidden words & policies */}
      <div className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] p-5 rounded-xl shadow-sm space-y-4 flex flex-col justify-between">
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-b border-zinc-150 dark:border-[#30363d] pb-3 mb-4">
            <BadgePlus className="w-4.5 h-4.5 text-brand-green-500" />
            <h4 className="font-bold text-sm text-zinc-800 dark:text-white">금칙어 및 닉네임 유효성 정책</h4>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="font-semibold text-zinc-400">시스템 금칙어 목록 (쉼표로 구분)</label>
            <textarea
              rows="5"
              value={settings.forbiddenWords}
              onChange={e => setSettings({ ...settings, forbiddenWords: e.target.value })}
              placeholder="예: 욕설1, 욕설2, 광고글, 사기..."
              className="p-2.5 rounded-lg border border-zinc-300 dark:border-[#30363d] bg-zinc-50 dark:bg-[#0e1117] text-zinc-800 dark:text-white focus:outline-none font-mono"
            ></textarea>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="font-semibold text-zinc-400">닉네임 최소 글자수</label>
              <input 
                type="number"
                value={settings.nicknameMinLength}
                onChange={e => setSettings({ ...settings, nicknameMinLength: parseInt(e.target.value) || 0 })}
                className="p-2.5 rounded-lg border border-zinc-300 dark:border-[#30363d] bg-zinc-50 dark:bg-[#0e1117] text-zinc-800 dark:text-white focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="font-semibold text-zinc-400">닉네임 최대 글자수</label>
              <input 
                type="number"
                value={settings.nicknameMaxLength}
                onChange={e => setSettings({ ...settings, nicknameMaxLength: parseInt(e.target.value) || 0 })}
                className="p-2.5 rounded-lg border border-zinc-300 dark:border-[#30363d] bg-zinc-50 dark:bg-[#0e1117] text-zinc-800 dark:text-white focus:outline-none"
              />
            </div>
          </div>
        </div>

        <button 
          type="submit"
          disabled={isSaving}
          className="w-full mt-6 py-3 rounded-lg bg-brand-green-500 hover:bg-brand-green-700 text-white font-bold flex items-center justify-center gap-2 shadow-lg"
        >
          <Save className="w-4 h-4" />
          {isSaving ? "설정 저장 요청 중..." : "시스템 설정 전체 저장"}
        </button>
      </div>
    </form>
  );
}
