import React, { useState } from "react";

/**
 * EULAConsent 컴포넌트
 * App Store Guideline 1.2 (EULA) 필수 준수:
 * - 부적절한 콘텐츠 및 학대적 사용자에 대한 무관용 원칙 명시
 * - 핵심 커뮤니티 수칙 요약
 * - 필수 동의 체크박스 + 동의하고 계속하기 버튼
 */
function EULAConsent({ onAgree, onCancel }) {
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!agreed || submitting) return;
    setSubmitting(true);
    try {
      await onAgree();
    } catch (err) {
      console.error("[EULAConsent Error]", err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden flex flex-col">
        {/* 헤더 */}
        <div className="px-5 py-4 bg-orange-50 dark:bg-orange-950/30 border-b border-orange-100 dark:border-orange-900/40 flex items-center justify-between">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <i className="fa-solid fa-shield-halved text-orange-500"></i>
            서비스 이용약관(EULA) 동의
          </h3>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-lg font-bold"
            >
              ×
            </button>
          )}
        </div>

        {/* 본문 내용 */}
        <div className="p-5 text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed space-y-3.5 max-h-[60vh] overflow-y-auto">
          {/* 무관용 원칙 경고 문구 (필수 항목) */}
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-xl text-rose-700 dark:text-rose-300 text-[11.5px] font-bold leading-snug">
            ⚠️ 부적절한 콘텐츠 및 학대적 사용자에 대해 무관용 원칙을 적용합니다.
          </div>

          {/* 핵심 요약 */}
          <div className="bg-zinc-50 dark:bg-[#0d1117] border border-zinc-200 dark:border-[#30363d] rounded-xl p-3.5 space-y-2 text-[11px]">
            <p className="font-bold text-zinc-900 dark:text-zinc-100 text-xs">📋 핵심 커뮤니티 이용 수칙 요약</p>
            <ul className="list-disc pl-4 space-y-1 text-zinc-600 dark:text-zinc-400">
              <li><b>부적절 콘텐츠 금지</b>: 음란물, 타인 비방, 욕설, 증오 발언 게시 금지 (24시간 내 검토 및 즉시 삭제 조치)</li>
              <li><b>사용자 차단 기능</b>: 불쾌함을 유발하는 사용자는 직접 차단할 수 있으며 해당 게시글은 즉시 피드에서 제지됩니다.</li>
              <li><b>무관용 제재</b>: 약관 위반 행위 확인 시 사전 경고 없이 계정이 즉시 제한되거나 영구 이용 정지됩니다.</li>
            </ul>
          </div>

          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            원활하고 유익한 플레이팅 커뮤니티 보호를 위해 이용약관에 동의해 주셔야 로그인 및 서비스 이용이 진행됩니다.
          </p>
        </div>

        {/* 하단 동의 컨트롤 */}
        <div className="px-5 py-4 border-t border-zinc-100 dark:border-[#30363d] bg-zinc-50/50 dark:bg-[#161b22] flex flex-col gap-3">
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="w-4.5 h-4.5 accent-orange-500 cursor-pointer rounded"
            />
            <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
              위 약관에 동의합니다. <span className="text-rose-500 font-extrabold">(필수)</span>
            </span>
          </label>

          <div className="flex gap-2">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl py-3 text-xs font-bold hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors"
              >
                취소
              </button>
            )}
            <button
              type="button"
              disabled={!agreed || submitting}
              onClick={handleSubmit}
              className="flex-1 bg-orange-500 hover:bg-orange-600 text-white rounded-xl py-3 text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
            >
              {submitting ? "처리 중..." : "동의하고 계속하기"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default EULAConsent;
