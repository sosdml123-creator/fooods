import React, { useState } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from "recharts";
import { BarChart3, TrendingUp, Compass, Search } from "lucide-react";

// Mock datasets for statistics
const DATA_7_DAYS = [
  { day: "07/06", 가입자: 12, 게시글: 24, 댓글: 64, 신고: 2 },
  { day: "07/07", 가입자: 19, 게시글: 32, 댓글: 88, 신고: 4 },
  { day: "07/08", 가입자: 15, 게시글: 28, 댓글: 75, 신고: 1 },
  { day: "07/09", 가입자: 22, 게시글: 45, 댓글: 110, 신고: 5 },
  { day: "07/10", 가입자: 30, 게시글: 58, 댓글: 145, 신고: 3 },
  { day: "07/11", 가입자: 25, 게시글: 51, 댓글: 120, 신고: 0 },
  { day: "오늘", 가입자: 28, 게시글: 64, 댓글: 152, fontStyle: "bold", 신고: 2 },
];

const DATA_30_DAYS = [
  { day: "W1", 가입자: 84, 게시글: 180, 댓글: 450, 신고: 12 },
  { day: "W2", 가입자: 110, 게시글: 240, 댓글: 620, 신고: 15 },
  { day: "W3", 가입자: 135, 게시글: 290, 댓글: 810, 신고: 9 },
  { day: "W4", 가입자: 168, 게시글: 345, 댓글: 940, 신고: 18 },
];

const FOODS_DATA = [
  { name: "비빔밥", value: 342, color: "#2f5c40" },
  { name: "삼겹살", value: 284, color: "#a3792f" },
  { name: "김치찌개", value: 210, color: "#b3452c" },
  { name: "떡볶이", value: 185, color: "#4f46e5" },
  { name: "치킨", value: 154, color: "#06b6d4" },
];

const KEYWORDS_DATA = [
  { name: "다이어트 식단", value: 942 },
  { name: "쉬운 집밥", value: 731 },
  { name: "초간단 레시피", value: 654 },
  { name: "자취 요리", value: 589 },
  { name: "에어프라이어", value: 432 },
];

export default function Statistics() {
  const [period, setPeriod] = useState("7days"); // "7days", "30days"
  const chartData = period === "7days" ? DATA_7_DAYS : DATA_30_DAYS;

  return (
    <div className="space-y-6">
      {/* Period Selection Controls */}
      <div className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] p-4 rounded-xl shadow-sm flex items-center justify-between flex-wrap gap-4">
        <h4 className="font-bold text-sm text-zinc-800 dark:text-white">통계 분석 대시보드</h4>
        <div className="flex gap-1.5 text-xs font-bold">
          <button 
            onClick={() => setPeriod("7days")}
            className={`px-3.5 py-1.5 rounded-lg border ${
              period === "7days" 
                ? "bg-[#21262d] text-white border-[#30363d]" 
                : "border-zinc-300 dark:border-[#30363d] text-zinc-500 hover:text-white"
            }`}
          >
            최근 7일
          </button>
          <button 
            onClick={() => setPeriod("30days")}
            className={`px-3.5 py-1.5 rounded-lg border ${
              period === "30days" 
                ? "bg-[#21262d] text-white border-[#30363d]" 
                : "border-zinc-300 dark:border-[#30363d] text-zinc-500 hover:text-white"
            }`}
          >
            최근 30일
          </button>
        </div>
      </div>

      {/* Main Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. Registration & Post Curve */}
        <div className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] p-5 rounded-xl shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-zinc-150 dark:border-[#30363d] pb-3">
            <TrendingUp className="w-4.5 h-4.5 text-brand-green-500" />
            <h5 className="font-bold text-xs text-zinc-800 dark:text-white">가입 및 게시글 발행 동향</h5>
          </div>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2f5c40" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#2f5c40" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#30363d" opacity={0.2} />
                <XAxis dataKey="day" stroke="#8b949e" fontSize={10} />
                <YAxis stroke="#8b949e" fontSize={10} />
                <Tooltip contentStyle={{ background: "#161b22", borderColor: "#30363d", color: "#fff" }} />
                <Area type="monotone" dataKey="가입자" stroke="#2f5c40" fillOpacity={1} fill="url(#colorUsers)" strokeWidth={2} />
                <Area type="monotone" dataKey="게시글" stroke="#a3792f" fillOpacity={0} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 2. Comments & Reports Curve */}
        <div className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] p-5 rounded-xl shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-zinc-150 dark:border-[#30363d] pb-3">
            <BarChart3 className="w-4.5 h-4.5 text-brand-green-500" />
            <h5 className="font-bold text-xs text-zinc-800 dark:text-white">댓글 및 접수된 신고 동향</h5>
          </div>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#30363d" opacity={0.2} />
                <XAxis dataKey="day" stroke="#8b949e" fontSize={10} />
                <YAxis stroke="#8b949e" fontSize={10} />
                <Tooltip contentStyle={{ background: "#161b22", borderColor: "#30363d", color: "#fff" }} />
                <Area type="monotone" dataKey="댓글" stroke="#4f46e5" fillOpacity={0} strokeWidth={2} />
                <Area type="monotone" dataKey="신고" stroke="#b3452c" fillOpacity={0} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Popular Ranking Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Popular Food Items BarChart */}
        <div className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] p-5 rounded-xl shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-zinc-150 dark:border-[#30363d] pb-3">
            <Compass className="w-4.5 h-4.5 text-brand-green-500" />
            <h5 className="font-bold text-xs text-zinc-800 dark:text-white">가장 인기있는 요리/음식</h5>
          </div>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={FOODS_DATA} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#30363d" opacity={0.2} horizontal={false} />
                <XAxis type="number" stroke="#8b949e" fontSize={10} />
                <YAxis dataKey="name" type="category" stroke="#8b949e" fontSize={11} width={60} />
                <Tooltip contentStyle={{ background: "#161b22", borderColor: "#30363d", color: "#fff" }} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {FOODS_DATA.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Popular search keywords */}
        <div className="bg-white dark:bg-[#161b22] border border-zinc-200 dark:border-[#30363d] p-5 rounded-xl shadow-sm flex flex-col">
          <div className="flex items-center gap-2 border-b border-zinc-150 dark:border-[#30363d] pb-3 mb-4">
            <Search className="w-4.5 h-4.5 text-brand-green-500" />
            <h5 className="font-bold text-xs text-zinc-800 dark:text-white">인기 검색어 키워드 순위</h5>
          </div>

          <div className="space-y-3 flex-1">
            {KEYWORDS_DATA.map((keyword, idx) => (
              <div key={idx} className="flex justify-between items-center text-xs p-3 rounded-lg border border-zinc-150 dark:border-[#30363d] bg-zinc-50 dark:bg-[#0e1117]/35">
                <div className="flex items-center gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-brand-green-500/10 text-brand-green-500 font-black flex items-center justify-center scale-90">
                    {idx + 1}
                  </span>
                  <span className="font-bold text-zinc-800 dark:text-zinc-200">{keyword.name}</span>
                </div>
                <span className="text-zinc-400 font-semibold">{keyword.value.toLocaleString()} 회</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
