import React, { useState } from "react";
import { auth } from "../firebase";
import { signInWithEmailAndPassword } from "firebase/auth";
import { ShieldAlert, Lock, User } from "lucide-react";

export default function Login() {
  const [adminId, setAdminId] = useState("");
  const [adminPw, setAdminPw] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    if (adminId.trim() === "5430" && adminPw.trim() === "8648") {
      setError("");
      setIsSubmitting(true);
      try {
        await signInWithEmailAndPassword(
          auth,
          "kakao_4933844865@myplating.kr",
          "kakao_4933844865_plating"
        );
      } catch (err) {
        console.error("Firebase Authentication failed:", err);
        setError("인증 연동 실패: " + err.message);
      } finally {
        setIsSubmitting(false);
      }
    } else {
      setError("아이디 또는 비밀번호가 올바르지 않습니다.");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0e1117] p-6 relative overflow-hidden">
      {/* Background glowing rings */}
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] bg-[#1f3d2b]/15 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] bg-[#2f5c40]/10 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="w-full max-w-[400px] bg-[#161b22] border border-[#30363d] rounded-2xl p-8 shadow-2xl relative z-10">
        {/* Brand header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-black border border-[#30363d] flex items-center justify-center mx-auto mb-4 shadow-xl overflow-hidden">
            <img src="/logo.svg" className="w-full h-full object-cover" alt="PLAYTING Logo" />
          </div>
          <h1 className="text-2xl font-black tracking-wider text-white">PLAYTING ADMIN</h1>
          <p className="text-xs text-zinc-400 mt-1.5">플레이팅 서비스 관리자 로그인</p>
        </div>

        {/* Login form */}
        <form onSubmit={handleLogin} className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold tracking-wider text-zinc-400 uppercase">Admin ID</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                <User className="w-4 h-4 text-zinc-500" />
              </span>
              <input
                type="text"
                placeholder="ID"
                value={adminId}
                onChange={(e) => setAdminId(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-lg border border-[#30363d] bg-[#0e1117] text-white text-sm focus:outline-none focus:border-brand-green-500 focus:ring-1 focus:ring-brand-green-500"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold tracking-wider text-zinc-400 uppercase">Password</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                <Lock className="w-4 h-4 text-zinc-500" />
              </span>
              <input
                type="password"
                placeholder="Password"
                value={adminPw}
                onChange={(e) => setAdminPw(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-lg border border-[#30363d] bg-[#0e1117] text-white text-sm focus:outline-none focus:border-brand-green-500 focus:ring-1 focus:ring-brand-green-500"
                required
              />
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-950/20 border border-red-500/20 text-red-400 text-xs font-semibold">
              <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 rounded-lg bg-brand-green-500 hover:bg-brand-green-700 text-white font-bold text-sm tracking-wide transition-all shadow-lg active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "로그인 인증 중..." : "안전 로그인"}
          </button>
        </form>

        <p className="text-[10px] text-center text-zinc-500 mt-8">
          권한이 부여된 IP 대역에서만 로그인이 허용되며,<br />모든 실패 시도 및 세션 로그는 실시간 모니터링됩니다.
        </p>
      </div>
    </div>
  );
}
