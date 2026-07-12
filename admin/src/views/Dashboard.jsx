import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import { collection, query, orderBy, limit, onSnapshot, where } from "firebase/firestore";
import { 
  Users, 
  UserPlus, 
  FileText, 
  MessageSquare, 
  Flag, 
  AlertTriangle, 
  UserX, 
  Lock, 
  ArrowRight,
  TrendingUp
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function Dashboard({ navigateToUser }) {
  const [stats, setStats] = useState({
    totalUsers: 0,
    todayUsers: 0,
    todayPosts: 0,
    todayComments: 0,
    todayReports: 0,
    waitingReports: 0,
    suspendedUsers: 0,
    lockedUsers: 0,
    withdrawnUsers: 0,
    activeUsers: 0,
    dau: 0,
    mau: 0,
  });

  const [recentReports, setRecentReports] = useState([]);
  const [recentUsers, setRecentUsers] = useState([]);
  const [recentNotices, setRecentNotices] = useState([]);
  const [recentLogs, setRecentLogs] = useState([]);

  useEffect(() => {
    // ── 1. 전체 회원 & 오늘 가입 회원 ──
    const qUsers = query(collection(db, "users"));
    const unsubUsers = onSnapshot(qUsers, (snap) => {
      const allUsers = snap.docs.map(doc => doc.data());
      const total = allUsers.length;
      
      // Calculate today's registrations
      const todayStr = new Date().toISOString().split("T")[0];
      const today = allUsers.filter(u => u.createdAt && u.createdAt.startsWith(todayStr)).length;
      
      // Filter by status/role
      const suspended = allUsers.filter(u => u.status === "suspended" || u.status === "permanent_suspended").length;
      const locked = allUsers.filter(u => u.status === "locked").length;
      const withdrawn = allUsers.filter(u => u.status === "withdrawn" || u.status === "deleted").length;
      const active = total - suspended - withdrawn;
      
      setStats(prev => ({
        ...prev,
        totalUsers: total,
        todayUsers: today,
        suspendedUsers: suspended,
        lockedUsers: locked,
        withdrawnUsers: withdrawn,
        activeUsers: active,
        dau: Math.round(active * 0.4) || 0, // Mock stats for demo
        mau: Math.round(active * 0.8) || 0,
      }));

      // Set recent users
      const sortedUsers = [...snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))]
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
        .slice(0, 5);
      setRecentUsers(sortedUsers);
    });

    // ── 2. 오늘 등록된 게시물 ──
    const todayStr = new Date().toISOString().split("T")[0];
    const qPosts = query(collection(db, "posts"));
    const unsubPosts = onSnapshot(qPosts, (snap) => {
      const allPosts = snap.docs.map(doc => doc.data());
      const todayCount = allPosts.filter(p => p.createdAt && p.createdAt.startsWith(todayStr)).length;
      setStats(prev => ({ ...prev, todayPosts: todayCount }));
    });

    // ── 3. 오늘 등록된 댓글 ──
    const qComments = query(collection(db, "comments"));
    const unsubComments = onSnapshot(qComments, (snap) => {
      const allComments = snap.docs.map(doc => doc.data());
      const todayCount = allComments.filter(c => c.createdAt && c.createdAt.startsWith(todayStr)).length;
      setStats(prev => ({ ...prev, todayComments: todayCount }));
    });

    // ── 4. 신고 관리 (전체 및 대기 건수) ──
    const qReports = query(collection(db, "reports"));
    const unsubReports = onSnapshot(qReports, (snap) => {
      const allReports = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const todayCount = allReports.filter(r => r.createdAt && r.createdAt.startsWith(todayStr)).length;
      const waiting = allReports.filter(r => r.status === "waiting" || r.status === "Pending").length;
      
      setStats(prev => ({
        ...prev,
        todayReports: todayCount,
        waitingReports: waiting
      }));

      // Set recent reports
      const sortedReports = allReports
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
        .slice(0, 5);
      setRecentReports(sortedReports);
    });

    // ── 5. 최근 공지사항 ──
    const qNotices = query(collection(db, "notices"), orderBy("createdAt", "desc"), limit(5));
    const unsubNotices = onSnapshot(qNotices, (snap) => {
      setRecentNotices(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // ── 6. 최근 어드민 행동 로그 ──
    const qLogs = query(collection(db, "adminLogs"), orderBy("createdAt", "desc"), limit(5));
    const unsubLogs = onSnapshot(qLogs, (snap) => {
      setRecentLogs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubUsers();
      unsubPosts();
      unsubComments();
      unsubReports();
      unsubNotices();
      unsubLogs();
    };
  }, []);

  // Mock Graph Data for visual excellence
  const graphData = [
    { name: "07/06", 가입자: 12, 게시글: 24, 신고: 2 },
    { name: "07/07", 가입자: 19, 게시글: 32, 신고: 4 },
    { name: "07/08", 가입자: 15, 게시글: 28, 신고: 1 },
    { name: "07/09", 가입자: 22, 게시글: 45, 신고: 5 },
    { name: "07/10", 가입자: 30, 게시글: 58, 신고: 3 },
    { name: "07/11", 가입자: 25, 게시글: 51, 신고: 0 },
    { name: "오늘", 가입자: stats.todayUsers, 게시글: stats.todayPosts, 신고: stats.todayReports },
  ];

  const cards = [
    { title: "전체 회원", value: stats.totalUsers, icon: Users, color: "text-blue-500", bg: "bg-blue-500/10" },
    { title: "오늘 가입", value: stats.todayUsers, icon: UserPlus, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { title: "오늘 게시글", value: stats.todayPosts, icon: FileText, color: "text-amber-500", bg: "bg-amber-500/10" },
    { title: "오늘 댓글", value: stats.todayComments, icon: MessageSquare, color: "text-indigo-500", bg: "bg-indigo-500/10" },
    { title: "오늘 신고", value: stats.todayReports, icon: Flag, color: "text-red-500", bg: "bg-red-500/10" },
    { title: "신고 대기", value: stats.waitingReports, icon: AlertTriangle, color: "text-rose-500", bg: "bg-rose-500/10" },
    { title: "정지 회원", value: stats.suspendedUsers, icon: UserX, color: "text-purple-500", bg: "bg-purple-500/10" },
    { title: "잠금 회원", value: stats.lockedUsers, icon: Lock, color: "text-zinc-500", bg: "bg-zinc-500/10" },
  ];

  return (
    <div className="space-y-6">
      {/* 1. KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <div key={idx} className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] p-5 rounded-xl flex items-center justify-between shadow-sm">
              <div>
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">{card.title}</p>
                <h3 className="text-2xl font-black mt-1 text-zinc-800 dark:text-white">{card.value.toLocaleString()}</h3>
              </div>
              <div className={`p-3 rounded-lg ${card.bg} ${card.color}`}>
                <Icon className="w-5 h-5" />
              </div>
            </div>
          );
        })}
      </div>

      {/* 2. DAU/MAU Sub-grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { title: "활성 회원", value: stats.activeUsers },
          { title: "탈퇴 회원", value: stats.withdrawnUsers },
          { title: "DAU (일일 활성)", value: stats.dau },
          { title: "MAU (월간 활성)", value: stats.mau },
        ].map((item, idx) => (
          <div key={idx} className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] px-5 py-4 rounded-xl flex items-center justify-between shadow-sm border-l-4 border-brand-green-500">
            <span className="text-xs font-semibold text-zinc-400">{item.title}</span>
            <span className="text-lg font-black text-zinc-800 dark:text-white">{item.value.toLocaleString()}</span>
          </div>
        ))}
      </div>

      {/* 3. Recharts Statistical Area Chart */}
      <div className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] p-5 rounded-xl shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-brand-green-500" />
          <h4 className="font-bold text-sm text-zinc-800 dark:text-white">주간 활성 트렌드분석</h4>
        </div>
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={graphData}>
              <defs>
                <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2f5c40" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#2f5c40" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#30363d" opacity={0.3} />
              <XAxis dataKey="name" stroke="#8b949e" fontSize={11} />
              <YAxis stroke="#8b949e" fontSize={11} />
              <Tooltip contentStyle={{ background: "#161b22", borderColor: "#30363d", color: "#fff" }} />
              <Area type="monotone" dataKey="가입자" stroke="#2f5c40" fillOpacity={1} fill="url(#colorUsers)" strokeWidth={2} />
              <Area type="monotone" dataKey="게시글" stroke="#a3792f" fillOpacity={0} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 4. Bottom Grid split */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Side: Recent Reports */}
        <div className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] p-5 rounded-xl shadow-sm flex flex-col">
          <h4 className="font-bold text-sm text-zinc-800 dark:text-white border-b border-zinc-200 dark:border-[#30363d] pb-3 mb-3">최근 접수된 신고</h4>
          <div className="space-y-3 flex-1">
            {recentReports.length === 0 ? (
              <p className="text-xs text-zinc-400 py-8 text-center">신고 내역이 없습니다.</p>
            ) : (
              recentReports.map(rep => (
                <div key={rep.id} className="flex items-center justify-between text-xs p-3 rounded-lg bg-zinc-50 dark:bg-[#0e1117]/50 border border-zinc-150 dark:border-[#30363d]/50">
                  <div>
                    <span className="font-bold text-zinc-800 dark:text-zinc-200">[{rep.targetType === "post" ? "게시글" : "댓글"}] {rep.reporter || "익명"}</span>
                    <p className="text-[10px] text-zinc-400 mt-1">사유: {rep.reason || "기타"} - {rep.text || "상세 사유 없음"}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    rep.status === "waiting" || rep.status === "Pending" ? "bg-red-500/10 text-red-500" : "bg-zinc-500/10 text-zinc-400"
                  }`}>
                    {rep.status === "waiting" || rep.status === "Pending" ? "대기중" : "처리됨"}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Side: Recent Users */}
        <div className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] p-5 rounded-xl shadow-sm flex flex-col">
          <h4 className="font-bold text-sm text-zinc-800 dark:text-white border-b border-zinc-200 dark:border-[#30363d] pb-3 mb-3">최근 가입한 회원</h4>
          <div className="space-y-3 flex-1">
            {recentUsers.length === 0 ? (
              <p className="text-xs text-zinc-400 py-8 text-center">최근 가입한 사용자가 없습니다.</p>
            ) : (
              recentUsers.map(u => (
                <div key={u.id} className="flex items-center justify-between text-xs p-3 rounded-lg bg-zinc-50 dark:bg-[#0e1117]/50 border border-zinc-150 dark:border-[#30363d]/50 cursor-pointer hover:border-brand-green-500" onClick={() => navigateToUser(u.id)}>
                  <div>
                    <span className="font-bold text-zinc-800 dark:text-zinc-200">{u.name || "플레이터"}</span>
                    <p className="text-[10px] text-zinc-400 mt-1">이메일: {u.email || "-"}</p>
                  </div>
                  <span className="text-[10px] text-zinc-400">{u.createdAt ? u.createdAt.split("T")[0] : "-"}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 5. Sub-notices / Audit logs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Notices */}
        <div className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] p-5 rounded-xl shadow-sm">
          <h4 className="font-bold text-sm text-zinc-800 dark:text-white border-b border-zinc-200 dark:border-[#30363d] pb-3 mb-3">최근 등록 공지</h4>
          <div className="space-y-3">
            {recentNotices.length === 0 ? (
              <p className="text-xs text-zinc-400 py-8 text-center">등록된 공지가 없습니다.</p>
            ) : (
              recentNotices.map(notice => (
                <div key={notice.id} className="flex items-center justify-between text-xs p-2.5">
                  <span className="text-zinc-800 dark:text-zinc-200 truncate max-w-[70%]">{notice.title}</span>
                  <span className="text-[10px] text-zinc-400">{notice.createdAt ? notice.createdAt.split("T")[0] : "-"}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Actions Logs */}
        <div className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] p-5 rounded-xl shadow-sm">
          <h4 className="font-bold text-sm text-zinc-800 dark:text-white border-b border-zinc-200 dark:border-[#30363d] pb-3 mb-3">최근 관리자 활동 내역</h4>
          <div className="space-y-3">
            {recentLogs.length === 0 ? (
              <p className="text-xs text-zinc-400 py-8 text-center">활동 내역이 없습니다.</p>
            ) : (
              recentLogs.map(log => (
                <div key={log.id} className="text-xs p-2.5 bg-zinc-50 dark:bg-[#0e1117]/30 border-l-2 border-brand-green-500">
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200">[{log.action}]</span> {log.detail}
                  <p className="text-[9px] text-zinc-400 mt-1">{log.createdAt}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
