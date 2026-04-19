// src/pages/AdvancedReportsPage.jsx
import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { pb } from "../lib/pb";
import { useLeaderboard } from "../hooks/useTargets";
import { currentMonth, formatKES } from "../hooks/useOrders";
import {
  exportSalesReport, exportOrdersReport, exportFarmerVisitsReport,
  exportLeaderboardReport, exportAttendanceReport, exportExpensesReport,
  fmtKES, shareViaWhatsApp, buildLeaderboardShareText,
} from "../lib/reportExport";
import { Btn } from "../components/ui/Btn";
import {
  TrendingUp, Trophy, Leaf, Users, BarChart2,
  Download, Share2, Calendar, ShoppingCart, Clock, Package,
  CreditCard,
} from "lucide-react";
import {
  format, startOfMonth, endOfMonth, startOfQuarter,
  endOfQuarter, startOfYear, subMonths,
} from "date-fns";
import toast from "react-hot-toast";

const REPORT_TYPES = [
  { id: "sales",         label: "Sales Performance",      icon: TrendingUp,  description: "Staff vs target achievement, category breakdown",       color: "text-[#c8f230]", bg: "bg-[#c8f230]/10 border-[#c8f230]/20" },
  { id: "leaderboard",   label: "Leaderboard Snapshot",   icon: Trophy,      description: "Rankings at a point in time with gap analysis",          color: "text-[#ffab00]", bg: "bg-[#ffab00]/10 border-[#ffab00]/20" },
  { id: "orders",        label: "Orders & Aging Report",  icon: CreditCard,  description: "Orders with payments, balances & aging buckets (0-30, 31-60, 61-90, 90+ days)", color: "text-[#3b82f6]", bg: "bg-[#3b82f6]/10 border-[#3b82f6]/20" },
  { id: "farmer_visits", label: "Farmer Visits",          icon: Leaf,        description: "Farm coverage, crops, acreage, outcomes",                color: "text-[#00c096]", bg: "bg-[#00c096]/10 border-[#00c096]/20" },
  { id: "attendance",    label: "Attendance & Hours",     icon: Clock,       description: "Clock-in times, field hours, punctuality",               color: "text-[#8b95a1]", bg: "bg-[#21272f] border-[#2a3040]"       },
  { id: "expenses",      label: "Expenses & Mileage",     icon: Package,     description: "Claims, approval rates, mileage analysis",               color: "text-[#ff4d4f]", bg: "bg-[#ff4d4f]/10 border-[#ff4d4f]/20" },
];

function getDateRange(preset, customStart, customEnd) {
  const now = new Date();
  switch (preset) {
    case "mtd":        return { start: startOfMonth(now),   end: now,                label: "Month to Date"    };
    case "last_month": { const lm = subMonths(now, 1); return { start: startOfMonth(lm), end: endOfMonth(lm), label: "Last Month" }; }
    case "qtd":        return { start: startOfQuarter(now), end: now,                label: "Quarter to Date"  };
    case "ytd":        return { start: startOfYear(now),    end: now,                label: "Year to Date"     };
    case "custom":     return { start: new Date(customStart), end: new Date(customEnd), label: `${customStart} to ${customEnd}` };
    default:           return { start: startOfMonth(now),   end: now,                label: "Month to Date"    };
  }
}

function fmt(date) { return format(date, "yyyy-MM-dd HH:mm:ss"); }

function MiniStat({ label, value, icon: Icon, color = "text-[#c8f230]" }) {
  return (
    <div className="bg-[#0a0d0f] border border-[#21272f] rounded-xl p-3 text-center">
      <Icon size={14} className={`mx-auto mb-1 ${color}`} />
      <p className={`font-bold text-sm ${color}`}>{value}</p>
      <p className="text-[10px] text-[#8b95a1] mt-0.5">{label}</p>
    </div>
  );
}

export default function AdvancedReportsPage() {
  const [selectedReport, setSelectedReport] = useState(null);
  const [datePreset, setDatePreset]         = useState("mtd");
  const [customStart, setCustomStart]       = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [customEnd, setCustomEnd]           = useState(format(new Date(), "yyyy-MM-dd"));
  const [exportFormat, setExportFormat]     = useState("pdf");
  const [loading, setLoading]               = useState(false);
  const [filterStaff, setFilterStaff]       = useState("");

  const { start, end, label: dateLabel } = getDateRange(datePreset, customStart, customEnd);
  const monthStr = format(start, "yyyy-MM");
  const { leaderboard } = useLeaderboard(monthStr);

  const { data: staff } = useQuery({
    queryKey: ["staff-all"],
    queryFn: () => pb.collection("ft_users").getFullList({ filter: `role = "field_staff"`, sort: "name" }),
  });

  const ordersFilter = () => {
    const parts = [`submitted_at >= "${fmt(start)}"`, `submitted_at <= "${fmt(end)}"`];
    if (filterStaff) parts.push(`staff = "${filterStaff}"`);
    return parts.join(" && ");
  };

  const visitsFilter  = () => filterStaff ? `staff = "${filterStaff}"` : "";
  const attendanceFilter = () => {
    const parts = [`date >= "${format(start, "yyyy-MM-dd")}"`, `date <= "${format(end, "yyyy-MM-dd")}"`];
    if (filterStaff) parts.push(`user = "${filterStaff}"`);
    return parts.join(" && ");
  };
  const expensesFilter = () => {
    const parts = [`created >= "${fmt(start)}"`, `created <= "${fmt(end)}"`];
    if (filterStaff) parts.push(`submitted_by = "${filterStaff}"`);
    return parts.join(" && ");
  };

  const { data: ordersData } = useQuery({
    queryKey: ["report-orders", fmt(start), fmt(end), filterStaff],
    queryFn: () => pb.collection("ft_orders").getFullList({
      filter: ordersFilter(), expand: "staff,approved_by", sort: "-submitted_at",
    }),
    enabled: selectedReport === "orders",
  });

  // Fetch ALL payments for the orders in range (for aging report)
  const { data: paymentsData } = useQuery({
    queryKey: ["report-order-payments", fmt(start), fmt(end), filterStaff],
    queryFn: async () => {
      if (!ordersData?.length) return [];
      const orderIds = ordersData.map((o) => o.id);
      // Fetch in batches of 50 to avoid URL length limits
      const batches = [];
      for (let i = 0; i < orderIds.length; i += 50) {
        batches.push(orderIds.slice(i, i + 50));
      }
      const results = await Promise.all(
        batches.map((batch) =>
          pb.collection("ft_order_payments").getFullList({
            filter: batch.map((id) => `order = "${id}"`).join(" || "),
            sort: "-payment_date",
          })
        )
      );
      return results.flat();
    },
    enabled: selectedReport === "orders" && !!ordersData?.length,
  });

  const { data: visitsData } = useQuery({
    queryKey: ["report-visits", fmt(start), fmt(end), filterStaff],
    queryFn: () => pb.collection("ft_farmer_visits").getFullList({
      filter: visitsFilter(), expand: "staff", sort: "-id",
    }),
    enabled: selectedReport === "farmer_visits",
  });

  const { data: attendanceData } = useQuery({
    queryKey: ["report-attendance", fmt(start), fmt(end), filterStaff],
    queryFn: () => pb.collection("ft_attendance").getFullList({
      filter: attendanceFilter(), expand: "user", sort: "-date",
    }),
    enabled: selectedReport === "attendance",
  });

  const { data: expensesData } = useQuery({
    queryKey: ["report-expenses", fmt(start), fmt(end), filterStaff],
    queryFn: () => pb.collection("ft_expenses").getFullList({
      filter: expensesFilter(), expand: "submitted_by,approved_by", sort: "-created",
    }),
    enabled: selectedReport === "expenses",
  });

  const handleExport = async () => {
    setLoading(true);
    try {
      const dateRange = `${format(start, "dd MMM yyyy")} – ${format(end, "dd MMM yyyy")}`;

      let freshOrders     = ordersData;
      let freshPayments   = paymentsData ?? [];
      let freshVisits     = visitsData;
      let freshAttendance = attendanceData;
      let freshExpenses   = expensesData;

      if (selectedReport === "orders") {
        if (!freshOrders) {
          freshOrders = await pb.collection("ft_orders").getFullList({
            filter: ordersFilter(), expand: "staff,approved_by", sort: "-submitted_at",
          });
        }
        if (!freshPayments.length && freshOrders.length) {
          const orderIds = freshOrders.map((o) => o.id);
          const batches = [];
          for (let i = 0; i < orderIds.length; i += 50) batches.push(orderIds.slice(i, i + 50));
          const results = await Promise.all(
            batches.map((batch) =>
              pb.collection("ft_order_payments").getFullList({
                filter: batch.map((id) => `order = "${id}"`).join(" || "),
              })
            )
          );
          freshPayments = results.flat();
        }
      }
      if (selectedReport === "farmer_visits" && !freshVisits) {
        freshVisits = await pb.collection("ft_farmer_visits").getFullList({
          filter: visitsFilter(), expand: "staff", sort: "-id",
        });
      }
      if (selectedReport === "attendance" && !freshAttendance) {
        freshAttendance = await pb.collection("ft_attendance").getFullList({
          filter: attendanceFilter(), expand: "user", sort: "-date",
        });
      }
      if (selectedReport === "expenses" && !freshExpenses) {
        freshExpenses = await pb.collection("ft_expenses").getFullList({
          filter: expensesFilter(), expand: "submitted_by,approved_by", sort: "-created",
        });
      }

      switch (selectedReport) {
        case "sales":
          await exportSalesReport({ leaderboard, month: monthStr, format: exportFormat });
          break;
        case "leaderboard":
          await exportLeaderboardReport({ leaderboard, month: monthStr, fmt: exportFormat });
          break;
        case "orders":
          await exportOrdersReport({
            orders: freshOrders ?? [],
            payments: freshPayments,
            dateRange,
            fmt: exportFormat,
          });
          break;
        case "farmer_visits":
          await exportFarmerVisitsReport({ visits: freshVisits ?? [], dateRange, fmt: exportFormat });
          break;
        case "attendance":
          await exportAttendanceReport(freshAttendance ?? [], dateRange, exportFormat);
          break;
        case "expenses":
          await exportExpensesReport(freshExpenses ?? [], dateRange, exportFormat);
          break;
        default:
          toast.error("Select a report type first");
      }
    } catch (e) {
      console.error(e);
      toast.error("Export failed. Try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Order aging preview stats ──
  const orderAgingStats = React.useMemo(() => {
    if (!ordersData) return null;
    const payMap = {};
    for (const p of (paymentsData ?? [])) {
      if (!payMap[p.order]) payMap[p.order] = { paid: 0, pending: 0 };
      if (p.status === "approved") payMap[p.order].paid    += Number(p.amount || 0);
      if (p.status === "pending")  payMap[p.order].pending += Number(p.amount || 0);
    }
    const approved = ordersData.filter((o) => o.status === "approved");
    const totalValue    = ordersData.reduce((s, o) => s + Number(o.order_amount || 0), 0);
    const totalPaid     = approved.reduce((s, o) => s + (payMap[o.id]?.paid ?? 0), 0);
    const totalPending  = approved.reduce((s, o) => s + (payMap[o.id]?.pending ?? 0), 0);
    const totalBalance  = approved.reduce((s, o) => s + Math.max(0, Number(o.order_amount || 0) - (payMap[o.id]?.paid ?? 0)), 0);
    const fullyPaid     = approved.filter((o) => (payMap[o.id]?.paid ?? 0) >= Number(o.order_amount || 0) - 0.01).length;
    const collRate      = totalValue > 0 ? Math.round((totalPaid / totalValue) * 100) : 0;
    return { total: ordersData.length, totalValue, totalPaid, totalPending, totalBalance, fullyPaid, collRate };
  }, [ordersData, paymentsData]);

  const visitStats = visitsData ? {
    total: visitsData.length,
    converted: visitsData.filter((v) => v.visit_outcome === "purchased").length,
    counties: [...new Set(visitsData.map((v) => v.county).filter(Boolean))].length,
    acres: visitsData.reduce((s, v) => s + Number(v.acreage || 0), 0),
  } : null;

  const attStats = attendanceData ? {
    totalDays: attendanceData.length,
    totalHours: attendanceData.reduce((s, a) => s + Number(a.total_hours || 0), 0),
    avgHours: attendanceData.length ? attendanceData.reduce((s, a) => s + Number(a.total_hours || 0), 0) / attendanceData.length : 0,
  } : null;

  const expStats = expensesData ? {
    total: expensesData.length,
    approved: expensesData.filter((e) => e.status === "approved").length,
    totalAmount: expensesData.reduce((s, e) => s + Number(e.amount || 0), 0),
    approvedAmount: expensesData.filter((e) => e.status === "approved").reduce((s, e) => s + Number(e.amount || 0), 0),
  } : null;

  return (
    <div className="p-5 max-w-4xl mx-auto space-y-6 pb-8">
      <div>
        <h1 className="font-display font-bold text-2xl text-white flex items-center gap-2">
          <BarChart2 size={22} className="text-[#c8f230]" /> Intelligence Reports
        </h1>
        <p className="text-[#8b95a1] text-sm mt-0.5">Generate, analyze, and export business insights</p>
      </div>

      {!selectedReport && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {REPORT_TYPES.map((rt) => {
            const Icon = rt.icon;
            return (
              <button key={rt.id} onClick={() => setSelectedReport(rt.id)}
                className={`p-4 rounded-2xl border text-left hover:scale-[1.01] transition-all ${rt.bg}`}>
                <Icon size={20} className={`${rt.color} mb-2`} />
                <p className="font-semibold text-sm text-white">{rt.label}</p>
                <p className="text-[10px] text-[#8b95a1] mt-1 leading-relaxed">{rt.description}</p>
                <span className={`text-[10px] ${rt.color} mt-2 block`}>Generate →</span>
              </button>
            );
          })}
        </div>
      )}

      {selectedReport && (
        <div className="space-y-4">
          <button onClick={() => setSelectedReport(null)}
            className="text-sm text-[#8b95a1] hover:text-white transition-colors">
            ← Back to Reports
          </button>

          <div className="flex items-center justify-between">
            <h2 className="font-display font-bold text-lg text-white">
              {REPORT_TYPES.find((r) => r.id === selectedReport)?.label}
            </h2>
            <button onClick={() => {
              let text = "";
              const dateRange = `${format(start, "dd MMM yyyy")} – ${format(end, "dd MMM yyyy")}`;
              if (selectedReport === "sales" || selectedReport === "leaderboard") {
                text = buildLeaderboardShareText(leaderboard, monthStr);
              } else if (selectedReport === "orders" && orderAgingStats) {
                text = [
                  `*Orders Report — ${dateRange}*`,
                  `Total Orders: ${orderAgingStats.total}`,
                  `Order Value: ${fmtKES(orderAgingStats.totalValue)}`,
                  `Collected: ${fmtKES(orderAgingStats.totalPaid)}`,
                  `Outstanding: ${fmtKES(orderAgingStats.totalBalance)}`,
                  `Collection Rate: ${orderAgingStats.collRate}%`,
                  `Pending Approval: ${fmtKES(orderAgingStats.totalPending)}`,
                  ``,
                  `_Sent via FieldTrack_`,
                ].join("\n");
              } else if (selectedReport === "farmer_visits" && visitStats) {
                text = [
                  `*Farmer Visits Report — ${dateRange}*`,
                  `Total Visits: ${visitStats.total}`,
                  `Converted (Purchased): ${visitStats.converted}`,
                  `Counties Covered: ${visitStats.counties}`,
                  `Acres Covered: ${visitStats.acres.toFixed(1)} ac`,
                  ``,
                  `_Sent via FieldTrack_`,
                ].join("\n");
              } else if (selectedReport === "attendance" && attStats) {
                text = [
                  `*Attendance Report — ${dateRange}*`,
                  `Working Days Logged: ${attStats.totalDays}`,
                  `Total Field Hours: ${attStats.totalHours.toFixed(1)}h`,
                  `Average Hours/Day: ${attStats.avgHours.toFixed(1)}h`,
                  ``,
                  `_Sent via FieldTrack_`,
                ].join("\n");
              } else if (selectedReport === "expenses" && expStats) {
                text = [
                  `*Expenses Report — ${dateRange}*`,
                  `Total Claims: ${expStats.total}`,
                  `Approved: ${expStats.approved}`,
                  `Total Amount: ${fmtKES(expStats.totalAmount)}`,
                  `Approved Amount: ${fmtKES(expStats.approvedAmount)}`,
                  `Approval Rate: ${expStats.total > 0 ? Math.round((expStats.approved / expStats.total) * 100) : 0}%`,
                  ``,
                  `_Sent via FieldTrack_`,
                ].join("\n");
              } else {
                text = `FieldTrack Report — ${dateRange}\n\nNo data loaded yet. Generate the report first.`;
              }
              shareViaWhatsApp(text);
            }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#25D366]/15 border border-[#25D366]/30 text-[#25D366] text-xs font-medium hover:bg-[#25D366]/25 transition-colors">
              <Share2 size={12} /> WhatsApp
            </button>
          </div>

          <div className="bg-[#111418] border border-[#21272f] rounded-2xl p-4 space-y-4">
            <h3 className="text-sm font-medium text-white flex items-center gap-2">
              <Calendar size={14} className="text-[#c8f230]" /> Report Parameters
            </h3>

            <div className="flex flex-wrap gap-2">
              {[
                { value: "mtd",        label: "Month to Date"  },
                { value: "last_month", label: "Last Month"     },
                { value: "qtd",        label: "Quarter to Date"},
                { value: "ytd",        label: "Year to Date"   },
                { value: "custom",     label: "Custom Range"   },
              ].map((p) => (
                <button key={p.value} onClick={() => setDatePreset(p.value)}
                  className={`px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                    datePreset === p.value ? "bg-[#c8f230] text-[#0a0d0f]" : "bg-[#0a0d0f] border border-[#21272f] text-[#8b95a1] hover:text-white"
                  }`}>
                  {p.label}
                </button>
              ))}
            </div>

            {datePreset === "custom" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[#8b95a1] block mb-1">From</label>
                  <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
                    className="w-full bg-[#0a0d0f] border border-[#21272f] rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#c8f230] [color-scheme:dark]" />
                </div>
                <div>
                  <label className="text-xs text-[#8b95a1] block mb-1">To</label>
                  <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
                    className="w-full bg-[#0a0d0f] border border-[#21272f] rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#c8f230] [color-scheme:dark]" />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[#8b95a1] block mb-1">Filter by Staff</label>
                <select value={filterStaff} onChange={(e) => setFilterStaff(e.target.value)}
                  className="w-full bg-[#0a0d0f] border border-[#21272f] rounded-xl px-3 py-2.5 text-sm text-[#c2cad4] outline-none focus:border-[#c8f230]">
                  <option value="">All Staff</option>
                  {(staff ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-[#8b95a1] block mb-1">Export Format</label>
                <select value={exportFormat} onChange={(e) => setExportFormat(e.target.value)}
                  className="w-full bg-[#0a0d0f] border border-[#21272f] rounded-xl px-3 py-2.5 text-sm text-[#c2cad4] outline-none focus:border-[#c8f230]">
                  <option value="pdf">PDF (Print-ready)</option>
                  <option value="excel">Excel (.xlsx) — 2 sheets</option>
                  <option value="csv">CSV (Data)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-[#8b95a1]">
              <Calendar size={12} />
              <span>Reporting period: <span className="text-white font-medium">{dateLabel}</span></span>
            </div>
          </div>

          <Btn onClick={handleExport} disabled={loading} className="w-full">
            <Download size={16} />
            {loading ? "Generating Report…" : `Export as ${exportFormat.toUpperCase()}`}
          </Btn>

          {/* ── ORDERS AGING PREVIEW ── */}
          {selectedReport === "orders" && orderAgingStats && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-white">Preview — {dateLabel}</h3>
              <div className="grid grid-cols-3 gap-3">
                <MiniStat label="Total Orders"      value={orderAgingStats.total}                        icon={ShoppingCart} />
                <MiniStat label="Total Order Value" value={fmtKES(orderAgingStats.totalValue)}            icon={TrendingUp}   color="text-[#c8f230]" />
                <MiniStat label="Total Collected"   value={fmtKES(orderAgingStats.totalPaid)}             icon={CreditCard}   color="text-[#00c096]" />
                <MiniStat label="Pending Payments"  value={fmtKES(orderAgingStats.totalPending)}          icon={Clock}        color="text-[#ff9f43]" />
                <MiniStat label="Outstanding Bal."  value={fmtKES(orderAgingStats.totalBalance)}          icon={TrendingUp}   color="text-[#ff4d4f]" />
                <MiniStat label="Collection Rate"   value={`${orderAgingStats.collRate}%`}                icon={TrendingUp}   color="text-[#c8f230]" />
              </div>

              {/* Aging buckets */}
              <div className="bg-[#111418] border border-[#21272f] rounded-2xl p-4">
                <p className="text-xs font-semibold text-white mb-3">Outstanding Balance by Age</p>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: "0–30 days",  color: "text-[#00c096]", border: "border-[#00c096]/30", bg: "bg-[#00c096]/10" },
                    { label: "31–60 days", color: "text-[#c8f230]", border: "border-[#c8f230]/30", bg: "bg-[#c8f230]/10" },
                    { label: "61–90 days", color: "text-[#ff9f43]", border: "border-[#ff9f43]/30", bg: "bg-[#ff9f43]/10" },
                    { label: "90+ days",   color: "text-[#ff4d4f]", border: "border-[#ff4d4f]/30", bg: "bg-[#ff4d4f]/10" },
                  ].map(({ label, color, border, bg }) => {
                    // Calculate bucket value
                    const bucketVal = (ordersData ?? [])
                      .filter((o) => o.status === "approved")
                      .reduce((s, o) => {
                        const pm = (paymentsData ?? []).filter((p) => p.order === o.id && p.status === "approved");
                        const paid = pm.reduce((a, p) => a + Number(p.amount || 0), 0);
                        const bal = Math.max(0, Number(o.order_amount || 0) - paid);
                        if (bal <= 0) return s;
                        const days = Math.floor((new Date() - new Date(o.submitted_at || o.order_date || o.created)) / 86400000);
                        const bucket =
                          days <= 30 ? "0–30 days" :
                          days <= 60 ? "31–60 days" :
                          days <= 90 ? "61–90 days" : "90+ days";
                        return bucket === label ? s + bal : s;
                      }, 0);
                    return (
                      <div key={label} className={`rounded-xl p-3 border ${bg} ${border} text-center`}>
                        <p className={`text-xs font-bold ${color}`}>{label}</p>
                        <p className={`text-sm font-bold font-mono mt-1 ${color}`}>
                          {fmtKES(bucketVal)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {selectedReport === "farmer_visits" && visitStats && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-white">Preview — {dateLabel}</h3>
              <div className="grid grid-cols-4 gap-3">
                <MiniStat label="Total Visits" value={visitStats.total}             icon={Leaf} color="text-[#00c096]" />
                <MiniStat label="Converted"    value={visitStats.converted}         icon={Leaf} color="text-[#c8f230]" />
                <MiniStat label="Counties"     value={visitStats.counties}          icon={Leaf} color="text-[#ffab00]" />
                <MiniStat label="Acres"        value={visitStats.acres.toFixed(1)}  icon={Leaf} />
              </div>
            </div>
          )}

          {(selectedReport === "sales" || selectedReport === "leaderboard") && leaderboard.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-white">Preview — {monthStr}</h3>
              <div className="grid grid-cols-3 gap-3">
                <MiniStat label="Staff Ranked"   value={leaderboard.length}                                             icon={Users} />
                <MiniStat label="Total Achieved" value={fmtKES(leaderboard.reduce((s, r) => s + r.achievedAmount, 0))} icon={TrendingUp} color="text-[#c8f230]" />
                <MiniStat label="Hitting Target" value={leaderboard.filter((r) => r.pct >= 100).length}                icon={Trophy}     color="text-[#00c096]" />
              </div>
              <div className="bg-[#111418] border border-[#21272f] rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-[#21272f]">
                  <p className="text-xs font-medium text-[#8b95a1] uppercase tracking-wider">Top Performers</p>
                </div>
                {leaderboard.slice(0, 5).map((r, i) => (
                  <div key={r.staffId} className="flex items-center gap-3 px-4 py-2.5 border-b border-[#21272f] last:border-0">
                    <span className="text-sm w-5 text-center">{["🥇","🥈","🥉"][i] || `${i+1}`}</span>
                    <div className="flex-1">
                      <p className="text-sm text-white font-medium">{r.staffName}</p>
                      <p className="text-[10px] text-[#8b95a1]">{r.county}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-[#c8f230]">{fmtKES(r.achievedAmount)}</p>
                      <p className="text-[10px] text-[#8b95a1]">{r.pct}%</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedReport === "attendance" && attStats && (
            <div className="grid grid-cols-3 gap-3">
              <MiniStat label="Working Days"  value={attStats.totalDays}                    icon={Clock} />
              <MiniStat label="Total Hours"   value={`${attStats.totalHours.toFixed(1)}h`}  icon={Clock} color="text-[#c8f230]" />
              <MiniStat label="Avg Hours/Day" value={`${attStats.avgHours.toFixed(1)}h`}    icon={Clock} color="text-[#00c096]" />
            </div>
          )}

          {selectedReport === "expenses" && expStats && (
            <div className="grid grid-cols-4 gap-3">
              <MiniStat label="Total Claims"    value={expStats.total}                   icon={Package} />
              <MiniStat label="Approved"        value={expStats.approved}                icon={Package} color="text-[#00c096]" />
              <MiniStat label="Total Amount"    value={fmtKES(expStats.totalAmount)}     icon={Package} color="text-[#c8f230]" />
              <MiniStat label="Approved Amount" value={fmtKES(expStats.approvedAmount)}  icon={Package} color="text-[#00c096]" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}