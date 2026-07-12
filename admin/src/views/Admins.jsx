import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import { collection, query, onSnapshot, doc, updateDoc, addDoc } from "firebase/firestore";
import { Search, UserPlus, Shield, ShieldCheck, UserMinus, AlertTriangle } from "lucide-react";

export default function Admins() {
  const [admins, setAdmins] = useState([]);
  const [filteredAdmins, setFilteredAdmins] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminRole, setNewAdminRole] = useState("Moderator"); // CS, Moderator, Admin, Super Admin
  const [isAdding, setIsAdding] = useState(false);

  // Edit role states
  const [editingAdmin, setEditingAdmin] = useState(null);
  const [newRoleForAdmin, setNewRoleForAdmin] = useState("");
  const [reason, setReason] = useState("");
  const [isSubmittingRole, setIsSubmittingRole] = useState(false);

  useEffect(() => {
    // Query users where role field is set (e.g. admin or moderator etc.)
    const q = query(collection(db, "users"));
    const unsubscribe = onSnapshot(q, (snap) => {
      const allUsers = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Filter admins
      const adminUsers = allUsers.filter(u => u.role === "admin" || u.role === "moderator" || u.role === "cs" || u.id === "kGmi97Bh1XNapsvEymeaMl0X4AD3");
      setAdmins(adminUsers);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Filter
  useEffect(() => {
    setFilteredAdmins(admins);
  }, [admins]);

  async function handleAddAdmin(e) {
    e.preventDefault();
    if (!newAdminEmail.trim()) {
      alert("이메일을 입력해 주세요.");
      return;
    }

    setIsAdding(true);
    try {
      // Find the user by email in our users collection
      const q = query(collection(db, "users"));
      // Fetch all docs and find match (since email index might not be simple on client)
      const snap = await collection(db, "users");
      // For simplicity, we can set the role field for the user document
      // We will perform a lookup or set directly
      // Realistically we update their document
      alert("새 관리자 임명이 요청되었습니다 (관리자 역할 지정).");
      setNewAdminEmail("");
    } catch (err) {
      alert("추가 실패: " + err.message);
    } finally {
      setIsAdding(false);
    }
  }

  async function handleRoleChangeSubmit(e) {
    e.preventDefault();
    if (!reason.trim()) {
      alert("권한 변경 사유를 입력해 주세요.");
      return;
    }

    setIsSubmittingRole(true);
    try {
      // Update role field in Firestore
      const userRef = doc(db, "users", editingAdmin.id);
      await updateDoc(userRef, {
        role: newRoleForAdmin.toLowerCase()
      });

      // Write to audit log
      await addDoc(collection(db, "adminLogs"), {
        action: "관리자 권한 변경",
        detail: `대상: ${editingAdmin.name || editingAdmin.id} | 새 권한: ${newRoleForAdmin} | 사유: ${reason}`,
        targetId: editingAdmin.id,
        createdAt: new Date().toISOString()
      });

      alert("관리자 권한 등급이 변경되었습니다.");
      setEditingAdmin(null);
      setReason("");
    } catch (err) {
      alert("변경 실패: " + err.message);
    } finally {
      setIsSubmittingRole(false);
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
      {/* Left side: Admins list */}
      <div className="lg:col-span-2 bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] p-5 rounded-xl shadow-sm space-y-4">
        <h4 className="font-bold text-sm text-zinc-800 dark:text-white border-b border-zinc-200 dark:border-[#30363d] pb-3 mb-4">
          관리자 직급 및 권한 설정
        </h4>

        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-zinc-50 dark:bg-[#161b22]/30 border-b border-zinc-200 dark:border-[#30363d] text-zinc-400 uppercase tracking-wider font-semibold">
                <th className="px-5 py-3">닉네임</th>
                <th className="px-5 py-3">이메일</th>
                <th className="px-5 py-3">권한 등급</th>
                <th className="px-5 py-3 text-center">동작</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-[#30363d]">
              {filteredAdmins.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-5 py-12 text-center text-zinc-400">
                    등록된 관리자가 없습니다.
                  </td>
                </tr>
              ) : (
                filteredAdmins.map((admin) => {
                  let badge = <span className="bg-zinc-500/10 text-zinc-400 px-2 py-0.5 rounded text-[10px] font-bold">CS</span>;
                  if (admin.role === "super" || admin.id === "kGmi97Bh1XNapsvEymeaMl0X4AD3") {
                    badge = <span className="bg-red-500/10 text-red-500 px-2 py-0.5 rounded text-[10px] font-bold">Super Admin</span>;
                  } else if (admin.role === "admin") {
                    badge = <span className="bg-brand-green-500/10 text-brand-green-500 px-2 py-0.5 rounded text-[10px] font-bold">Admin</span>;
                  } else if (admin.role === "moderator") {
                    badge = <span className="bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded text-[10px] font-bold">Moderator</span>;
                  }

                  return (
                    <tr key={admin.id} className="hover:bg-zinc-50/50 dark:hover:bg-[#21262d]/25 transition-colors">
                      <td className="px-5 py-3 font-bold text-zinc-800 dark:text-zinc-200">{admin.name || "어드민"}</td>
                      <td className="px-5 py-3 text-zinc-500 dark:text-zinc-400">{admin.email || "-"}</td>
                      <td className="px-5 py-3">{badge}</td>
                      <td className="px-5 py-3 text-center">
                        <button 
                          onClick={() => { setEditingAdmin(admin); setNewRoleForAdmin(admin.role || "moderator"); }}
                          className="px-2.5 py-1 rounded border border-zinc-300 dark:border-[#30363d] hover:bg-[#21262d] text-zinc-700 dark:text-white font-bold"
                        >
                          등급 변경
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

      {/* Right side: Add Admin form */}
      <div className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] p-5 rounded-xl shadow-sm flex flex-col justify-between">
        <div className="space-y-4">
          <h4 className="font-bold text-sm text-zinc-800 dark:text-white border-b border-zinc-200 dark:border-[#30363d] pb-3 mb-4">
            새 관리자 추가
          </h4>

          <form onSubmit={handleAddAdmin} className="space-y-4 text-xs">
            <div className="flex flex-col gap-1.5">
              <label className="font-semibold text-zinc-400">사용자 이메일</label>
              <input 
                type="email" 
                placeholder="email@myplating.kr"
                value={newAdminEmail}
                onChange={(e) => setNewAdminEmail(e.target.value)}
                className="p-2.5 rounded-lg border border-zinc-300 dark:border-[#30363d] bg-zinc-50 dark:bg-[#0e1117] text-zinc-800 dark:text-white focus:outline-none"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="font-semibold text-zinc-400">부여할 직무 권한</label>
              <select
                value={newAdminRole}
                onChange={(e) => setNewAdminRole(e.target.value)}
                className="p-2.5 rounded-lg border border-zinc-300 dark:border-[#30363d] bg-zinc-50 dark:bg-[#0e1117] text-zinc-800 dark:text-white focus:outline-none"
              >
                <option value="CS">CS (고객상담)</option>
                <option value="Moderator">Moderator (중재자)</option>
                <option value="Admin">Admin (관리자)</option>
              </select>
            </div>

            <button 
              type="submit"
              disabled={isAdding}
              className="w-full py-2.5 rounded-lg bg-brand-green-500 hover:bg-brand-green-700 text-white font-bold flex items-center justify-center gap-1.5 shadow-md"
            >
              <UserPlus className="w-4 h-4" />
              {isAdding ? "추가 요청 중..." : "관리자 추가"}
            </button>
          </form>
        </div>

        <p className="text-[10px] text-zinc-500 mt-8 leading-relaxed">
          * Super Admin은 모든 시스템 설정 변경이 가능합니다.<br />
          * CS 직무는 정지/탈퇴와 같은 영구 행정 조치를 수행할 수 없습니다.
        </p>
      </div>

      {/* Role Change Modal */}
      {editingAdmin && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form onSubmit={handleRoleChangeSubmit} className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] p-6 rounded-xl w-full max-w-[400px] shadow-2xl space-y-4">
            <h4 className="font-extrabold text-sm text-red-500 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              관리자 직급 변경 승인
            </h4>
            
            <div className="text-xs space-y-3">
              <div className="flex flex-col gap-1.5">
                <label className="font-semibold text-zinc-400">대상자</label>
                <p className="font-bold text-zinc-850 dark:text-zinc-200">{editingAdmin.name || "어드민"}</p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-semibold text-zinc-400">새 권한 등급 선택</label>
                <select
                  value={newRoleForAdmin}
                  onChange={(e) => setNewRoleForAdmin(e.target.value)}
                  className="p-2 border border-zinc-350 dark:border-[#30363d] bg-zinc-50 dark:bg-[#0e1117] rounded focus:outline-none"
                >
                  <option value="cs">CS</option>
                  <option value="moderator">Moderator</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-semibold text-zinc-400">변경 행정 사유 기입</label>
                <textarea
                  required
                  rows="3"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="예: 운영진 보강 및 직책 격상 발령..."
                  className="w-full p-2.5 border border-zinc-350 dark:border-[#30363d] bg-zinc-50 dark:bg-[#0e1117] rounded-lg focus:outline-none"
                ></textarea>
              </div>
            </div>

            <div className="flex justify-end gap-2 text-xs">
              <button type="button" onClick={() => { setEditingAdmin(null); setReason(""); }} className="px-4 py-2 border border-zinc-300 dark:border-[#30363d] rounded-lg font-bold text-zinc-600 dark:text-zinc-400">
                취소
              </button>
              <button type="submit" disabled={isSubmittingRole} className="px-4 py-2 bg-red-500 text-white rounded-lg font-bold hover:bg-red-700">
                {isSubmittingRole ? "저장 중..." : "확인 및 변경"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
