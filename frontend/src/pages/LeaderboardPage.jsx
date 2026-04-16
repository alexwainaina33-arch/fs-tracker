// src/pages/admin/LeaderboardPage.jsx
// Live sales leaderboard with target progress, trophy icons, real-time refresh

import React, { useState } from "react";
import { useLeaderboard, daysRemainingInMonth, monthProgress, getMonthOptions } from "../hooks/useTargets";
import { currentMonth, formatKES } from "../hooks/useOrders";
import { exportLeaderboardReport, buildLeaderboardShareText, shareViaWhatsApp } from "../lib/reportExport";
import { Btn } from "../components/ui/Btn";
import { Select } from "../components/ui/Input";
import {
  Trophy, TrendingUp, Target, Download, Share2, RefreshCw,
  Calendar, Award, Users, ChevronDown, Flame
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

const MEDAL = ["🥇", "🥈", "🥉"];

function getPctColor(pct) {
  if (pct >= 100) return "#00c096";
  if (pct >= 70) return "#c8f230";
  if (pct >= 40) return "#ffab00";
  return "#ff4d4f";
}

function getPctBg(pct) {
  if (pct >= 100) return "bg-[#00c096]/10 border-[#00c096]/20";
  if (pct >= 70) return "bg-[#c8f230]/10 border-[#c8f230]/20";
  if (pct >= 40) return "bg-[#ffab00]/10 border-[#ffab00]/20";
  return "bg-[#ff4d4f]/10 border-[#ff4d4f]/20";
}

function ProgressBar({ pct, color }) {
  const capped = Math.min(pct, 100);
  return (
    <div className="w-full h-1.5 bg-[#21272f] rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${capped}%`, backgroundColor: color }}
      />
    </div>
  );
}

function LeaderRow({ row, rank, expanded, onToggle }) {
  const color = getPctColor(row.pct);
  const isTop3 = rank <= 3;

  return (
    <div
      className={`border rounded-2xl overflow-hidden transition-all cursor-pointer ${
        isTop3
          ? `border-[${color}]/30 bg-gradient-to-r from-[#111418] to-[#0a0d0f]`
          : "border-[#21272f] bg-[#111418]"
      }`}
      onClick={onToggle}
    >
      <div className="flex items-center gap-3 p-4">
        {/* Rank */}
        <div className="w-10 flex-shrink-0 text-center">
          {rank <= 3 ? (
            <span className="text-2xl">{MEDAL[rank - 1]}</span>
          ) : (
            <span className="text-lg font-bold text-[#4a5568]">#{rank}</span>
          )}
        </div>

        {/* Avatar */}
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
          style={{ backgroundColor: `${color}20`, color, border: `1px solid ${color}40` }}
        >
          {row.staffName[0]?.toUpperCase()}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-white text-sm truncate">{row.staffName}</p>
            {row.pct >= 100 && <Flame size={13} className="text-[#ff4d4f] flex-shrink-0" />}
          </div>
          <p className="text-[10px] text-[#8b95a1] truncate">{row.county || "—"}</p>
          <div className="mt-1.5">
            <ProgressBar pct={row.pct} color={color} />
          </div>
        </div>

        {/* Stats */}
        <div className="flex-shrink-0 text-right">
          <p className="font-bold text-sm" style={{ color }}>{formatKES(row.achievedAmount)}</p>
          {row.targetAmount > 0 ? (
            <p className="text-[10px] text-[#8b95a1]">of {formatKES(row.targetAmount)}</p>
          ) : (
            <p className="text-[10px] text-[#4a5568]">no target set</p>
          )}
          <p
            className={`text-xs font-bold mt-0.5 px-1.5 py-0.5 rounded-lg inline-block border ${getPctBg(row.pct)}`}
            style={{ color }}
          >
            {row.pct}%
          </p>
        </div>

        <ChevronDown
          size={14}
          className={`text-[#4a5568] flex-shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </div>

      {/* Expanded: category breakdown */}
      {expanded && (
        <div className="border-t border-[#21272f] px-4 py-3 bg-[#0a0d0f]/50">
          <div className="grid grid-cols-2 gap-2">
            {["distributor", "stockist", "agrovet", "farmer"].map((cat) => {
              const achieved = row.byCategory?.[cat] ?? 0;
              const target = row.categoryTargets?.[cat] ?? 0;
              const catPct = target > 0 ? Math.round((achieved / target) * 100) : 0;
              return (
                <div key={cat} className="bg-[#111418] rounded-xl p-2.5">
                  <p className="text-[10px] text-[#8b95a1] capitalize mb-1">{cat}</p>
                  <p className="text-xs font-bold text-white">{formatKES(achieved)}</p>
                  {target > 0 && (
                    <>
                      <p className="text-[10px] text-[#4a5568]">of {formatKES(target)}</p>
                      <ProgressBar pct={catPct} color={getPctColor(catPct)} />
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-3 mt-2 pt-2 border-t border-[#21272f]">
            <span className="text-xs text-[#8b95a1]">Total Orders: <span className="text-white font-medium">{row.totalOrders}</span></span>
            {row.gap > 0 && (
              <span className="text-xs text-[#ffab00]">Gap: {formatKES(row.gap)}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function LeaderboardPage() {
  const navigate = useNavigate();
  const monthOptions = getMonthOptions(6);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth());
  const [expandedRow, setExpandedRow] = useState(null);
  const [exportLoading, setExportLoading] = useState(false);

  const { leaderboard, isLoading } = useLeaderboard(selectedMonth);
  const daysLeft = daysRemainingInMonth();
  const mProgress = monthProgress();

  const totalAchieved = leaderboard.reduce((s, r) => s + r.achievedAmount, 0);
  const totalTarget = leaderboard.reduce((s, r) => s + r.targetAmount, 0);
  const teamPct = totalTarget > 0 ? Math.round((totalAchieved / totalTarget) * 100) : 0;
  const hitting = leaderboard.filter((r) => r.pct >= 100).length;

  const handleExport = async (fmt) => {
    setExportLoading(true);
    try {
      await exportLeaderboardReport({ leaderboard, month: selectedMonth, fmt });
    } catch (e) {
      toast.error("Export failed");
    } finally {
      setExportLoading(false);
    }
  };

  const handleShare = () => {
    const text = buildLeaderboardShareText(leaderboard, selectedMonth);
    shareViaWhatsApp(text);
  };

  return (
    <div className="p-5 max-w-3xl mx-auto space-y-5 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-2xl text-white flex items-center gap-2">
            <Trophy size={22} className="text-[#c8f230]" /> Leaderboard
          </h1>
          <p className="text-[#8b95a1] text-sm mt-0.5">{leaderboard.length} staff ranked</p>
        </div>
        <div className="flex gap-2">
          <Btn variant="ghost" size="sm" onClick={() => navigate("/targets")}>
            <Target size={14} /> Targets
          </Btn>
        </div>
      </div>

      {/* Month selector + export */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <Select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
          >
            {monthOptions.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </Select>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleExport("pdf")}
            disabled={exportLoading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#111418] border border-[#21272f] text-[#8b95a1] hover:text-white text-xs font-medium transition-colors"
          >
            <Download size={12} /> PDF
          </button>
          <button
            onClick={() => handleExport("excel")}
            disabled={exportLoading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#111418] border border-[#21272f] text-[#8b95a1] hover:text-white text-xs font-medium transition-colors"
          >
            <Download size={12} /> Excel
          </button>
          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#25D366]/15 border border-[#25D366]/30 text-[#25D366] text-xs font-medium hover:bg-[#25D366]/25 transition-colors"
          >
            <Share2 size={12} /> Share
          </button>
        </div>
      </div>

      {/* Month countdown */}
      {selectedMonth === currentMonth() && (
        <div className="bg-[#111418] border border-[#21272f] rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-[#c8f230]" />
              <span className="text-sm font-medium text-white">Month Progress</span>
            </div>
            <span className="text-sm font-bold text-[#ffab00]">{daysLeft} days left</span>
          </div>
          <div className="w-full h-2 bg-[#21272f] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#c8f230] rounded-full transition-all duration-500"
              style={{ width: `${mProgress}%` }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-[#4a5568]">Day 1</span>
            <span className="text-[10px] text-[#8b95a1] font-mono">{mProgress}% of month elapsed</span>
            <span className="text-[10px] text-[#4a5568]">Day 31</span>
          </div>
        </div>
      )}

      {/* Team summary */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Team Target",   value: formatKES(totalTarget),    color: "text-[#8b95a1]" },
          { label: "Achieved",      value: formatKES(totalAchieved),  color: "text-[#c8f230]" },
          { label: "Team %",        value: `${teamPct}%`,             color: getPctColor(teamPct) },
          { label: "Hitting Target",value: `${hitting}/${leaderboard.length}`, color: "text-[#00c096]" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-[#111418] border border-[#21272f] rounded-2xl p-3 text-center">
            <p className={`font-bold text-sm ${color}`} style={{ color: color.startsWith("#") ? color : undefined }}>{value}</p>
            <p className="text-[10px] text-[#8b95a1] mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Team progress bar */}
      {totalTarget > 0 && (
        <div className="bg-[#111418] border border-[#21272f] rounded-2xl p-4">
          <div className="flex justify-between mb-2">
            <span className="text-sm text-white font-medium">Team Achievement</span>
            <span className="text-sm font-bold" style={{ color: getPctColor(teamPct) }}>{teamPct}%</span>
          </div>
          <div className="w-full h-3 bg-[#21272f] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{ width: `${Math.min(teamPct, 100)}%`, backgroundColor: getPctColor(teamPct) }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-[#4a5568]">{formatKES(totalAchieved)}</span>
            <span className="text-[10px] text-[#4a5568]">{formatKES(totalTarget)}</span>
          </div>
        </div>
      )}

      {/* Leaderboard */}
      <div className="space-y-2">
        {isLoading && (
          <div className="py-16 text-center text-[#8b95a1] text-sm">
            <RefreshCw size={24} className="mx-auto mb-2 animate-spin opacity-40" />
            Loading leaderboard…
          </div>
        )}

        {!isLoading && leaderboard.length === 0 && (
          <div className="py-16 text-center text-[#8b95a1]">
            <Trophy size={40} className="mx-auto mb-3 opacity-20" />
            <p className="font-medium text-white">No data yet</p>
            <p className="text-sm mt-1">Set targets and submit orders to see rankings</p>
            <Btn className="mt-4" onClick={() => navigate("/targets")}>
              <Target size={14} /> Set Targets
            </Btn>
          </div>
        )}

        {leaderboard.map((row, i) => (
          <LeaderRow
            key={row.staffId}
            row={row}
            rank={i + 1}
            expanded={expandedRow === row.staffId}
            onToggle={() => setExpandedRow((prev) => (prev === row.staffId ? null : row.staffId))}
          />
        ))}
      </div>

      {/* Legend */}
      {leaderboard.length > 0 && (
        <div className="flex gap-3 flex-wrap text-[10px] text-[#8b95a1]">
          {[
            { color: "#00c096", label: "≥100% (Target Hit)" },
            { color: "#c8f230", label: "70–99%" },
            { color: "#ffab00", label: "40–69%" },
            { color: "#ff4d4f", label: "<40%" },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
              {label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
