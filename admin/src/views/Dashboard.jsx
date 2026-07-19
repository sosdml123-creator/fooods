import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import { collection, query, orderBy, limit, onSnapshot, getDocs, doc, setDoc, updateDoc, increment } from "firebase/firestore";
import {
  Users, UserPlus, FileText, MessageSquare,
  Flag, AlertTriangle, UserX, Lock, TrendingUp, Eye
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend
} from "recharts";

function getDatesInRange(days) {
  const dates = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}

async function recordTodayVisit() {
  const today = new Date().toISOString().split("T")[0];
  const ref = doc(db, "dailyStats", today);
  try {
    await setDoc(ref, {
      date: today,
      visitors: increment(1),
      lastUpdated: new Date().toISOString(),
    }, { merge: true });
  } catch (err) {
    console.error("dailyStats 기록 실패:", err);
  }
}

export default function Dashboard({ navigateToUser }) {
  const [stats, setStats] = useState({
    totalUsers: 0, todayUsers: 0, todayPosts: 0, todayComments: 0,
    todayReports: 0, waitingReports: 0, suspendedUsers: 0,
    lockedUsers: 0, withdrawnUsers: 0, activeUsers: 0,
  });

  const [recentReports, setRecentReports] = useState([]);
  const [recentUsers, setRecentUsers] = useState([]);
  const [recentNotices, setRecentNotices] = useState([]);
  const [recentLogs, setRecentLogs] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [chartLoading, setChartLoading] = useState(true);

  // 오늘 방문자 기록 (관리자 접속 시)
  useEffect(() => {
    recordTodayVisit();
    loadChartData();
  }, []);

  async function loadChartData() {
    setChartLoading(true);
    try {
      const dates = getDatesInRange(14);
      const buckets = {};
      dates.forEach(d => { buckets[d] = { date: d.slice(5), 가입자: 0, 게시글: 0, 신고: 0, 방문자: 0 }; });

      // 가입자
      const usersSnap = await getDocs(collection(db, "users"));
      usersSnap.forEach(doc => {
        const d = doc.data().createdAt?.split("T")[0];
        if (d && buckets[d]) buckets[d].가입자++;
      });

      // 게시글
      const postsSnap = await getDocs(collection(db, "posts"));
      postsSnap.forEach(doc => {
        const d = doc.data().createdAt?.split("T")[0];
        if (d && buckets[d]) buckets[d].게시글++;
      });

      // 신고
      const reportsSnap = await getDocs(collection(db, "reports"));
      reportsSnap.forEach(doc => {
        const d = doc.data().createdAt?.split("T")[0];
        if (d && buckets[d]) buckets[d].신고++;
      });

      // 방문자 (dailyStats)
      const dailySnap = await getDocs(collection(db, "dailyStats"));
      dailySnap.forEach(doc => {
        if (buckets[doc.id]) buckets[doc.id].방문자 = doc.data().visitors || 0;
      });

      setChartData(Object.values(buckets));
    } catch (err) {
      console.error("Chart data load error:", err);
    } finally {
      setChartLoading(false);
    }
  }

  useEffect(() => {
    const todayStr = new Date().toISOString().split("T")[0];

    // 회원 통계
    const unsubUsers = onSnapshot(query(collection(db, "users")), (snap) => {
      const all = snap.docs.map(d => d.data());
      const todayUsers = all.filter(u => u.createdAt?.startsWith(todayStr)).length;
      const suspended = all.filter(u => u.status === "suspended" || u.status === "permanent_suspended").length;
      const locked = all.filter(u => u.status === "locked").length;
      const withdrawn = all.filter(u => u.status === "withdrawn" || u.status === "deleted").length;

      setStats(prev => ({
        ...prev,
        totalUsers: all.length,
        todayUsers,
        suspendedUsers: suspended,
        lockedUsers: locked,
        withdrawnUsers: withdrawn,
        activeUsers: all.length - suspended - withdrawn,
      }));

      const sortedUsers = [...snap.docs.map(d => ({ id: d.id, ...d.data() }))]
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
        .slice(0, 5);
      setRecentUsers(sortedUsers);
    });

    // 게시글
    const unsubPosts = onSnapshot(query(collection(db, "posts")), (snap) => {
      const todayCount = snap.docs.filter(d => d.data().createdAt?.startsWith(todayStr)).length;
      setStats(prev => ({ ...prev, todayPosts: todayCount }));
    });

    // 신고
    const unsubReports = onSnapshot(query(collection(db, "reports")), (snap) => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const todayCount = all.filter(r => r.createdAt?.startsWith(todayStr)).length;
      const waiting = all.filter(r => r.status === "waiting" || r.status === "Pending").length;
      setStats(prev => ({ ...prev, todayReports: todayCount, waitingReports: waiting }));
      setRecentReports(all.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 5));
    });

    // 공지사항
    const unsubNotices = onSnapshot(query(collection(db, "notices"), orderBy("createdAt", "desc"), limit(5)), (snap) => {
      setRecentNotices(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 관리자 로그
    const unsubLogs = onSnapshot(query(collection(db, "adminLogs"), orderBy("createdAt", "desc"), limit(5)), (snap) => {
      setRecentLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubUsers(); unsubPosts(); unsubReports(); unsubNotices(); unsubLogs(); };
  }, []);

  const cards = [
    { title: "전체 회원",  value: stats.totalUsers,      icon: Users,         color: "text-blue-500",    bg: "bg-blue-500/10" },
    { title: "오늘 가입",  value: stats.todayUsers,      icon: UserPlus,      color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { title: "오늘 게시글", value: stats.todayPosts,     icon: FileText,      color: "text-amber-500",   bg: "bg-amber-500/10" },
    { title: "오늘 신고",  value: stats.todayReports,    icon: Flag,          color: "text-red-500",     bg: "bg-red-500/10" },
    { title: "신고 대기",  value: stats.waitingReports,  icon: AlertTriangle, color: "text-rose-500",    bg: "bg-rose-500/10" },
    { title: "정지 회원",  value: stats.suspendedUsers,  icon: UserX,         color: "text-purple-500",  bg: "bg-purple-500/10" },
    { title: "잠금 회원",  value: stats.lockedUsers,     icon: Lock,          color: "text-zinc-500",    bg: "bg-zinc-500/10" },
    { title: "활성 회원",  value: stats.activeUsers,     icon: UserPlus,      color: "text-cyan-500",    bg: "bg-cyan-500/10" },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <div key={idx} className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] p-5 rounded-xl flex items-center justify-between shadow-sm hover:shadow-md transition-shadow">
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

      {/* 14일 트렌드 차트 (실제 Firestore 데이터) */}
      <div className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] p-5 rounded-xl shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-brand-green-500" />
          <h4 className="font-bold text-sm text-zinc-800 dark:text-white">최근 14일 활동 트렌드 (실제 데이터)</h4>
        </div>
        {chartLoading ? (
          <div className="flex items-center justify-center h-[240px]">
            <div className="w-6 h-6 border-4 border-brand-green-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="gU" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2f5c40" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#2f5c40" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="gP" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a3792f" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#a3792f" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#30363d" opacity={0.3} />
                <XAxis dataKey="date" stroke="#8b949e" fontSize={10} />
                <YAxis stroke="#8b949e" fontSize={10} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "#161b22", borderColor: "#30363d", color: "#fff", fontSize: 11 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="가입자" stroke="#2f5c40" fill="url(#gU)" strokeWidth={2} />
                <Area type="monotone" dataKey="게시글" stroke="#a3792f" fill="url(#gP)" strokeWidth={2} />
                <Area type="monotone" dataKey="신고" stroke="#b3452c" fill="none" strokeWidth={2} strokeDasharray="4 2" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* 최근 신고 & 최근 가입 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] p-5 rounded-xl shadow-sm">
          <h4 className="font-bold text-sm text-zinc-800 dark:text-white border-b border-zinc-200 dark:border-[#30363d] pb-3 mb-3">최근 접수된 신고</h4>
          <div className="space-y-2">
            {recentReports.length === 0 ? (
              <p className="text-xs text-zinc-400 py-8 text-center">신고 내역이 없습니다.</p>
            ) : recentReports.map(rep => (
              <div key={rep.id} className="flex items-center justify-between text-xs p-3 rounded-lg bg-zinc-50 dark:bg-[#0e1117]/50 border border-zinc-150 dark:border-[#30363d]/50">
                <div>
                  <span className="font-bold text-zinc-800 dark:text-zinc-200">
                    [{rep.targetType === "post" ? "게시글" : "댓글"}] {rep.reporter || "익명"}
                  </span>
                  <p className="text-[10px] text-zinc-400 mt-0.5">사유: {rep.reason || "기타"}</p>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  rep.status === "waiting" || rep.status === "Pending"
                    ? "bg-red-500/10 text-red-500"
                    : "bg-zinc-500/10 text-zinc-400"
                }`}>
                  {rep.status === "waiting" || rep.status === "Pending" ? "대기중" : "처리됨"}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] p-5 rounded-xl shadow-sm">
          <h4 className="font-bold text-sm text-zinc-800 dark:text-white border-b border-zinc-200 dark:border-[#30363d] pb-3 mb-3">최근 가입한 회원</h4>
          <div className="space-y-2">
            {recentUsers.length === 0 ? (
              <p className="text-xs text-zinc-400 py-8 text-center">최근 가입한 사용자가 없습니다.</p>
            ) : recentUsers.map(u => {
              const isToday = u.createdAt?.startsWith(new Date().toISOString().split("T")[0]);
              return (
                <div
                  key={u.id}
                  className="flex items-center justify-between text-xs p-3 rounded-lg bg-zinc-50 dark:bg-[#0e1117]/50 border border-zinc-150 dark:border-[#30363d]/50 cursor-pointer hover:border-brand-green-500 transition-colors"
                  onClick={() => navigateToUser(u.id)}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-zinc-200 dark:bg-[#30363d] overflow-hidden flex items-center justify-center flex-shrink-0">
                      {u.avatarImg ? (
                        <img src={u.avatarImg} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="font-bold text-zinc-500 text-xs">{u.name?.[0] || "?"}</span>
                      )}
                    </div>
                    <div>
                      <span className="font-bold text-zinc-800 dark:text-zinc-200">{u.name || "플레이터"}</span>
                      <p className="text-[10px] text-zinc-400">{u.email || "-"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isToday && <span className="text-[9px] bg-emerald-500/10 text-emerald-500 font-bold px-1.5 py-0.5 rounded">오늘</span>}
                    <span className="text-[10px] text-zinc-400">{u.createdAt ? u.createdAt.split("T")[0] : "-"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 공지사항 & 관리자 로그 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] p-5 rounded-xl shadow-sm">
          <h4 className="font-bold text-sm text-zinc-800 dark:text-white border-b border-zinc-200 dark:border-[#30363d] pb-3 mb-3">최근 등록 공지</h4>
          <div className="space-y-2">
            {recentNotices.length === 0 ? (
              <p className="text-xs text-zinc-400 py-8 text-center">등록된 공지가 없습니다.</p>
            ) : recentNotices.map(notice => (
              <div key={notice.id} className="flex items-center justify-between text-xs p-2.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-[#0e1117]/30 transition-colors">
                <span className="text-zinc-800 dark:text-zinc-200 truncate max-w-[70%]">{notice.title}</span>
                <span className="text-[10px] text-zinc-400 flex-shrink-0">{notice.createdAt ? notice.createdAt.split("T")[0] : "-"}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] p-5 rounded-xl shadow-sm">
          <h4 className="font-bold text-sm text-zinc-800 dark:text-white border-b border-zinc-200 dark:border-[#30363d] pb-3 mb-3">최근 관리자 활동</h4>
          <div className="space-y-2">
            {recentLogs.length === 0 ? (
              <p className="text-xs text-zinc-400 py-8 text-center">활동 내역이 없습니다.</p>
            ) : recentLogs.map(log => (
              <div key={log.id} className="text-xs p-2.5 bg-zinc-50 dark:bg-[#0e1117]/30 border-l-2 border-brand-green-500 rounded-r">
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">[{log.action}]</span> {log.detail}
                <p className="text-[9px] text-zinc-400 mt-1">{log.createdAt?.replace("T", " ").slice(0, 16)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
