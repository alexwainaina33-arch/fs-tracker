// src/pages/DashboardPage.jsx
// Command Center — real-time KPIs, smart insights, live clock, activity feed
// Different views for Admin/Manager vs Field Staff

import React, { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { pb } from "../lib/pb";
import { useAuth } from "../store/auth";
import { useLeaderboard, useMyTarget, daysRemainingInMonth, monthProgress } from "../hooks/useTargets";
import { currentMonth, formatKES, useOrdersSummary } from "../hooks/useOrders";
import { Badge } from "../components/ui/Badge";
import { format, isPast, differenceInMinutes, startOfDay, endOfDay } from "date-fns";
import { useNavigate } from "react-router-dom";
import {
  ShoppingCart, Clock, Receipt, Users, AlertTriangle,
  MapPin, TrendingUp, Target, Trophy,
  CheckCircle, XCircle, RefreshCcw, CreditCard,
  ArrowRight, Flame, AlertOctagon, Leaf,
  Navigation, Battery, ChevronRight,
  CheckSquare, Calendar, Zap, TrendingDown,
  Eye, Activity, Star,
} from "lucide-react";

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function minsAgo(d) {
  const m = differenceInMinutes(new Date(), new Date(d));
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// ─── LIVE CLOCK ───────────────────────────────────────────────────────────────
function LiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="text-right hidden sm:block">
      <p className="font-mono text-3xl font-bold text-white tabular-nums">
        {format(time, "HH:mm")}
        <span className="text-[#4a5568] text-xl">:{format(time, "ss")}</span>
      </p>
      <p className="text-[10px] text-[#4a5568]">EAT · UTC+3</p>
    </div>
  );
}

// ─── RING PROGRESS ────────────────────────────────────────────────────────────
function Ring({ pct, size = 56, stroke = 5, color = "#c8f230" }) {
  const r = (size - stroke * 2) / 2;
  const circ = 2 * Math.PI * r;
  const filled = circ * Math.min(pct, 100) / 100;
  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#21272f" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={`${filled} ${circ}`} strokeLinecap="round"
        style={{ transition: "stroke-dasharray 1.2s ease" }} />
    </svg>
  );
}

// ─── MINI BAR CHART ───────────────────────────────────────────────────────────
function MiniBarChart({ data, color = "#c8f230" }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex items-end gap-1 h-10">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
          <div className="w-full rounded-sm transition-all duration-700"
            style={{ height: `${Math.max((d.value / max) * 40, 2)}px`, backgroundColor: color + (i === data.length - 1 ? "ff" : "55") }} />
          <span className="text-[8px] text-[#4a5568] font-mono">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── KPI CARD ─────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub, color = "text-[#c8f230]", bg = "bg-[#c8f230]/10", onClick, badge, trend }) {
  return (
    <div onClick={onClick}
      className={`bg-[#111418] border border-[#21272f] rounded-2xl p-4 ${onClick ? "cursor-pointer hover:border-[#2d3748] hover:bg-[#13171c] transition-all" : ""}`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center`}>
          <Icon size={16} className={color} />
        </div>
        <div className="flex items-center gap-1">
          {trend !== undefined && (
            <span className={`text-[10px] flex items-center gap-0.5 font-medium ${trend >= 0 ? "text-[#00c096]" : "text-[#ff4d4f]"}`}>
              {trend >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
              {Math.abs(trend)}%
            </span>
          )}
          {badge > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#ff4d4f] text-white font-bold">{badge}</span>}
        </div>
      </div>
      <p className={`font-bold text-xl ${color}`}>{value}</p>
      <p className="text-xs text-[#8b95a1] mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-[#4a5568] mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── ALERT BANNER ─────────────────────────────────────────────────────────────
function AlertBanner({ icon: Icon, message, color, bg, border, onClick, pulse }) {
  return (
    <div onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${bg} ${border} ${onClick ? "cursor-pointer hover:opacity-90 transition-opacity" : ""}`}>
      <Icon size={14} className={`${color} ${pulse ? "animate-pulse" : ""}`} />
      <p className={`text-sm font-medium flex-1 ${color}`}>{message}</p>
      {onClick && <ChevronRight size={14} className={color} />}
    </div>
  );
}

// ─── SECTION WRAPPER ──────────────────────────────────────────────────────────
function Section({ title, icon: Icon, action, children }) {
  return (
    <div className="bg-[#111418] border border-[#21272f] rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#21272f]">
        <h2 className="font-display font-bold text-white text-sm flex items-center gap-2">
          <Icon size={14} className="text-[#c8f230]" /> {title}
        </h2>
        {action}
      </div>
      {children}
    </div>
  );
}

// ─── SMART INSIGHTS ENGINE ────────────────────────────────────────────────────
function SmartInsights({ liveLocations, todayAtt, pendingOrders, leaderboard, daysLeft, teamPct, collRate }) {
  const insights = useMemo(() => {
    const list = [];
    const now = new Date();
    const hour = now.getHours();

    // Idle staff detection
    const idleStaff = (liveLocations ?? []).filter(loc => {
      const att = (todayAtt?.items ?? []).find(a => a.user === loc.user);
      if (!att?.clock_in || att?.clock_out) return false;
      return differenceInMinutes(now, new Date(loc.recorded_at)) > 120 && hour >= 8 && hour <= 18;
    });
    if (idleStaff.length > 0) {
      list.push({
        type: "warn",
        icon: AlertOctagon,
        text: `${idleStaff.length} staff member${idleStaff.length > 1 ? "s have" : " has"} not moved in 2+ hours`,
        action: "/team-summary",
        color: "text-[#ff4d4f]",
        bg: "bg-[#ff4d4f]/10",
        border: "border-[#ff4d4f]/20",
      });
    }

    // No GPS clocked-in staff
    const clockedIn = (todayAtt?.items ?? []).filter(a => a.clock_in && !a.clock_out);
    const liveIds = new Set((liveLocations ?? []).map(l => l.user));
    const ghosted = clockedIn.filter(a => !liveIds.has(a.user));
    if (ghosted.length > 0) {
      list.push({
        type: "warn",
        icon: Zap,
        text: `${ghosted.length} clocked-in staff ${ghosted.length > 1 ? "have" : "has"} no GPS signal — GPS may be off`,
        action: "/team-summary",
        color: "text-[#ff9f43]",
        bg: "bg-[#ff9f43]/10",
        border: "border-[#ff9f43]/20",
      });
    }

    // Stale orders
    const staleOrders = (pendingOrders?.items ?? []).filter(o => {
      const submitted = new Date(o.submitted_at || o.created);
      return differenceInMinutes(now, submitted) > 60 * 24;
    });
    if (staleOrders.length > 0) {
      list.push({
        type: "warn",
        icon: ShoppingCart,
        text: `${staleOrders.length} order${staleOrders.length > 1 ? "s have" : " has"} been waiting approval for 24h+`,
        action: "/approvals",
        color: "text-[#ffab00]",
        bg: "bg-[#ffab00]/10",
        border: "border-[#ffab00]/20",
      });
    }

    // Pace insight
    if (daysLeft > 0 && teamPct < 100) {
      const daysInMonth = 30;
      const elapsed = daysInMonth - daysLeft;
      const expectedPct = Math.round((elapsed / daysInMonth) * 100);
      if (teamPct < expectedPct - 15) {
        list.push({
          type: "warn",
          icon: TrendingDown,
          text: `Team is ${expectedPct - teamPct}% behind expected pace — ${daysLeft} days to close the gap`,
          action: "/leaderboard",
          color: "text-[#ff9f43]",
          bg: "bg-[#ff9f43]/10",
          border: "border-[#ff9f43]/20",
        });
      } else if (teamPct >= expectedPct + 10) {
        list.push({
          type: "good",
          icon: Flame,
          text: `Team is ${teamPct - expectedPct}% ahead of pace — on track to smash this month's target 🔥`,
          action: "/leaderboard",
          color: "text-[#00c096]",
          bg: "bg-[#00c096]/10",
          border: "border-[#00c096]/20",
        });
      }
    }

    // Low collection rate
    if (collRate < 40 && collRate > 0) {
      list.push({
        type: "warn",
        icon: CreditCard,
        text: `Collection rate is ${collRate}% — follow up on outstanding balances`,
        action: "/advanced-reports",
        color: "text-[#ff4d4f]",
        bg: "bg-[#ff4d4f]/10",
        border: "border-[#ff4d4f]/20",
      });
    }

    // No staff on field morning check
    if (hour >= 8 && hour <= 10 && clockedIn.length === 0) {
      list.push({
        type: "warn",
        icon: Users,
        text: "No staff have clocked in yet — it's past 8am",
        action: "/attendance",
        color: "text-[#ff9f43]",
        bg: "bg-[#ff9f43]/10",
        border: "border-[#ff9f43]/20",
      });
    }

    // All good
    if (list.length === 0) {
      list.push({
        type: "good",
        icon: CheckCircle,
        text: "All systems normal — team is active and on track",
        color: "text-[#00c096]",
        bg: "bg-[#00c096]/10",
        border: "border-[#00c096]/20",
      });
    }

    return list.slice(0, 4);
  }, [liveLocations, todayAtt, pendingOrders, leaderboard, daysLeft, teamPct, collRate]);

  return (
    <div className="space-y-2">
      {insights.map((ins, i) => {
        const Icon = ins.icon;
        return (
          <AlertBanner
            key={i}
            icon={Icon}
            message={ins.text}
            color={ins.color}
            bg={ins.bg}
            border={ins.border}
            onClick={ins.action ? (() => window.location.hash = ins.action) : undefined}
            pulse={ins.type === "warn"}
          />
        );
      })}
    </div>
  );
}

// ─── REVENUE VELOCITY ─────────────────────────────────────────────────────────
function RevenueVelocity({ totalAchieved, totalTarget, daysLeft }) {
  const daysInMonth = 30;
  const daysElapsed = daysInMonth - daysLeft;
  const dailyRate   = daysElapsed > 0 ? totalAchieved / daysElapsed : 0;
  const projected   = dailyRate * daysInMonth;
  const projectedPct = totalTarget > 0 ? Math.round((projected / totalTarget) * 100) : 0;
  const needed      = totalTarget > 0 ? Math.max(0, (totalTarget - totalAchieved) / Math.max(daysLeft, 1)) : 0;
  const onTrack     = projected >= totalTarget;

  return (
    <div className="bg-[#111418] border border-[#21272f] rounded-2xl p-4 space-y-3">
      <p className="text-sm font-semibold text-white flex items-center gap-2">
        <Activity size={14} className="text-[#c8f230]" /> Revenue Velocity
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-[#0a0d0f] rounded-xl p-2.5">
          <p className="text-[10px] text-[#8b95a1]">Daily Rate</p>
          <p className="text-sm font-bold text-[#c8f230]">{formatKES(Math.round(dailyRate))}</p>
          <p className="text-[9px] text-[#4a5568]">per day so far</p>
        </div>
        <div className="bg-[#0a0d0f] rounded-xl p-2.5">
          <p className="text-[10px] text-[#8b95a1]">Projected</p>
          <p className={`text-sm font-bold ${onTrack ? "text-[#00c096]" : "text-[#ff9f43]"}`}>{projectedPct}%</p>
          <p className="text-[9px] text-[#4a5568]">of target by month end</p>
        </div>
        <div className="bg-[#0a0d0f] rounded-xl p-2.5">
          <p className="text-[10px] text-[#8b95a1]">Needed/Day</p>
          <p className={`text-sm font-bold ${needed <= dailyRate ? "text-[#00c096]" : "text-[#ff4d4f]"}`}>{formatKES(Math.round(needed))}</p>
          <p className="text-[9px] text-[#4a5568]">to hit target</p>
        </div>
        <div className="bg-[#0a0d0f] rounded-xl p-2.5">
          <p className="text-[10px] text-[#8b95a1]">Days Left</p>
          <p className="text-sm font-bold text-white">{daysLeft}</p>
          <p className="text-[9px] text-[#4a5568]">working days</p>
        </div>
      </div>
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium
        ${onTrack ? 'bg-[#00c096]/10 border-[#00c096]/20 text-[#00c096]' : 'bg-[#ff9f43]/10 border-[#ff9f43]/20 text-[#ff9f43]'}"
        style={{ background: onTrack ? "rgba(0,192,150,0.1)" : "rgba(255,171,0,0.1)", borderColor: onTrack ? "rgba(0,192,150,0.2)" : "rgba(255,171,0,0.2)", color: onTrack ? "#00c096" : "#ff9f43" }}>
        {onTrack ? <Flame size={12} /> : <AlertTriangle size={12} />}
        {onTrack
          ? `On track to hit ${projectedPct}% of target 🎯`
          : `Need ${formatKES(Math.round(needed))}/day to reach target`}
      </div>
    </div>
  );
}

// ─── ADMIN DASHBOARD ──────────────────────────────────────────────────────────
function AdminDashboard({ user }) {
  const navigate = useNavigate();
  const today    = format(new Date(), "yyyy-MM-dd");
  const month    = currentMonth();
  const { leaderboard } = useLeaderboard(month);

  const { data: pendingOrders } = useQuery({
    queryKey: ["dash-pending-orders"],
    queryFn: () => pb.collection("ft_orders").getList(1, 50, {
      filter: `status = "pending_approval"`, sort: "-submitted_at", expand: "staff",
    }),
    refetchInterval: 15000,
  });

  const { data: pendingPayments } = useQuery({
    queryKey: ["dash-pending-payments"],
    queryFn: () => pb.collection("ft_order_payments").getList(1, 50, {
      filter: `status = "pending"`, sort: "-created", expand: "recorded_by,order",
    }),
    refetchInterval: 15000,
  });

  const { data: todayAtt } = useQuery({
    queryKey: ["dash-att", today],
    queryFn: () => pb.collection("ft_attendance").getList(1, 200, {
      filter: `date = "${today}"`, expand: "user", sort: "-clock_in",
    }),
    refetchInterval: 20000,
  });

  const { data: activeStaff } = useQuery({
    queryKey: ["dash-active-staff"],
    queryFn: () => pb.collection("ft_users").getList(1, 1, {
      filter: `role = "field_staff" && status = "active"`,
    }),
  });

  const { data: pendingExpenses } = useQuery({
    queryKey: ["dash-pending-exp"],
    queryFn: () => pb.collection("ft_expenses").getList(1, 1, { filter: `status = "pending"` }),
    refetchInterval: 30000,
  });

  const { data: recentOrders } = useQuery({
    queryKey: ["dash-recent-orders"],
    queryFn: () => pb.collection("ft_orders").getList(1, 8, {
      sort: "-submitted_at", expand: "staff",
    }),
    refetchInterval: 15000,
  });

  const { data: liveLocations } = useQuery({
    queryKey: ["dash-live-locs"],
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const list = await pb.collection("ft_locations").getList(1, 200, {
        filter: `recorded_at >= "${since}"`, sort: "-recorded_at", expand: "user",
      });
      const latest = {};
      for (const loc of list.items) {
        if (!latest[loc.user]) latest[loc.user] = loc;
      }
      return Object.values(latest);
    },
    refetchInterval: 20000,
  });

  const { data: todayVisits } = useQuery({
    queryKey: ["dash-visits-today"],
    queryFn: () => pb.collection("ft_farmer_visits").getList(1, 200, {
      filter: `created >= "${startOfDay(new Date()).toISOString()}"`,
    }),
    refetchInterval: 60000,
  });

  const { data: weekOrders } = useQuery({
    queryKey: ["dash-week-orders"],
    queryFn: async () => {
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const label = format(d, "EEE")[0];
        const start = startOfDay(d).toISOString().replace("T", " ");
        const end   = endOfDay(d).toISOString().replace("T", " ");
        const res = await pb.collection("ft_orders").getList(1, 1, {
          filter: `submitted_at >= "${start}" && submitted_at <= "${end}"`,
        });
        days.push({ label, value: res.totalItems });
      }
      return days;
    },
    refetchInterval: 60000,
  });

  const { data: approvedOrders } = useQuery({
    queryKey: ["dash-coll-rate"],
    queryFn: async () => {
      const orders = await pb.collection("ft_orders").getFullList({
        filter: `status = "approved"`, fields: "id,order_amount",
      });
      if (!orders.length) return { rate: 0, paid: 0, total: 0 };
      const orderIds = orders.map(o => o.id);
      const batches = [];
      for (let i = 0; i < orderIds.length; i += 50) batches.push(orderIds.slice(i, i + 50));
      const allPayments = (await Promise.all(
        batches.map(b => pb.collection("ft_order_payments").getFullList({
          filter: b.map(id => `order = "${id}"`).join(" || ") + ` && status = "approved"`,
          fields: "amount",
        }))
      )).flat();
      const total = orders.reduce((s, o) => s + Number(o.order_amount || 0), 0);
      const paid  = allPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
      return { rate: total > 0 ? Math.round((paid / total) * 100) : 0, paid, total };
    },
    refetchInterval: 60000,
  });

  // ── Derived ────────────────────────────────────────────────────────────────
  const now                 = new Date();
  const onField             = todayAtt?.items.filter(a => a.clock_in && !a.clock_out).length ?? 0;
  const liveCount           = (liveLocations ?? []).filter(l => differenceInMinutes(now, new Date(l.recorded_at)) <= 10).length;
  const totalTarget         = leaderboard.reduce((s, r) => s + r.targetAmount, 0);
  const totalAchieved       = leaderboard.reduce((s, r) => s + r.achievedAmount, 0);
  const teamPct             = totalTarget > 0 ? Math.round((totalAchieved / totalTarget) * 100) : 0;
  const hitting             = leaderboard.filter(r => r.pct >= 100).length;
  const topPerformer        = leaderboard[0];
  const pendingOrderCount   = pendingOrders?.totalItems ?? 0;
  const pendingPaymentCount = pendingPayments?.totalItems ?? 0;
  const pendingExpCount     = pendingExpenses?.totalItems ?? 0;
  const daysLeft            = daysRemainingInMonth();
  const mProg               = monthProgress();
  const collRate            = approvedOrders?.rate ?? 0;

  // ── Staff not yet clocked in ───────────────────────────────────────────────
  const absentCount = Math.max(0, (activeStaff?.totalItems ?? 0) - (todayAtt?.items.length ?? 0));

  return (
    <div className="p-5 max-w-6xl mx-auto space-y-5 pb-8">

      {/* ── GREETING ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[#8b95a1] text-xs font-mono">{format(now, "EEEE, dd MMM yyyy")}</p>
          <h1 className="font-display font-bold text-2xl text-white mt-0.5">
            {greeting()},&nbsp;
            <span className="text-[#c8f230]">{user?.name?.split(" ")[0]}</span>
          </h1>
          <p className="text-[#8b95a1] text-xs mt-0.5">
            {onField} on field · {liveCount} live GPS · {daysLeft} days left in month
            {absentCount > 0 && (
              <span className="text-[#ff9f43] ml-2">· {absentCount} not clocked in</span>
            )}
          </p>
        </div>
        <LiveClock />
      </div>

      {/* ── SMART INSIGHTS ────────────────────────────────────────────────── */}
      <SmartInsights
        liveLocations={liveLocations}
        todayAtt={todayAtt}
        pendingOrders={pendingOrders}
        leaderboard={leaderboard}
        daysLeft={daysLeft}
        teamPct={teamPct}
        collRate={collRate}
      />

      {/* ── KPI GRID ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={Users}        label="On Field Today"    value={onField}
          sub={`of ${activeStaff?.totalItems ?? "?"} active staff`}
          color="text-[#00c096]" bg="bg-[#00c096]/10"
          onClick={() => navigate("/attendance")} />
        <KpiCard icon={ShoppingCart} label="Pending Orders"    value={pendingOrderCount}
          sub="need approval"
          color={pendingOrderCount > 0 ? "text-[#ffab00]" : "text-[#00c096]"}
          bg={pendingOrderCount > 0 ? "bg-[#ffab00]/10" : "bg-[#00c096]/10"}
          badge={pendingOrderCount > 0 ? pendingOrderCount : null}
          onClick={() => navigate("/approvals")} />
        <KpiCard icon={TrendingUp}   label="Team Achievement"  value={`${teamPct}%`}
          sub={`${formatKES(totalAchieved)} of ${formatKES(totalTarget)}`}
          color={teamPct >= 100 ? "text-[#00c096]" : teamPct >= 70 ? "text-[#c8f230]" : "text-[#ffab00]"}
          bg="bg-[#c8f230]/10"
          onClick={() => navigate("/leaderboard")} />
        <KpiCard icon={CreditCard}   label="Collection Rate"   value={`${collRate}%`}
          sub={`${formatKES(approvedOrders?.paid ?? 0)} collected`}
          color={collRate >= 80 ? "text-[#00c096]" : collRate >= 50 ? "text-[#c8f230]" : "text-[#ff4d4f]"}
          bg="bg-[#3b82f6]/10"
          onClick={() => navigate("/advanced-reports")} />
      </div>

      {/* ── MONTH + TEAM + VELOCITY ───────────────────────────────────────── */}
      <div className="grid lg:grid-cols-3 gap-4">

        {/* Month progress + bar chart */}
        <div className="bg-[#111418] border border-[#21272f] rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-white flex items-center gap-2">
              <Calendar size={14} className="text-[#c8f230]" /> {format(now, "MMMM yyyy")}
            </p>
            <span className="text-xs text-[#ffab00] font-bold">{daysLeft}d left</span>
          </div>
          <div className="h-2 bg-[#21272f] rounded-full overflow-hidden mb-1">
            <div className="h-full bg-[#c8f230] rounded-full" style={{ width: `${mProg}%`, transition: "width 1s" }} />
          </div>
          <p className="text-[10px] text-[#4a5568] mb-4">{mProg}% of month elapsed</p>
          {weekOrders && (
            <>
              <p className="text-[10px] text-[#8b95a1] uppercase tracking-wider mb-2">Orders — Last 7 Days</p>
              <MiniBarChart data={weekOrders} />
            </>
          )}
        </div>

        {/* Team ring */}
        <div className="bg-[#111418] border border-[#21272f] rounded-2xl p-4 flex flex-col items-center justify-center">
          <div className="relative">
            <Ring pct={teamPct} size={96} stroke={8}
              color={teamPct >= 100 ? "#00c096" : teamPct >= 70 ? "#c8f230" : teamPct >= 40 ? "#ffab00" : "#ff4d4f"} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-bold text-white">{teamPct}%</span>
            </div>
          </div>
          <p className="text-sm font-semibold text-white mt-3">Team Target</p>
          <p className="text-xs text-[#8b95a1]">{hitting}/{leaderboard.length} hitting target</p>
          <div className="grid grid-cols-3 gap-2 w-full mt-3">
            <div className="text-center bg-[#0a0d0f] rounded-xl p-2">
              <p className="text-[10px] text-[#8b95a1]">Achieved</p>
              <p className="text-xs font-bold text-[#c8f230]">{formatKES(totalAchieved)}</p>
            </div>
            <div className="text-center bg-[#0a0d0f] rounded-xl p-2">
              <p className="text-[10px] text-[#8b95a1]">Target</p>
              <p className="text-xs font-bold text-white">{formatKES(totalTarget)}</p>
            </div>
            <div className="text-center bg-[#0a0d0f] rounded-xl p-2">
              <p className="text-[10px] text-[#8b95a1]">Remaining</p>
              <p className={`text-xs font-bold ${totalAchieved >= totalTarget ? "text-[#00c096]" : "text-[#ff4d4f]"}`}>
                {totalAchieved >= totalTarget ? "✓ Done" : formatKES(totalTarget - totalAchieved)}
              </p>
            </div>
          </div>
        </div>

        {/* Today's pulse + top performer */}
        <div className="bg-[#111418] border border-[#21272f] rounded-2xl p-4 space-y-3">
          <p className="text-sm font-semibold text-white flex items-center gap-2">
            <Trophy size={14} className="text-[#ffab00]" /> Today's Pulse
          </p>
          {[
            { icon: Leaf,   label: "Farm Visits", value: todayVisits?.totalItems ?? 0, color: "text-[#00c096]" },
            { icon: Users,  label: "Clocked In",  value: todayAtt?.items.length ?? 0,  color: "text-[#c8f230]" },
            { icon: MapPin, label: "GPS Active",  value: liveCount,                    color: "text-[#3b82f6]" },
          ].map(({ icon: Icon, label, value, color }) => (
            <div key={label} className="flex items-center justify-between py-1.5 border-b border-[#21272f] last:border-0">
              <span className="text-xs text-[#8b95a1] flex items-center gap-2"><Icon size={12} className={color} />{label}</span>
              <span className={`text-sm font-bold ${color}`}>{value}</span>
            </div>
          ))}
          {topPerformer && (
            <div className="pt-1">
              <p className="text-[10px] text-[#8b95a1] mb-1.5">🥇 Top Performer — {format(now, "MMM")}</p>
              <div className="flex items-center gap-2 bg-[#0a0d0f] rounded-xl p-2.5">
                <div className="w-7 h-7 rounded-full bg-[#c8f230]/15 border border-[#c8f230]/30 flex items-center justify-center text-xs font-bold text-[#c8f230]">
                  {topPerformer.staffName[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-white truncate">{topPerformer.staffName}</p>
                  <p className="text-[10px] text-[#c8f230]">{formatKES(topPerformer.achievedAmount)} · {topPerformer.pct}%</p>
                </div>
                {topPerformer.pct >= 100 && <Flame size={14} className="text-[#ff4d4f]" />}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── REVENUE VELOCITY ──────────────────────────────────────────────── */}
      {totalTarget > 0 && (
        <RevenueVelocity
          totalAchieved={totalAchieved}
          totalTarget={totalTarget}
          daysLeft={daysLeft}
        />
      )}

      {/* ── LIVE STAFF + RECENT ORDERS ────────────────────────────────────── */}
      <div className="grid lg:grid-cols-5 gap-4">

        {/* Live staff */}
        <Section title="Staff on Field" icon={MapPin}
          action={
            <button onClick={() => navigate("/map")}
              className="text-xs text-[#c8f230] hover:underline flex items-center gap-1">
              Live Map <ArrowRight size={11} />
            </button>
          }>
          <div className="divide-y divide-[#21272f] lg:col-span-2">
            {(liveLocations ?? []).slice(0, 6).map(loc => {
              const minAgo = differenceInMinutes(now, new Date(loc.recorded_at));
              const live = minAgo <= 10;
              const idle = minAgo > 120;
              return (
                <div key={loc.id} className="flex items-center gap-3 px-4 py-3 hover:bg-[#181c21] transition-colors">
                  <div className="relative flex-shrink-0">
                    <div className={`w-2 h-2 rounded-full ${live ? "bg-[#00c096] animate-pulse" : "bg-[#ffab00]"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white truncate flex items-center gap-1">
                      {loc.expand?.user?.name ?? "Staff"}
                      {idle && <span className="text-[9px] text-[#ff4d4f] bg-[#ff4d4f]/10 px-1 rounded">IDLE</span>}
                    </p>
                    <p className="text-[10px] text-[#4a5568] font-mono">{minsAgo(loc.recorded_at)}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {loc.battery_level != null && (
                      <p className={`text-[10px] flex items-center gap-0.5 justify-end ${loc.battery_level < 20 ? "text-[#ff4d4f]" : "text-[#4a5568]"}`}>
                        <Battery size={9} />{loc.battery_level}%
                      </p>
                    )}
                    <p className="text-[10px] text-[#4a5568] flex items-center gap-0.5">
                      <Navigation size={9} />{loc.speed_kmh ?? 0}km/h
                    </p>
                  </div>
                </div>
              );
            })}
            {!liveLocations?.length && (
              <div className="py-8 text-center text-[#4a5568] text-xs">
                <MapPin size={24} className="mx-auto mb-2 opacity-20" />No live locations
              </div>
            )}
            <div className="px-4 py-2 border-t border-[#21272f]">
              <button onClick={() => navigate("/team-summary")}
                className="text-xs text-[#c8f230] hover:underline flex items-center gap-1">
                <Eye size={10} /> Full team summary
              </button>
            </div>
          </div>
        </Section>

        {/* Recent orders */}
        <div className="lg:col-span-3">
          <Section title="Recent Orders" icon={ShoppingCart}
            action={
              <button onClick={() => navigate("/orders")}
                className="text-xs text-[#c8f230] hover:underline flex items-center gap-1">
                View All <ArrowRight size={11} />
              </button>
            }>
            <div className="divide-y divide-[#21272f]">
              {recentOrders?.items.map(order => {
                const statusColors = {
                  approved: "text-[#00c096]", rejected: "text-[#ff4d4f]",
                  pending_approval: "text-[#ffab00]", revision_requested: "text-[#c8f230]",
                };
                const isNew = differenceInMinutes(now, new Date(order.submitted_at || order.created)) < 60;
                return (
                  <div key={order.id} className="flex items-center gap-3 px-4 py-3 hover:bg-[#181c21] transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-white truncate flex items-center gap-1.5">
                        {order.customer_name}
                        {isNew && <span className="text-[9px] bg-[#c8f230] text-[#0a0d0f] px-1 rounded font-bold">NEW</span>}
                      </p>
                      <p className="text-[10px] text-[#4a5568]">
                        {order.expand?.staff?.name} · {order.county || "—"}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-bold text-[#c8f230]">{formatKES(order.order_amount)}</p>
                      <p className={`text-[10px] font-medium ${statusColors[order.status] ?? "text-[#8b95a1]"}`}>
                        {order.status.replace(/_/g, " ")}
                      </p>
                    </div>
                  </div>
                );
              })}
              {!recentOrders?.items.length && (
                <div className="py-8 text-center text-[#4a5568] text-xs">No orders yet</div>
              )}
            </div>
          </Section>
        </div>
      </div>

      {/* ── ATTENDANCE ────────────────────────────────────────────────────── */}
      <Section title={`Attendance — ${format(now, "dd MMM")}`} icon={Clock}
        action={
          <button onClick={() => navigate("/attendance")}
            className="text-xs text-[#c8f230] hover:underline flex items-center gap-1">
            Full View <ArrowRight size={11} />
          </button>
        }>
        <div className="divide-y divide-[#21272f]">
          {todayAtt?.items.slice(0, 5).map(a => {
            const hoursOnField = a.clock_in && !a.clock_out
              ? differenceInMinutes(now, new Date(a.clock_in)) / 60
              : null;
            return (
              <div key={a.id} className="flex items-center gap-3 px-4 py-3 hover:bg-[#181c21] transition-colors">
                <div className="w-7 h-7 rounded-full bg-[#c8f230]/10 border border-[#c8f230]/20 flex items-center justify-center text-xs font-bold text-[#c8f230] flex-shrink-0">
                  {a.expand?.user?.name?.[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-white truncate">{a.expand?.user?.name ?? "Staff"}</p>
                  <p className="text-[10px] font-mono text-[#4a5568]">
                    {a.clock_in ? format(new Date(a.clock_in), "HH:mm") : "--:--"}
                    {a.clock_out ? ` → ${format(new Date(a.clock_out), "HH:mm")}` : " → now"}
                    {hoursOnField !== null && ` · ${hoursOnField.toFixed(1)}h`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge label={a.status}
                    color={a.status === "late" ? "warn" : a.status === "present" ? "ok" : "default"}
                    size="xs" />
                  <div className={`w-2 h-2 rounded-full ${!a.clock_out ? "bg-[#00c096] animate-pulse" : "bg-[#21272f]"}`} />
                </div>
              </div>
            );
          })}
          {!todayAtt?.items.length && (
            <div className="py-8 text-center text-[#4a5568] text-xs">No attendance records today</div>
          )}
        </div>
      </Section>

      {/* ── QUICK ACTIONS ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Approve Orders",  icon: CheckCircle, to: "/approvals",         color: "text-[#00c096]", bg: "bg-[#00c096]/10", badge: pendingOrderCount   },
          { label: "Pmnt Approvals",  icon: CreditCard,  to: "/payment-approvals", color: "text-[#3b82f6]", bg: "bg-[#3b82f6]/10", badge: pendingPaymentCount },
          { label: "Team Summary",    icon: Users,       to: "/team-summary",      color: "text-[#c8f230]", bg: "bg-[#c8f230]/10", badge: null                },
          { label: "Set Targets",     icon: Target,      to: "/targets",           color: "text-[#ffab00]", bg: "bg-[#ffab00]/10", badge: null                },
        ].map(({ label, icon: Icon, to, color, bg, badge }) => (
          <button key={to} onClick={() => navigate(to)}
            className="bg-[#111418] border border-[#21272f] rounded-2xl p-4 hover:border-[#2d3748] hover:bg-[#13171c] transition-all text-left relative">
            {badge > 0 && (
              <span className="absolute top-2 right-2 text-[9px] px-1.5 py-0.5 rounded-full bg-[#ff4d4f] text-white font-bold">{badge}</span>
            )}
            <div className={`w-8 h-8 rounded-xl ${bg} flex items-center justify-center mb-2`}>
              <Icon size={15} className={color} />
            </div>
            <p className="text-xs font-medium text-white">{label}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── FIELD STAFF DASHBOARD ────────────────────────────────────────────────────
function FieldDashboard({ user }) {
  const navigate = useNavigate();
  const today    = format(new Date(), "yyyy-MM-dd");
  const month    = currentMonth();
  const { data: myTarget }  = useMyTarget(month);
  const summary             = useOrdersSummary(month);
  const myStats             = summary.data?.find(s => s.staffId === user.id);

  const { data: myAtt } = useQuery({
    queryKey: ["my-att-dash", today, user.id],
    queryFn: () => pb.collection("ft_attendance")
      .getFirstListItem(`user = "${user.id}" && date = "${today}"`).catch(() => null),
    refetchInterval: 10000,
  });

  const { data: myTasks } = useQuery({
    queryKey: ["my-tasks-dash", user.id],
    queryFn: () => pb.collection("ft_tasks").getList(1, 20, {
      filter: `assigned_to = "${user.id}" && status != "completed" && status != "cancelled"`,
      sort: "due_date",
    }),
    refetchInterval: 30000,
  });

  const { data: myOrders } = useQuery({
    queryKey: ["my-orders-dash", user.id],
    queryFn: () => pb.collection("ft_orders").getList(1, 5, {
      filter: `staff = "${user.id}"`, sort: "-submitted_at",
    }),
    refetchInterval: 15000,
  });

  const { data: myPayments } = useQuery({
    queryKey: ["my-payments-dash", user.id],
    queryFn: () => pb.collection("ft_order_payments").getList(1, 5, {
      filter: `recorded_by = "${user.id}"`, sort: "-created", expand: "order",
    }),
    refetchInterval: 15000,
  });

  const { data: myVisitsToday } = useQuery({
    queryKey: ["my-visits-today", user.id, today],
    queryFn: () => pb.collection("ft_farmer_visits").getList(1, 100, {
      filter: `staff = "${user.id}" && created >= "${startOfDay(new Date()).toISOString()}"`,
    }),
    refetchInterval: 60000,
  });

  // ── My rank on leaderboard ─────────────────────────────────────────────────
  const { leaderboard } = useLeaderboard(month);
  const myRank = useMemo(() => {
    const idx = leaderboard.findIndex(r => r.staffId === user.id);
    return idx >= 0 ? idx + 1 : null;
  }, [leaderboard, user.id]);
  const myLeaderRow = leaderboard.find(r => r.staffId === user.id);
  const nextRank    = myRank && myRank > 1 ? leaderboard[myRank - 2] : null;
  const gapToNext   = nextRank ? Math.max(0, nextRank.achievedAmount - (myLeaderRow?.achievedAmount ?? 0)) : 0;

  const achieved    = myStats?.totalAmount ?? 0;
  const target      = myTarget?.target_amount ?? 0;
  const targetPct   = target > 0 ? Math.round((achieved / target) * 100) : 0;
  const gap         = Math.max(0, target - achieved);
  const isClockedIn  = myAtt?.clock_in && !myAtt?.clock_out;
  const isClockedOut = myAtt?.clock_in &&  myAtt?.clock_out;
  const daysLeft    = daysRemainingInMonth();

  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!isClockedIn) return;
    const t = setInterval(() => setElapsed(differenceInMinutes(new Date(), new Date(myAtt.clock_in))), 1000);
    return () => clearInterval(t);
  }, [isClockedIn, myAtt?.clock_in]);

  const overdueCount = myTasks?.items.filter(t =>
    t.due_date && isPast(new Date(t.due_date)) && t.status !== "completed"
  ).length ?? 0;

  const rankEmoji = myRank === 1 ? "🥇" : myRank === 2 ? "🥈" : myRank === 3 ? "🥉" : `#${myRank}`;

  return (
    <div className="p-5 max-w-2xl mx-auto space-y-5 pb-8">

      {/* Greeting */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[#8b95a1] text-xs font-mono">{format(new Date(), "EEEE, dd MMM yyyy")}</p>
          <h1 className="font-display font-bold text-2xl text-white mt-0.5">
            {greeting()},&nbsp;
            <span className="text-[#c8f230]">{user?.name?.split(" ")[0]}</span> 👋
          </h1>
        </div>
        <LiveClock />
      </div>

      {/* Rank motivator banner */}
      {myRank && (
        <div className={`rounded-2xl px-4 py-3 border flex items-center gap-3 ${
          myRank <= 3 ? "bg-[#ffab00]/10 border-[#ffab00]/20" : "bg-[#21272f]/50 border-[#21272f]"
        }`}>
          <span className="text-2xl">{rankEmoji}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white">
              You're ranked {rankEmoji} this month
            </p>
            {gapToNext > 0 && (
              <p className="text-[11px] text-[#8b95a1]">
                {formatKES(gapToNext)} away from rank #{myRank - 1} — keep pushing! 💪
              </p>
            )}
            {myRank === 1 && (
              <p className="text-[11px] text-[#ffab00]">You're leading the team — defend your crown! 👑</p>
            )}
          </div>
          <button onClick={() => navigate("/leaderboard")}
            className="text-xs text-[#c8f230] hover:underline flex-shrink-0">
            View →
          </button>
        </div>
      )}

      {/* Clock status */}
      <div className={`rounded-2xl p-4 border ${
        isClockedIn  ? "bg-[#00c096]/10 border-[#00c096]/20" :
        isClockedOut ? "bg-[#21272f]/50 border-[#21272f]" :
                       "bg-[#ff4d4f]/10 border-[#ff4d4f]/20"
      }`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-[#8b95a1] mb-0.5">Today's Status</p>
            {isClockedIn ? (
              <>
                <p className="text-sm font-bold text-[#00c096]">✅ Clocked In</p>
                <p className="text-[10px] font-mono text-[#8b95a1] mt-0.5">
                  Since {format(new Date(myAtt.clock_in), "HH:mm")} ·&nbsp;
                  {String(Math.floor(elapsed / 60)).padStart(2, "0")}:{String(elapsed % 60).padStart(2, "0")} elapsed
                </p>
              </>
            ) : isClockedOut ? (
              <>
                <p className="text-sm font-bold text-white">Done for today ✓</p>
                <p className="text-[10px] text-[#8b95a1]">{myAtt.total_hours}h logged</p>
              </>
            ) : (
              <>
                <p className="text-sm font-bold text-[#ff4d4f]">⚠️ Not clocked in</p>
                <p className="text-[10px] text-[#8b95a1]">Clock in via the Attendance page</p>
              </>
            )}
          </div>
          <button onClick={() => navigate("/attendance")}
            className="text-xs px-3 py-1.5 rounded-xl bg-[#21272f] text-[#8b95a1] hover:text-white transition-colors">
            Attendance →
          </button>
        </div>
      </div>

      {/* Target progress */}
      {target > 0 ? (
        <div className="bg-[#111418] border border-[#21272f] rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-white flex items-center gap-2">
              <Target size={14} className="text-[#c8f230]" /> My Target — {format(new Date(), "MMMM")}
            </p>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${
              targetPct >= 100 ? "bg-[#00c096]/20 text-[#00c096]" :
              targetPct >= 70  ? "bg-[#c8f230]/20 text-[#c8f230]" :
                                 "bg-[#ffab00]/20 text-[#ffab00]"
            }`}>{targetPct}%</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative flex-shrink-0">
              <Ring pct={targetPct} size={72} stroke={6}
                color={targetPct >= 100 ? "#00c096" : targetPct >= 70 ? "#c8f230" : "#ffab00"} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xs font-bold text-white">{targetPct}%</span>
              </div>
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-[#8b95a1]">Achieved</span>
                <span className="text-[#c8f230] font-bold">{formatKES(achieved)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-[#8b95a1]">Target</span>
                <span className="text-white font-medium">{formatKES(target)}</span>
              </div>
              {gap > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-[#8b95a1]">Gap</span>
                  <span className="text-[#ff9f43]">{formatKES(gap)}</span>
                </div>
              )}
              {gap > 0 && daysLeft > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-[#8b95a1]">Need/day</span>
                  <span className="text-[#ff9f43] font-bold">{formatKES(Math.round(gap / daysLeft))}</span>
                </div>
              )}
              <p className="text-[10px] text-[#4a5568]">{daysLeft} days remaining</p>
            </div>
          </div>
          {targetPct >= 100 && (
            <div className="mt-3 flex items-center gap-2 text-xs text-[#00c096] bg-[#00c096]/10 rounded-xl px-3 py-2">
              <Flame size={12} /> 🎉 Target achieved! You're on fire!
            </div>
          )}
        </div>
      ) : (
        <div className="bg-[#111418] border border-[#21272f] rounded-2xl p-4 text-center">
          <Target size={24} className="mx-auto mb-2 text-[#4a5568]" />
          <p className="text-xs text-[#8b95a1]">No target set for {format(new Date(), "MMMM")} yet</p>
        </div>
      )}

      {/* My KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <KpiCard icon={ShoppingCart} label="My Orders"    value={myStats?.totalOrders ?? 0}
          sub={format(new Date(), "MMM yyyy")}  color="text-[#c8f230]" bg="bg-[#c8f230]/10"
          onClick={() => navigate("/orders")} />
        <KpiCard icon={Leaf}         label="Visits Today" value={myVisitsToday?.totalItems ?? 0}
          sub="farmer visits"                   color="text-[#00c096]" bg="bg-[#00c096]/10"
          onClick={() => navigate("/farmer-visits")} />
        <KpiCard icon={CheckSquare}  label="Open Tasks"   value={myTasks?.totalItems ?? 0}
          sub={overdueCount > 0 ? `${overdueCount} overdue` : "all on track"}
          color={overdueCount > 0 ? "text-[#ff4d4f]" : "text-[#3b82f6]"}
          bg={overdueCount > 0 ? "bg-[#ff4d4f]/10" : "bg-[#3b82f6]/10"}
          badge={overdueCount > 0 ? overdueCount : null}
          onClick={() => navigate("/tasks")} />
      </div>

      {/* Overdue tasks alert */}
      {overdueCount > 0 && (
        <AlertBanner
          icon={AlertOctagon}
          message={`${overdueCount} task${overdueCount > 1 ? "s are" : " is"} overdue — action needed`}
          color="text-[#ff4d4f]" bg="bg-[#ff4d4f]/10" border="border-[#ff4d4f]/20"
          onClick={() => navigate("/tasks")}
          pulse
        />
      )}

      {/* My recent orders */}
      <Section title="My Recent Orders" icon={ShoppingCart}
        action={
          <button onClick={() => navigate("/orders")}
            className="text-xs text-[#c8f230] hover:underline flex items-center gap-1">
            All Orders <ArrowRight size={11} />
          </button>
        }>
        <div className="divide-y divide-[#21272f]">
          {myOrders?.items.map(order => {
            const statusColors = {
              approved: "text-[#00c096]", rejected: "text-[#ff4d4f]", pending_approval: "text-[#ffab00]",
            };
            return (
              <div key={order.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-white truncate">{order.customer_name}</p>
                  <p className="text-[10px] text-[#4a5568]">{order.order_no}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-[#c8f230]">{formatKES(order.order_amount)}</p>
                  <p className={`text-[10px] ${statusColors[order.status] ?? "text-[#8b95a1]"}`}>
                    {order.status.replace(/_/g, " ")}
                  </p>
                </div>
              </div>
            );
          })}
          {!myOrders?.items.length && (
            <div className="py-6 text-center text-[#4a5568] text-xs">No orders yet — submit your first order!</div>
          )}
        </div>
      </Section>

      {/* My pending payments */}
      {myPayments?.items.length > 0 && (
        <Section title="My Payment Submissions" icon={CreditCard}
          action={<button onClick={() => navigate("/orders")} className="text-xs text-[#c8f230] hover:underline">View →</button>}>
          <div className="divide-y divide-[#21272f]">
            {myPayments.items.map(p => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-white">{formatKES(p.amount)}</p>
                  <p className="text-[10px] text-[#4a5568]">{p.expand?.order?.customer_name ?? "—"}</p>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  p.status === "approved" ? "bg-[#00c096]/10 text-[#00c096]" :
                  p.status === "rejected" ? "bg-[#ff4d4f]/10 text-[#ff4d4f]" :
                  "bg-[#ff9f43]/10 text-[#ff9f43]"
                }`}>{p.status}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* My tasks */}
      <Section title="My Tasks" icon={CheckSquare}
        action={<button onClick={() => navigate("/tasks")} className="text-xs text-[#c8f230] hover:underline">All Tasks →</button>}>
        <div className="divide-y divide-[#21272f]">
          {myTasks?.items.slice(0, 5).map(task => {
            const overdue = task.due_date && isPast(new Date(task.due_date));
            return (
              <div key={task.id} className="flex items-center gap-3 px-4 py-3">
                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  task.priority === "urgent" ? "bg-[#ff4d4f]" :
                  task.priority === "high"   ? "bg-[#ffab00]" : "bg-[#3b82f6]"
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-white truncate">{task.title}</p>
                  {task.due_date && (
                    <p className={`text-[10px] font-mono ${overdue ? "text-[#ff4d4f]" : "text-[#4a5568]"}`}>
                      {overdue ? "⚠️ " : ""}{format(new Date(task.due_date), "dd MMM HH:mm")}
                    </p>
                  )}
                </div>
                <Badge label={task.status} size="xs"
                  color={task.status === "in_progress" ? "blue" : task.status === "completed" ? "ok" : "default"} />
              </div>
            );
          })}
          {!myTasks?.items.length && (
            <div className="py-6 text-center text-[#4a5568] text-xs">No open tasks 🎉</div>
          )}
        </div>
      </Section>

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "New Order",   icon: ShoppingCart, to: "/orders",        color: "text-[#c8f230]", bg: "bg-[#c8f230]/10" },
          { label: "Farm Visit",  icon: Leaf,         to: "/farmer-visits", color: "text-[#00c096]", bg: "bg-[#00c096]/10" },
          { label: "Expense",     icon: Receipt,      to: "/expenses",      color: "text-[#ff9f43]", bg: "bg-[#ff9f43]/10" },
        ].map(({ label, icon: Icon, to, color, bg }) => (
          <button key={to} onClick={() => navigate(to)}
            className="bg-[#111418] border border-[#21272f] rounded-2xl p-4 hover:border-[#2d3748] hover:bg-[#13171c] transition-all text-center">
            <div className={`w-8 h-8 rounded-xl ${bg} flex items-center justify-center mb-2 mx-auto`}>
              <Icon size={15} className={color} />
            </div>
            <p className="text-xs font-medium text-white">{label}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user } = useAuth();
  const isAdmin = ["admin", "manager", "supervisor"].includes(user?.role);
  return isAdmin ? <AdminDashboard user={user} /> : <FieldDashboard user={user} />;
}