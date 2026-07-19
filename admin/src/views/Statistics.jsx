import React, { useState, useEffect } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell, LineChart, Line, Legend
} from "recharts";
import { BarChart3, TrendingUp, Users, Calendar, RefreshCw } from "lucide-react";
import { db } from "../firebase";
import { collection, query, onSnapshot, orderBy, getDocs } from "firebase/firestore";

function getDatesInRange(days) {
  const dates = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}

export default function Statistics() {
  const [period, setPeriod] = useState("14"); // "7", "14", "30"
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState([]);
  const [tagData, setTagData] = useState([]);
  const [summary, setSummary] = useState({ totalUsers: 0, totalPosts: 0, totalCommunity: 0, totalReports: 0 });

  useEffect(() => {
    loadStats();
  }, [period]);

  async function loadStats() {
    setLoading(true);
    try {
      const days = parseInt(period);
      const dates = getDatesInRange(days);

      // 날짜별 버킷 초기화
      const buckets = {};
      dates.forEach(d => {
        buckets[d] = { date: d, 가입자: 0, 게시글: 0, 커뮤니티: 0, 신고: 0 };
      });

      // 1. 가입자 집계
      const usersSnap = await getDocs(collection(db, "users"));
      let totalUsers = 0;
      usersSnap.forEach(doc => {
        totalUsers++;
        const data = doc.data();
        const dateStr = data.createdAt ? data.createdAt.split("T")[0] : null;
        if (dateStr && buckets[dateStr]) buckets[dateStr].가입자++;
      });

      // 2. 레시피 게시글 집계
      const postsSnap = await getDocs(collection(db, "posts"));
      let totalPosts = 0;
      const tagCount = {};
      postsSnap.forEach(doc => {
        totalPosts++;
        const data = doc.data();
        const dateStr = data.createdAt ? data.createdAt.split("T")[0] : null;
        if (dateStr && buckets[dateStr]) buckets[dateStr].게시글++;
        // 태그 집계
        if (Array.isArray(data.tags)) {
          data.tags.forEach(tag => {
            tagCount[tag] = (tagCount[tag] || 0) + 1;
          });
        }
      });

      // 3. 커뮤니티 게시글 집계
      const comSnap = await getDocs(collection(db, "community_posts"));
      let totalCommunity = 0;
      comSnap.forEach(doc => {
        totalCommunity++;
        const data = doc.data();
        const dateStr = data.createdAt ? data.createdAt.split("T")[0] : null;
        if (dateStr && buckets[dateStr]) buckets[dateStr].커뮤니티++;
      });

      // 4. 신고 집계
      const reportsSnap = await getDocs(collection(db, "reports"));
      let totalReports = 0;
      reportsSnap.forEach(doc => {
        totalReports++;
        const data = doc.data();
        const dateStr = data.createdAt ? data.createdAt.split("T")[0] : null;
        if (dateStr && buckets[dateStr]) buckets[dateStr].신고++;
      });

      // dailyStats 컬렉션에서 방문자 수 조회 (있으면 병합)
      const dailySnap = await getDocs(collection(db, "dailyStats"));
      dailySnap.forEach(doc => {
        const data = doc.data();
        const dateStr = doc.id; // YYYY-MM-DD
        if (buckets[dateStr]) {
          buckets[dateStr].방문자 = data.visitors || 0;
        }
      });

      const result = dates.map(d => ({
        date: d.slice(5), // MM-DD
        ...buckets[d],
      }));

      setChartData(result);
      setSummary({ totalUsers, totalPosts, totalCommunity, totalReports });

      // 태그 인기 순위
      const sortedTags = Object.entries(tagCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, value], idx) => ({ name, value, color: ["#2f5c40","#a3792f","#4f46e5","#06b6d4","#b3452c","#ec4899","#f59e0b","#10b981"][idx] }));
      setTagData(sortedTags);

    } catch (err) {
      console.error("Statistics load error:", err);
    } finally {
      setLoading(false);
    }
  }

  const COLORS = { 가입자: "#2f5c40", 게시글: "#a3792f", 커뮤니티: "#4f46e5", 신고: "#b3452c", 방문자: "#06b6d4" };

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] p-4 rounded-xl shadow-sm flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-brand-green-500" />
          <h4 className="font-bold text-sm text-zinc-800 dark:text-white">실시간 통계 분석</h4>
          <span className="text-[10px] text-zinc-400 ml-1">Firestore 실제 데이터</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5 text-xs font-bold">
            {["7","14","30"].map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3.5 py-1.5 rounded-lg border transition-colors ${
                  period === p
                    ? "bg-brand-green-500 text-white border-brand-green-500"
                    : "border-zinc-300 dark:border-[#30363d] text-zinc-500 hover:text-zinc-800 dark:hover:text-white"
                }`}
              >
                {p}일
              </button>
            ))}
          </div>
          <button
            onClick={loadStats}
            disabled={loading}
            className="p-2 rounded-lg border border-zinc-300 dark:border-[#30363d] text-zinc-500 hover:text-brand-green-500 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "전체 회원", value: summary.totalUsers, color: "text-blue-500", bg: "bg-blue-500/10" },
          { label: "전체 레시피", value: summary.totalPosts, color: "text-amber-500", bg: "bg-amber-500/10" },
          { label: "커뮤니티 글", value: summary.totalCommunity, color: "text-indigo-500", bg: "bg-indigo-500/10" },
          { label: "전체 신고", value: summary.totalReports, color: "text-red-500", bg: "bg-red-500/10" },
        ].map((item, idx) => (
          <div key={idx} className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] p-4 rounded-xl shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide">{item.label}</p>
              <h3 className="text-2xl font-black mt-1 text-zinc-800 dark:text-white">{item.value.toLocaleString()}</h3>
            </div>
            <div className={`p-3 rounded-lg ${item.bg} ${item.color}`}>
              <Users className="w-5 h-5" />
            </div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-brand-green-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : (
        <>
          {/* 가입자 & 게시글 추이 */}
          <div className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] p-5 rounded-xl shadow-sm">
            <div className="flex items-center gap-2 mb-4 border-b border-zinc-100 dark:border-[#30363d] pb-3">
              <TrendingUp className="w-4 h-4 text-brand-green-500" />
              <h5 className="font-bold text-xs text-zinc-800 dark:text-white">날짜별 가입자 · 게시글 · 커뮤니티 추이</h5>
            </div>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="gUsers" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2f5c40" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#2f5c40" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="gPosts" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a3792f" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#a3792f" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#30363d" opacity={0.2} />
                  <XAxis dataKey="date" stroke="#8b949e" fontSize={10} />
                  <YAxis stroke="#8b949e" fontSize={10} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "#161b22", borderColor: "#30363d", color: "#fff", fontSize: 11 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="가입자" stroke={COLORS.가입자} fill="url(#gUsers)" strokeWidth={2} />
                  <Area type="monotone" dataKey="게시글" stroke={COLORS.게시글} fill="url(#gPosts)" strokeWidth={2} />
                  <Area type="monotone" dataKey="커뮤니티" stroke={COLORS.커뮤니티} fill="none" strokeWidth={2} strokeDasharray="4 2" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 신고 추이 & 인기 태그 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 신고 추이 */}
            <div className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] p-5 rounded-xl shadow-sm">
              <div className="flex items-center gap-2 mb-4 border-b border-zinc-100 dark:border-[#30363d] pb-3">
                <BarChart3 className="w-4 h-4 text-red-500" />
                <h5 className="font-bold text-xs text-zinc-800 dark:text-white">날짜별 신고 접수 추이</h5>
              </div>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#30363d" opacity={0.2} />
                    <XAxis dataKey="date" stroke="#8b949e" fontSize={10} />
                    <YAxis stroke="#8b949e" fontSize={10} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: "#161b22", borderColor: "#30363d", color: "#fff", fontSize: 11 }} />
                    <Line type="monotone" dataKey="신고" stroke={COLORS.신고} strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 인기 태그 */}
            <div className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] p-5 rounded-xl shadow-sm">
              <div className="flex items-center gap-2 mb-4 border-b border-zinc-100 dark:border-[#30363d] pb-3">
                <Calendar className="w-4 h-4 text-brand-green-500" />
                <h5 className="font-bold text-xs text-zinc-800 dark:text-white">인기 태그 순위 (실제 레시피 데이터)</h5>
              </div>
              {tagData.length === 0 ? (
                <p className="text-xs text-zinc-400 text-center py-10">태그 데이터가 없습니다.</p>
              ) : (
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={tagData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#30363d" opacity={0.2} horizontal={false} />
                      <XAxis type="number" stroke="#8b949e" fontSize={10} allowDecimals={false} />
                      <YAxis dataKey="name" type="category" stroke="#8b949e" fontSize={10} width={70} />
                      <Tooltip contentStyle={{ background: "#161b22", borderColor: "#30363d", color: "#fff", fontSize: 11 }} />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                        {tagData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* 날짜별 상세 테이블 */}
          <div className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-zinc-200 dark:border-[#30363d]">
              <h5 className="font-bold text-xs text-zinc-800 dark:text-white">날짜별 상세 수치</h5>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-zinc-50 dark:bg-[#161b22]/30 border-b border-zinc-200 dark:border-[#30363d] text-zinc-400 uppercase tracking-wider font-semibold">
                    <th className="px-5 py-3">날짜</th>
                    <th className="px-5 py-3 text-blue-500">가입자</th>
                    <th className="px-5 py-3 text-amber-500">레시피</th>
                    <th className="px-5 py-3 text-indigo-500">커뮤니티</th>
                    <th className="px-5 py-3 text-red-500">신고</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-[#30363d]">
                  {[...chartData].reverse().map((row, idx) => (
                    <tr key={idx} className="hover:bg-zinc-50/50 dark:hover:bg-[#21262d]/25 transition-colors">
                      <td className="px-5 py-3 font-mono text-zinc-500 dark:text-zinc-400">{row.date}</td>
                      <td className="px-5 py-3 font-bold text-blue-500">{row.가입자}</td>
                      <td className="px-5 py-3 font-bold text-amber-500">{row.게시글}</td>
                      <td className="px-5 py-3 font-bold text-indigo-500">{row.커뮤니티}</td>
                      <td className="px-5 py-3 font-bold text-red-500">{row.신고}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
