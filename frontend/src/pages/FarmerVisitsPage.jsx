// src/pages/FarmerVisitsPage.jsx
// v6: REPORT ENGINE + KILLER UPGRADES
// ─ All v5 features preserved (zero breaking changes)
// ─ Advanced Report Generator: custom date ranges, period comparison, staff breakdown
// ─ PDF report with cover page, charts, summary tables (client-side, no backend)
// ─ Visit Timeline View: day-by-day activity heat map + chronological log
// ─ Smart Follow-up Scheduler: bulk reschedule overdue visits
// ─ Revenue Trend Forecasting: 4-week rolling projection
// ─ County Route Planner: groups upcoming visits for efficient routing
// ─ Bulk action: mark multiple follow-ups as done
// ─ Staff Leaderboard (admin): ranked by visits, revenue, conversion

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { pb, API } from "../lib/pb";
import { useAuth } from "../store/auth";
import { useGPS } from "../hooks/useGPS";
import { isOnline, enqueueFarmerVisit } from "../lib/offlineQueue";
import { Modal } from "../components/ui/Modal";
import { Btn } from "../components/ui/Btn";
import { Badge } from "../components/ui/Badge";
import { Input, Select, Textarea } from "../components/ui/Input";
import CameraCapture from "../components/CameraCapture";
import {
  Leaf, Plus, Camera, MapPin, Search, Download,
  WifiOff, Building2, Store, Sprout, Users,
  Filter, ChevronDown, ChevronUp, X, RefreshCw,
  Zap, BarChart2, AlertCircle, Calendar, TrendingUp,
  Award, Clock, Route, CheckSquare, Square,
  FileText, Target, Activity,
} from "lucide-react";
import { exportFarmerVisitsReport } from "../lib/reportExport";
import toast from "react-hot-toast";

// ─── Constants (unchanged from v5) ───────────────────────────────────────────

const KENYA_COUNTIES = [
  "Baringo","Bomet","Bungoma","Busia","Elgeyo-Marakwet","Embu","Garissa","Homa Bay",
  "Isiolo","Kajiado","Kakamega","Kericho","Kiambu","Kilifi","Kirinyaga","Kisii",
  "Kisumu","Kitui","Kwale","Laikipia","Lamu","Machakos","Makueni","Mandera",
  "Marsabit","Meru","Migori","Mombasa","Murang'a","Nairobi","Nakuru","Nandi",
  "Narok","Nyamira","Nyandarua","Nyeri","Samburu","Siaya","Taita-Taveta","Tana River",
  "Tharaka-Nithi","Trans Nzoia","Turkana","Uasin Gishu","Vihiga","Wajir","West Pokot",
];

const CROPS = [
  "Maize","Wheat","Rice","Tea","Coffee","Horticulture","Tomatoes","Onions",
  "Potatoes","Beans","Avocado","Mango","Banana","Sunflower","Sorghum",
  "Dairy (Livestock)","Poultry","Sugarcane","Cotton","Other",
];

export const VISIT_TYPES = [
  { value:"distributor", label:"Distributor", Icon:Building2, color:"#818cf8", bg:"#818cf820" },
  { value:"stockist",    label:"Stockist",    Icon:Store,     color:"#22d3ee", bg:"#22d3ee20" },
  { value:"agrovet",     label:"Agrovet",     Icon:Leaf,      color:"#c8f230", bg:"#c8f23020" },
  { value:"farmer",      label:"Farmer",      Icon:Sprout,    color:"#4ade80", bg:"#4ade8020" },
];

const VISIT_PURPOSES  = ["sale","prospecting","follow_up","demo","education","complaint"];
const VISIT_OUTCOMES  = ["purchased","interested","not_interested","follow_up_needed","complaint_resolved"];
const SOIL_TYPES      = ["clay","loam","sandy","black_cotton","other"];
const STOCK_LEVELS    = ["well_stocked","low_stock","out_of_stock"];
const DISPLAY_QUALITY = ["excellent","good","needs_improvement","poor"];
const PAGE_SIZE       = 50;

const OUTCOME_COLORS = {
  purchased:"ok", interested:"blue", not_interested:"default",
  follow_up_needed:"warn", complaint_resolved:"ok",
};

const BLANK_FORM = {
  visit_type:"farmer", contact_name:"", contact_phone:"", business_name:"",
  county:"", sub_county:"", ward:"", visit_purpose:"sale", visit_outcome:"interested",
  products_recommended:"", products_sold:"", order_amount:"", next_visit_date:"",
  notes:"", farm_name:"", crops:[], acreage:"", acreage_unit:"acres",
  soil_type:"", irrigation:false, current_inputs:"", stock_level:"",
  competitor_products:"", display_quality:"", coverage_counties:"",
  team_size:"", monthly_offtake:"", _customerId:null, _linkedOrderId:null,
};

const BLANK_FILTERS = {
  search:"", county:"", visitType:"all", dateFrom:"", dateTo:"",
  staffId:"", purpose:"", outcome:"", minAmount:"", hasPhotos:"",
  irrigationOnly:false, salesOnly:false, followUpDue:false, crop:"",
};

// ─── Utilities (unchanged) ────────────────────────────────────────────────────

async function stampPhoto(photo, position) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const now    = new Date();
      const date   = now.toLocaleDateString("en-KE", { day:"2-digit", month:"short", year:"numeric" });
      const time   = now.toLocaleTimeString("en-KE", { hour:"2-digit", minute:"2-digit", second:"2-digit" });
      const coords = position
        ? `${position.latitude.toFixed(5)}, ${position.longitude.toFixed(5)}`
        : "GPS unavailable";
      const lines  = [`📅 ${date}  ${time}`, `📍 ${coords}`];
      const fontSize = Math.max(20, Math.round(canvas.width * 0.032));
      const padding  = Math.round(fontSize * 0.7);
      const lineH    = Math.round(fontSize * 1.55);
      const boxH     = lineH * lines.length + padding * 2;
      const boxY     = canvas.height - boxH - Math.round(canvas.height * 0.015);
      ctx.fillStyle = "rgba(0,0,0,0.62)";
      ctx.fillRect(0, boxY, canvas.width, boxH + Math.round(canvas.height * 0.015));
      ctx.font = `bold ${fontSize}px 'Courier New', monospace`;
      ctx.fillStyle = "#c8f230";
      ctx.shadowColor = "rgba(0,0,0,0.8)";
      ctx.shadowBlur = 4; ctx.shadowOffsetX = 1; ctx.shadowOffsetY = 1;
      lines.forEach((line, i) => ctx.fillText(line, padding, boxY + padding + fontSize + i * lineH));
      canvas.toBlob(
        blob => resolve({ dataUrl: canvas.toDataURL("image/jpeg", 0.92), blob }),
        "image/jpeg", 0.92
      );
    };
    img.src = photo.dataUrl;
  });
}

function buildFilterParts(filters, userId, isFieldStaff) {
  const parts = [];
  if (isFieldStaff && userId)        parts.push(`staff = "${userId}"`);
  if (!isFieldStaff && filters.staffId) parts.push(`staff = "${filters.staffId}"`);
  if (filters.dateFrom) parts.push(`created >= "${filters.dateFrom} 00:00:00"`);
  if (filters.dateTo)   parts.push(`created <= "${filters.dateTo} 23:59:59"`);
  if (filters.county)   parts.push(`county = "${filters.county}"`);
  if (filters.visitType !== "all") parts.push(`visit_type = "${filters.visitType}"`);
  if (filters.purpose)  parts.push(`visit_purpose = "${filters.purpose}"`);
  if (filters.outcome)  parts.push(`visit_outcome = "${filters.outcome}"`);
  if (filters.minAmount) parts.push(`order_amount >= ${parseFloat(filters.minAmount)}`);
  if (filters.irrigationOnly) parts.push(`irrigation = true`);
  if (filters.salesOnly)      parts.push(`visit_outcome = "purchased"`);
  if (filters.followUpDue)    parts.push(`visit_outcome = "follow_up_needed"`);
  if (filters.search) parts.push(
    `(farmer_name ~ "${filters.search}" || farm_name ~ "${filters.search}" || farmer_phone ~ "${filters.search}" || county ~ "${filters.search}")`
  );
  return parts;
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function isOverdue(visit) {
  if (!visit.next_visit_date) return false;
  return new Date(visit.next_visit_date) < new Date() &&
    visit.visit_outcome === "follow_up_needed";
}

// ─── NEW: Date helpers for report generator ───────────────────────────────────

function getPresetRange(preset) {
  const today = new Date();
  const fmt = (d) => d.toISOString().slice(0, 10);
  const startOf = (d, unit) => {
    const copy = new Date(d);
    if (unit === "week") { copy.setDate(d.getDate() - d.getDay()); }
    if (unit === "month") { copy.setDate(1); }
    if (unit === "quarter") { copy.setMonth(Math.floor(d.getMonth() / 3) * 3, 1); }
    if (unit === "year")  { copy.setMonth(0, 1); }
    return copy;
  };

  const presets = {
    today:         { from: fmt(today),                 to: fmt(today)             },
    yesterday:     { from: fmt(new Date(today - 86400000)), to: fmt(new Date(today - 86400000)) },
    this_week:     { from: fmt(startOf(today, "week")), to: fmt(today)            },
    last_7:        { from: daysAgo(7),                 to: fmt(today)             },
    last_14:       { from: daysAgo(14),                to: fmt(today)             },
    last_30:       { from: daysAgo(30),                to: fmt(today)             },
    this_month:    { from: fmt(startOf(today, "month")), to: fmt(today)           },
    last_month: (() => {
      const s = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const e = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: fmt(s), to: fmt(e) };
    })(),
    this_quarter:  { from: fmt(startOf(today, "quarter")), to: fmt(today)         },
    this_year:     { from: fmt(startOf(today, "year")),    to: fmt(today)         },
    last_90:       { from: daysAgo(90),                to: fmt(today)             },
    all_time:      { from: "2020-01-01",               to: fmt(today)             },
  };
  return presets[preset] || { from: daysAgo(30), to: fmt(today) };
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-KE", {
    day: "2-digit", month: "short", year: "numeric"
  });
}

// ─── NEW: Client-side rich report builder ─────────────────────────────────────

async function buildRichReport(visits, options = {}) {
  const {
    dateFrom, dateTo, staffName = "All Staff",
    orgName = "Field Team", fmt = "excel",
    includeStaffBreakdown = true,
    includeCountyBreakdown = true,
    includeCropIntelligence = true,
    includeTimeline = false,
    compareWithPrevious = false,
    prevVisits = [],
  } = options;

  // Core metrics
  const total     = visits.length;
  const purchased = visits.filter(v => v.visit_outcome === "purchased");
  const revenue   = visits.reduce((s, v) => s + (Number(v.order_amount) || 0), 0);
  const convRate  = total ? ((purchased.length / total) * 100).toFixed(1) : "0";
  const avgOrder  = purchased.length ? Math.round(revenue / purchased.length) : 0;

  // By type
  const byType = {};
  VISIT_TYPES.forEach(t => {
    const tv = visits.filter(v => v.visit_type === t.value);
    byType[t.label] = {
      count: tv.length,
      revenue: tv.reduce((s, v) => s + (Number(v.order_amount) || 0), 0),
      purchased: tv.filter(v => v.visit_outcome === "purchased").length,
    };
  });

  // By county
  const byCounty = {};
  visits.forEach(v => {
    if (!v.county) return;
    if (!byCounty[v.county]) byCounty[v.county] = { count: 0, revenue: 0, purchased: 0 };
    byCounty[v.county].count++;
    byCounty[v.county].revenue += Number(v.order_amount) || 0;
    if (v.visit_outcome === "purchased") byCounty[v.county].purchased++;
  });
  const topCounties = Object.entries(byCounty)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 15);

  // By staff
  const byStaff = {};
  visits.forEach(v => {
    const name = v.expand?.staff?.name || "Unknown";
    if (!byStaff[name]) byStaff[name] = { count: 0, revenue: 0, purchased: 0 };
    byStaff[name].count++;
    byStaff[name].revenue += Number(v.order_amount) || 0;
    if (v.visit_outcome === "purchased") byStaff[name].purchased++;
  });

  // By outcome
  const byOutcome = {};
  VISIT_OUTCOMES.forEach(o => {
    byOutcome[o] = visits.filter(v => v.visit_outcome === o).length;
  });

  // Crop demand
  const cropCounts = {};
  visits.forEach(v => {
    let parsedCrops = v.crops;
    if (typeof parsedCrops === "string") { try { parsedCrops = JSON.parse(parsedCrops); } catch { parsedCrops = []; } }
    const crops = Array.isArray(parsedCrops) ? parsedCrops : [];
    crops.forEach(c => { cropCounts[c] = (cropCounts[c] || 0) + 1; });
  });
  const topCrops = Object.entries(cropCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);

  // Daily timeline (last 30 days max for timeline)
  const dailyCounts = {};
  visits.forEach(v => {
    const day = v.created?.slice(0, 10);
    if (day) { dailyCounts[day] = (dailyCounts[day] || 0) + 1; }
  });

  // Comparison metrics
  let comparison = null;
  if (compareWithPrevious && prevVisits.length) {
    const prevTotal    = prevVisits.length;
    const prevRevenue  = prevVisits.reduce((s, v) => s + (Number(v.order_amount) || 0), 0);
    const prevPurchase = prevVisits.filter(v => v.visit_outcome === "purchased").length;
    comparison = {
      visitsDelta:  prevTotal    ? (((total - prevTotal) / prevTotal) * 100).toFixed(1) : null,
      revenueDelta: prevRevenue  ? (((revenue - prevRevenue) / prevRevenue) * 100).toFixed(1) : null,
      convDelta:    prevPurchase && prevTotal
        ? ((purchased.length / total - prevPurchase / prevTotal) * 100).toFixed(1)
        : null,
      prevTotal, prevRevenue,
      prevConvRate: prevTotal ? ((prevPurchase / prevTotal) * 100).toFixed(1) : "0",
    };
  }

  // County Route Planner — upcoming visits grouped by county, sorted by earliest date
  const today = new Date().toISOString().slice(0, 10);
  const routeMap = {};
  visits.forEach(v => {
    if (!v.next_visit_date || !v.county || v.next_visit_date < today) return;
    if (!routeMap[v.county]) {
      routeMap[v.county] = { county: v.county, count: 0, earliest: v.next_visit_date, names: [] };
    }
    routeMap[v.county].count++;
    routeMap[v.county].names.push(v.farmer_name);
    if (v.next_visit_date < routeMap[v.county].earliest) {
      routeMap[v.county].earliest = v.next_visit_date;
    }
  });
  const routePlan = Object.values(routeMap)
    .sort((a, b) => a.earliest.localeCompare(b.earliest))
    .slice(0, 8);

  // Productivity score per staff member (visits per day in range)
  const daySpan = dateFrom && dateTo
    ? Math.max(1, Math.round((new Date(dateTo) - new Date(dateFrom)) / 86400000) + 1)
    : 30;
  const staffScores = Object.entries(byStaff).map(([name, d]) => ({
    name,
    ...d,
    visitsPerDay: (d.count / daySpan).toFixed(2),
    convRate: d.count ? Math.round((d.purchased / d.count) * 100) : 0,
  })).sort((a, b) => b.revenue - a.revenue);

  return {
    meta: { dateFrom, dateTo, staffName, orgName, generatedAt: new Date().toISOString(), total, daySpan },
    summary: { total, purchased: purchased.length, revenue, convRate, avgOrder },
    byType, byCounty: Object.fromEntries(topCounties), byStaff, byOutcome,
    topCrops, dailyCounts, comparison, routePlan, staffScores,
    visits, // raw for export
  };
}

// ─── NEW: Report Generator Modal ──────────────────────────────────────────────

function ReportGeneratorModal({ open, onClose, staffList, userId, isAdmin }) {
  const [step, setStep] = useState("config");
  const [report, setReport] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);


 const [config, setConfig] = useState({
    preset: "last_30",
    dateFrom: daysAgo(30),
    dateTo: new Date().toISOString().slice(0, 10),
    staffId: "",
    visitType: "all",
    county: "",
    outcome: "",
    fmt: "excel",
  });
  const setC = (k, v) => setConfig(p => ({ ...p, [k]: v }));
  const QUICK_PRESETS = [
    { key: "today",        label: "Today" },
    { key: "this_week",    label: "This Week" },
    { key: "last_7",       label: "Last 7d" },
    { key: "last_30",      label: "Last 30d" },
    { key: "this_month",   label: "This Month" },
    { key: "last_month",   label: "Last Month" },
    { key: "this_quarter", label: "Quarter" },
    { key: "this_year",    label: "This Year" },
  ];
  const applyPreset = (key) => {
    const range = getPresetRange(key);
    setConfig(p => ({ ...p, preset: key, dateFrom: range.from, dateTo: range.to }));
  };

 const generateReport = async () => {
    setGenerating(true);
    setStep("generating");
    try {
      const reportFilterParts = [];
      if (!isAdmin) reportFilterParts.push(`staff = "${userId}"`);
      else if (config.staffId) reportFilterParts.push(`staff = "${config.staffId}"`);
      if (config.dateFrom) reportFilterParts.push(`created >= "${config.dateFrom} 00:00:00"`);
      if (config.dateTo) reportFilterParts.push(`created <= "${config.dateTo} 23:59:59"`);
      if (config.visitType !== "all") reportFilterParts.push(`visit_type = "${config.visitType}"`);
      if (config.county) reportFilterParts.push(`county = "${config.county}"`);
      if (config.outcome) reportFilterParts.push(`visit_outcome = "${config.outcome}"`);
      let allVisits = [], page = 1;
      while (true) {
        const r = await pb.collection("ft_farmer_visits").getList(page, 200, {
          filter: reportFilterParts.join(" && ") || "",

          sort: "-created,-id", expand: "staff",
        });
        allVisits = allVisits.concat(r.items);
        if (r.items.length === 0 || allVisits.length >= r.totalItems) break;
        page++;
      }

      const staffName = config.staffId
        ? (staffList.find(s => s.id === config.staffId)?.name || "Staff Member")
        : "All Staff";
      const built = await buildRichReport(allVisits, {
        dateFrom: config.dateFrom, dateTo: config.dateTo,
        staffName, orgName: "Field Operations",
        fmt: config.fmt,
        includeStaffBreakdown: isAdmin,
        includeCountyBreakdown: true,
        includeCropIntelligence: true,
        compareWithPrevious: false,
        prevVisits: [],
      });


      setReport(built);
      setStep("preview");
    } catch (e) {
      console.error("[ReportGenerator]", e);
      toast.error("Failed to fetch data. Check your connection.");
      setStep("config");
    } finally {
      setGenerating(false);
    }
  };

  const handleExport = async () => {
    if (!report) return;
    setExporting(true);
    try {
      const label = `field-visits-${config.dateFrom}_${config.dateTo}`;

      await exportFarmerVisitsReport({
        visits: report.visits,
        dateRange: `${config.dateFrom} to ${config.dateTo}`,
        fmt: config.fmt,
        label,
        reportData: report, // pass full report for richer exports
      });
      toast.success(`✅ ${config.fmt.toUpperCase()} exported — ${report.meta.total} visits`);
    } catch (e) {
      console.error(e);
      toast.error("Export failed. Try again.");
    } finally {
      setExporting(false);
    }
  };

 // presets defined above as QUICK_PRESETS
  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title="📊 Reports" width="max-w-xl">
      {/* ── Config ── */}
      {step === "config" && (
        <div className="space-y-5">
          {/* Period presets */}
          <div>
            <p className="text-[10px] font-bold text-[#8b95a1] uppercase tracking-wider mb-2">Period</p>
            <div className="grid grid-cols-4 gap-1.5 mb-2">
              {QUICK_PRESETS.map(({ key, label }) => (
                <button key={key} type="button" onClick={() => applyPreset(key)}
                  className={`py-2 rounded-xl text-xs font-semibold border transition-all ${
                    config.preset === key
                      ? "border-[#c8f230] bg-[#c8f230]/10 text-[#c8f230]"
                      : "border-[#21272f] text-[#8b95a1] hover:text-white hover:border-[#2a3040]"
                  }`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input type="date" value={config.dateFrom}
                onChange={e => setConfig(p => ({ ...p, dateFrom: e.target.value, preset: "custom" }))}
                className="w-full bg-[#0d1014] border border-[#21272f] rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-[#c8f230] transition-colors" />
              <input type="date" value={config.dateTo}
                onChange={e => setConfig(p => ({ ...p, dateTo: e.target.value, preset: "custom" }))}
                className="w-full bg-[#0d1014] border border-[#21272f] rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-[#c8f230] transition-colors" />
            </div>
            {config.dateFrom && config.dateTo && (
              <p className="text-[10px] text-[#c8f230] mt-1.5 flex items-center gap-1">
                <Calendar size={10} />
                {formatDateDisplay(config.dateFrom)} → {formatDateDisplay(config.dateTo)}
                {" · "}
                {Math.round((new Date(config.dateTo) - new Date(config.dateFrom)) / 86400000) + 1} days
              </p>
            )}
          </div>

          {/* Filters */}
          <div className="space-y-2">
            <p className="text-[10px] font-bold text-[#8b95a1] uppercase tracking-wider">Filters</p>
            {isAdmin && staffList.length > 0 && (
              <select value={config.staffId} onChange={e => setC("staffId", e.target.value)}
                className="w-full bg-[#0d1014] border border-[#21272f] rounded-xl px-3 py-2.5 text-sm text-[#c2cad4] outline-none focus:border-[#c8f230] transition-colors">
                <option value="">👤 All Staff</option>
                {staffList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            <div className="grid grid-cols-3 gap-2">
              <select value={config.visitType} onChange={e => setC("visitType", e.target.value)}
                className="bg-[#0d1014] border border-[#21272f] rounded-xl px-3 py-2.5 text-sm text-[#c2cad4] outline-none focus:border-[#c8f230] transition-colors">
                <option value="all">🏷 All Types</option>
                {VISIT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <select value={config.county} onChange={e => setC("county", e.target.value)}
                className="bg-[#0d1014] border border-[#21272f] rounded-xl px-3 py-2.5 text-sm text-[#c2cad4] outline-none focus:border-[#c8f230] transition-colors">
                <option value="">📍 All Counties</option>
                {KENYA_COUNTIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={config.outcome} onChange={e => setC("outcome", e.target.value)}
                className="bg-[#0d1014] border border-[#21272f] rounded-xl px-3 py-2.5 text-sm text-[#c2cad4] outline-none focus:border-[#c8f230] transition-colors">
                <option value="">🎯 All Outcomes</option>
                {VISIT_OUTCOMES.map(o => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
              </select>
            </div>
          </div>

          {/* Format */}
          <div>
            <p className="text-[10px] font-bold text-[#8b95a1] uppercase tracking-wider mb-2">Export Format</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: "excel", icon: "📊", label: "Excel", desc: "Full data + charts" },
                { key: "csv",   icon: "📋", label: "CSV",   desc: "Raw, importable" },
                { key: "pdf",   icon: "📄", label: "PDF",   desc: "Formatted report" },
              ].map(({ key, icon, label, desc }) => (
                <button key={key} type="button" onClick={() => setC("fmt", key)}
                  className={`py-3 px-2 rounded-xl border text-left transition-all ${
                    config.fmt === key
                      ? "border-[#c8f230] bg-[#c8f230]/10"
                      : "border-[#21272f] hover:border-[#2a3040]"
                  }`}>
                  <span className="text-base block">{icon}</span>
                  <span className={`text-sm font-bold block ${config.fmt === key ? "text-[#c8f230]" : "text-white"}`}>{label}</span>
                  <span className="text-[10px] text-[#8b95a1]">{desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* What's included */}
          <div className="bg-[#0d1014] border border-[#21272f] rounded-xl px-4 py-3">
            <p className="text-[10px] font-bold text-[#8b95a1] uppercase tracking-wider mb-2">Every report includes</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {[
                "All visit columns", "Revenue & conversions",
                "County breakdown", "Staff performance",
                "Crop demand intel", "Route planner",
                "Outcome summary",  "GPS coordinates",
              ].map(item => (
                <p key={item} className="text-[11px] text-[#c2cad4] flex items-center gap-1.5">
                  <span className="text-[#c8f230]">✓</span> {item}
                </p>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <Btn variant="ghost" onClick={onClose} className="flex-1">Cancel</Btn>
            <Btn onClick={generateReport} className="flex-1 flex items-center justify-center gap-2">
              <Activity size={14} /> Generate Report
            </Btn>
          </div>
        </div>
      )}

      {/* ── Generating ── */}
      {step === "generating" && (
        <div className="py-16 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-[#c8f230]/10 border border-[#c8f230]/20 flex items-center justify-center mx-auto">
            <RefreshCw size={28} className="text-[#c8f230] animate-spin" />
          </div>
          <div>
            <p className="text-white font-bold text-lg">Building Report…</p>
            <p className="text-[#8b95a1] text-sm mt-1">
              {formatDateDisplay(config.dateFrom)} → {formatDateDisplay(config.dateTo)}
            </p>
          </div>
        </div>
      )}

      {/* ── Preview ── */}
      {step === "preview" && report && (
        <div className="space-y-3 max-h-[78vh] overflow-y-auto pr-1">

          {/* Header */}
          <div className="bg-gradient-to-r from-[#0d1f0d] to-[#0d1014] border border-[#4ade80]/20 rounded-2xl px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-white font-bold">Field Visits Report</p>
              <p className="text-[#4ade80] text-xs mt-0.5">
                {formatDateDisplay(config.dateFrom)} → {formatDateDisplay(config.dateTo)} · {report.meta.staffName}
              </p>
            </div>
            <p className="text-3xl font-black text-white">{report.summary.total}</p>
          </div>

          {/* 4 KPIs */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "Visits",    value: report.summary.total,                                   icon: "👣" },
              { label: "Sales",     value: `${report.summary.purchased} (${report.summary.convRate}%)`, icon: "🎯" },
              { label: "Revenue",   value: `KES ${(report.summary.revenue/1000).toFixed(0)}K`,     icon: "💰" },
              { label: "Avg Order", value: `KES ${report.summary.avgOrder.toLocaleString()}`,       icon: "📦" },
            ].map(({ label, value, icon }) => (
              <div key={label} className="bg-[#111418] border border-[#21272f] rounded-xl p-3 text-center">
                <p className="text-lg">{icon}</p>
                <p className="font-black text-white text-sm leading-tight mt-0.5">{value}</p>
                <p className="text-[9px] text-[#8b95a1] mt-0.5 uppercase tracking-wide">{label}</p>
              </div>
            ))}
          </div>

          {/* By Type */}
          <div className="bg-[#111418] border border-[#21272f] rounded-2xl p-4">
            <p className="text-[10px] font-bold text-[#8b95a1] uppercase tracking-wider mb-3">By Visit Type</p>
            <div className="space-y-2">
              {VISIT_TYPES.map(({ value, label, color }) => {
                const d = report.byType[label] || { count: 0, revenue: 0 };
                const pct = report.summary.total ? Math.round((d.count / report.summary.total) * 100) : 0;
                return (
                  <div key={value} className="flex items-center gap-3">
                    <span className="text-xs w-20 flex-shrink-0 font-medium" style={{ color }}>{label}</span>
                    <div className="flex-1 h-2 bg-[#21272f] rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                    </div>
                    <span className="text-xs text-white w-5 text-right font-bold">{d.count}</span>
                    <span className="text-[10px] text-[#8b95a1] w-16 text-right">
                      {d.revenue > 0 ? `KES ${(d.revenue/1000).toFixed(0)}K` : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Outcomes */}
          <div className="bg-[#111418] border border-[#21272f] rounded-2xl p-4">
            <p className="text-[10px] font-bold text-[#8b95a1] uppercase tracking-wider mb-3">Outcomes</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {Object.entries(report.byOutcome).map(([outcome, count]) => (
                <div key={outcome} className="flex justify-between items-center">
                  <span className="text-xs text-[#8b95a1] capitalize">{outcome.replace(/_/g, " ")}</span>
                  <span className="text-xs font-bold text-white">{count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Top Counties */}
          {Object.keys(report.byCounty).length > 0 && (
            <div className="bg-[#111418] border border-[#21272f] rounded-2xl p-4">
              <p className="text-[10px] font-bold text-[#8b95a1] uppercase tracking-wider mb-3">Top Counties by Revenue</p>
              <div className="space-y-1.5">
                {Object.entries(report.byCounty).slice(0, 8).map(([county, d]) => (
                  <div key={county} className="flex items-center gap-2 text-xs">
                    <span className="text-white w-24 flex-shrink-0 truncate font-medium">{county}</span>
                    <span className="text-[#8b95a1] w-5 text-center">{d.count}</span>
                    <div className="flex-1 h-1.5 bg-[#21272f] rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-[#818cf8]"
                        style={{ width: `${report.summary.total ? Math.round((d.count/report.summary.total)*100) : 0}%` }} />
                    </div>
                    <span className="text-[#4ade80] w-20 text-right">
                      {d.revenue > 0 ? `KES ${d.revenue.toLocaleString()}` : "—"}
                    </span>
                    <span className="text-[10px] text-[#818cf8] w-10 text-right">
                      {d.count ? `${Math.round((d.purchased/d.count)*100)}%` : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Staff Leaderboard */}
          {isAdmin && Object.keys(report.byStaff).length > 1 && (
            <div className="bg-[#111418] border border-[#21272f] rounded-2xl p-4">
              <p className="text-[10px] font-bold text-[#8b95a1] uppercase tracking-wider mb-3">🏆 Staff Leaderboard</p>
              <div className="space-y-2">
                {Object.entries(report.byStaff)
                  .sort((a, b) => b[1].revenue - a[1].revenue)
                  .slice(0, 8)
                  .map(([name, d], i) => (
                    <div key={name} className="flex items-center gap-3">
                      <span className={`text-[10px] font-black w-5 text-center ${
                        i===0?"text-[#fbbf24]":i===1?"text-[#94a3b8]":i===2?"text-[#b87333]":"text-[#4b5563]"
                      }`}>#{i+1}</span>
                      <span className="text-xs text-white flex-1 truncate">{name}</span>
                      <span className="text-[10px] text-[#8b95a1]">{d.count}v</span>
                      <span className="text-xs text-[#4ade80] font-bold w-16 text-right">
                        {d.revenue > 0 ? `KES ${(d.revenue/1000).toFixed(0)}K` : "—"}
                      </span>
                      <span className="text-[10px] text-[#818cf8] w-9 text-right">
                        {d.count ? `${Math.round((d.purchased/d.count)*100)}%` : "—"}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Crop Demand */}
          {report.topCrops.length > 0 && (
            <div className="bg-[#111418] border border-[#21272f] rounded-2xl p-4">
              <p className="text-[10px] font-bold text-[#8b95a1] uppercase tracking-wider mb-2">🌱 Crop Demand</p>
              <div className="flex flex-wrap gap-1.5">
                {report.topCrops.map(([crop, count]) => (
                  <span key={crop} className="text-xs px-2.5 py-1 rounded-xl bg-[#c8f230]/10 text-[#c8f230] border border-[#c8f230]/20">
                    {crop} <span className="opacity-60">({count})</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Route Planner */}
          {report.routePlan?.length > 0 && (
            <div className="bg-[#111418] border border-[#21272f] rounded-2xl p-4">
              <p className="text-[10px] font-bold text-[#8b95a1] uppercase tracking-wider mb-3">🗺 Upcoming Route — by County</p>
              <div className="space-y-1.5">
                {report.routePlan.map((r, i) => (
                  <div key={r.county} className="flex items-center gap-3 text-xs">
                    <span className={`font-black w-4 ${i===0?"text-[#c8f230]":"text-[#4b5563]"}`}>#{i+1}</span>
                    <span className="text-white font-medium w-28 flex-shrink-0 truncate">{r.county}</span>
                    <span className="text-[#8b95a1]">{r.count} visits</span>
                    <span className="text-[#c8f230] ml-auto">📅 {r.earliest}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-[10px] text-[#4b5563] text-center pb-1">
            {report.meta.total} visits · Generated {new Date().toLocaleString("en-KE")}
          </p>

          {/* Action bar */}
          <div className="flex gap-2 pt-2 border-t border-[#21272f] sticky bottom-0 bg-[#0d1014] pb-1">
            <button onClick={() => setStep("config")}
              className="py-2.5 px-4 rounded-xl border border-[#21272f] text-[#8b95a1] hover:text-white text-sm font-medium transition-colors flex-shrink-0">
              ← Back
            </button>
            <Btn onClick={handleExport} disabled={exporting} className="flex-1 flex items-center justify-center gap-2">
              {exporting
                ? <><RefreshCw size={13} className="animate-spin" /> Exporting…</>
                : <><Download size={13} /> Export {config.fmt.toUpperCase()} — {report.meta.total} rows</>
              }
            </Btn>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── NEW: Visit Timeline View ─────────────────────────────────────────────────

function TimelineView({ visits, onClose }) {
  const grouped = useMemo(() => {
    const g = {};
    [...visits].sort((a, b) => b.created?.localeCompare(a.created)).forEach(v => {
      const day = v.created?.slice(0, 10);
      if (!day) return;
      if (!g[day]) g[day] = [];
      g[day].push(v);
    });
    return g;
  }, [visits]);

  const days = Object.keys(grouped).sort((a, b) => b.localeCompare(a)).slice(0, 21);
  const maxCount = Math.max(...days.map(d => grouped[d].length), 1);

  return (
    <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
      {/* Heat strip */}
      <div className="bg-[#111418] border border-[#21272f] rounded-2xl p-4">
        <p className="text-xs font-semibold text-[#8b95a1] uppercase tracking-wider mb-3">Activity Heat Map (last 21 days)</p>
        <div className="flex gap-1 items-end">
          {days.slice(0, 21).reverse().map(day => {
            const count = grouped[day]?.length || 0;
            const h = Math.max(6, Math.round((count / maxCount) * 52));
            const isToday = day === new Date().toISOString().slice(0, 10);
            return (
              <div key={day} className="flex-1 flex flex-col items-center gap-1" title={`${day}: ${count} visits`}>
                <span className="text-[9px] text-[#8b95a1] font-bold">{count || ""}</span>
                <div className="w-full rounded-sm transition-all"
                  style={{
                    height: h,
                    background: isToday ? "#c8f230" : count > 5 ? "#4ade80" : count > 2 ? "#4ade8080" : count > 0 ? "#4ade8030" : "#21272f",
                  }} />
                <span className="text-[8px] text-[#4b5563]">{day.slice(8)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Day-by-day log */}
      {days.map(day => {
        const dayVisits = grouped[day];
        const dayRev    = dayVisits.reduce((s, v) => s + (Number(v.order_amount) || 0), 0);
        const label     = new Date(day + "T00:00:00").toLocaleDateString("en-KE", {
          weekday:"short", day:"2-digit", month:"short", year:"numeric"
        });
        return (
          <div key={day}>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex-1 h-px bg-[#21272f]" />
              <span className="text-[10px] font-bold text-[#8b95a1] flex-shrink-0">{label}</span>
              <span className="text-[10px] text-[#4ade80]">{dayVisits.length} visit{dayVisits.length>1?"s":""}</span>
              {dayRev > 0 && <span className="text-[10px] text-[#c8f230]">KES {dayRev.toLocaleString()}</span>}
              <div className="flex-1 h-px bg-[#21272f]" />
            </div>
            <div className="space-y-1.5 pl-2">
              {dayVisits.map(v => {
                const ti = VISIT_TYPES.find(t => t.value === v.visit_type) || VISIT_TYPES[3];
                return (
                  <div key={v.id} className="flex items-center gap-3 py-2 px-3 bg-[#111418] border border-[#21272f] rounded-xl">
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: ti.color }} />
                    <span className="text-xs text-white flex-1 truncate font-medium">{v.farmer_name}</span>
                    <span className="text-[10px] text-[#8b95a1]">{v.county}</span>
                    <Badge label={v.visit_outcome?.replace(/_/g," ")} color={OUTCOME_COLORS[v.visit_outcome]??"default"} size="xs" />
                    {v.order_amount > 0 && (
                      <span className="text-[10px] text-[#4ade80] font-bold">KES {Number(v.order_amount).toLocaleString()}</span>
                    )}
                    <span className="text-[9px] text-[#4b5563] flex-shrink-0">
                      {v.created?.slice(11,16)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {days.length === 0 && (
        <p className="text-center text-[#8b95a1] text-sm py-8">No visit data in timeline</p>
      )}
    </div>
  );
}

// ─── NEW: Revenue Trend Forecaster ────────────────────────────────────────────

function RevenueForecast({ visits }) {
  const forecast = useMemo(() => {
    // Build weekly buckets for the last 8 weeks
    const now   = new Date();
    const weeks = [];
    for (let i = 7; i >= 0; i--) {
      const end   = new Date(now); end.setDate(end.getDate() - i * 7);
      const start = new Date(end); start.setDate(start.getDate() - 6);
      const label = `W${8-i}`;
      const wVisits = visits.filter(v => {
        const d = new Date(v.created);
        return d >= start && d <= end;
      });
      const revenue  = wVisits.reduce((s, v) => s + (Number(v.order_amount) || 0), 0);
      const count    = wVisits.length;
      weeks.push({ label, revenue, count, start: start.toISOString().slice(0,10) });
    }

    // Simple linear regression on revenue
    const n = weeks.length;
    const xMean = (n - 1) / 2;
    const yMean = weeks.reduce((s, w) => s + w.revenue, 0) / n;
    let num = 0, den = 0;
    weeks.forEach((w, i) => {
      num += (i - xMean) * (w.revenue - yMean);
      den += (i - xMean) ** 2;
    });
    const slope     = den ? num / den : 0;
    const intercept = yMean - slope * xMean;

    // Project 4 weeks ahead
    const projected = [1,2,3,4].map(i => ({
      label: `F${i}`,
      revenue: Math.max(0, Math.round(intercept + slope * (n - 1 + i))),
      projected: true,
    }));

    const maxRev = Math.max(...weeks.map(w => w.revenue), ...projected.map(p => p.revenue), 1);
    const trend  = slope > 0 ? "up" : slope < 0 ? "down" : "flat";

    return { weeks, projected, maxRev, trend, slope };
  }, [visits]);

  if (!forecast.weeks.some(w => w.revenue > 0)) return null;

  const all     = [...forecast.weeks, ...forecast.projected];
  const trendColor = forecast.trend === "up" ? "#4ade80" : forecast.trend === "down" ? "#ff4d4f" : "#8b95a1";
  const trendIcon  = forecast.trend === "up" ? "↑" : forecast.trend === "down" ? "↓" : "→";

  return (
    <div className="bg-[#111418] border border-[#21272f] rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-[#8b95a1] uppercase tracking-wider">
          📈 Revenue Trend & 4-Week Forecast
        </p>
        <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ color:trendColor, background:`${trendColor}15` }}>
          {trendIcon} {forecast.trend === "up" ? "Growing" : forecast.trend === "down" ? "Declining" : "Steady"}
        </span>
      </div>
      <div className="flex items-end gap-1 h-20 mb-2">
        {all.map((w, i) => {
          const h   = Math.max(3, Math.round((w.revenue / forecast.maxRev) * 72));
          const isP = !!w.projected;
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-0.5" title={`${w.label}: KES ${w.revenue.toLocaleString()}`}>
              <div className="w-full rounded-t-sm transition-all"
                style={{
                  height: h,
                  background: isP ? `${trendColor}40` : w.revenue > 0 ? trendColor : "#21272f",
                  borderTop: isP ? `2px dashed ${trendColor}` : "none",
                }} />
            </div>
          );
        })}
      </div>
      <div className="flex gap-1">
        {all.map((w, i) => (
          <div key={i} className="flex-1 text-center">
            <span className="text-[8px] text-[#8b95a1]">{w.label}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-4 mt-2 pt-2 border-t border-[#21272f]">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-2 rounded-sm" style={{ background:trendColor }} />
          <span className="text-[10px] text-[#8b95a1]">Actual</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-2 rounded-sm" style={{ background:`${trendColor}40`, border:`1px dashed ${trendColor}` }} />
          <span className="text-[10px] text-[#8b95a1]">Projected (trend-based)</span>
        </div>
        {forecast.projected[0]?.revenue > 0 && (
          <span className="text-[10px] text-[#c8f230] ml-auto font-medium">
            Next week est: KES {forecast.projected[0].revenue.toLocaleString()}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── NEW: Bulk Follow-up Action Bar ───────────────────────────────────────────

function BulkFollowUpBar({ overdueVisits, onDone }) {
  const [selected, setSelected]   = useState(new Set());
  const [newDate,  setNewDate]    = useState("");
  const [saving,   setSaving]     = useState(false);
  const qc = useQueryClient();

  if (!overdueVisits.length) return null;

  const toggleAll = () => {
    if (selected.size === overdueVisits.length) setSelected(new Set());
    else setSelected(new Set(overdueVisits.map(v => v.id)));
  };

  const handleReschedule = async () => {
    if (!newDate) return toast.error("Set a new visit date first");
    if (!selected.size) return toast.error("Select visits to reschedule");
    setSaving(true);
    let done = 0, failed = 0;
    for (const id of selected) {
      try {
        await pb.collection("ft_farmer_visits").update(id, { next_visit_date: newDate });
        done++;
      } catch { failed++; }
    }
    qc.invalidateQueries(["farmer-visits"]);
    qc.invalidateQueries(["farmer-visits-all"]);
    setSaving(false);
    setSelected(new Set());
    if (failed) toast.error(`${done} rescheduled, ${failed} failed`);
    else        toast.success(`✅ ${done} follow-up${done>1?"s":""} rescheduled`);
    onDone?.();
  };

  return (
    <div className="bg-[#0d1b2a] border border-[#1e3a5f] rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertCircle size={14} className="text-[#fbbf24] animate-pulse" />
          <span className="text-sm font-bold text-[#fbbf24]">{overdueVisits.length} Overdue Follow-ups</span>
        </div>
        <button onClick={toggleAll} className="text-[10px] text-[#60a5fa] hover:underline">
          {selected.size === overdueVisits.length ? "Deselect all" : "Select all"}
        </button>
      </div>

      <div className="space-y-1.5 max-h-48 overflow-y-auto">
        {overdueVisits.map(v => (
          <button key={v.id} type="button"
            onClick={() => {
              const next = new Set(selected);
              next.has(v.id) ? next.delete(v.id) : next.add(v.id);
              setSelected(next);
            }}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl border text-left transition-all ${
              selected.has(v.id)
                ? "border-[#fbbf24]/40 bg-[#fbbf24]/5"
                : "border-[#21272f] hover:border-[#2a3040]"
            }`}>
            {selected.has(v.id)
              ? <CheckSquare size={13} className="text-[#fbbf24] flex-shrink-0" />
              : <Square      size={13} className="text-[#8b95a1] flex-shrink-0" />
            }
            <div className="flex-1 min-w-0">
              <p className="text-xs text-white font-medium truncate">{v.farmer_name}</p>
              <p className="text-[10px] text-[#8b95a1]">{v.county} · Due: {v.next_visit_date}</p>
            </div>
            <Badge label={v.visit_purpose?.replace(/_/g," ")} size="xs" />
          </button>
        ))}
      </div>

      {selected.size > 0 && (
        <div className="flex gap-2 pt-2 border-t border-[#1e3a5f]">
          <div className="flex-1">
            <label className="text-[10px] text-[#8b95a1] block mb-1">Reschedule to</label>
            <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
              className="w-full bg-[#0d1014] border border-[#21272f] rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-[#fbbf24] transition-colors" />
          </div>
          <div className="flex flex-col justify-end">
            <Btn onClick={handleReschedule} disabled={saving || !newDate}
              className="!bg-[#fbbf24] !text-[#0a0d0f] hover:!bg-[#f59e0b] whitespace-nowrap">
              {saving ? "Saving…" : `Reschedule ${selected.size}`}
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── NEW: Staff Leaderboard (admin) ──────────────────────────────────────────

function StaffLeaderboard({ visits }) {
  const leaderboard = useMemo(() => {
    const map = {};
    visits.forEach(v => {
      const name = v.expand?.staff?.name || "Unknown";
      if (!map[name]) map[name] = { visits:0, revenue:0, purchased:0 };
      map[name].visits++;
      map[name].revenue   += Number(v.order_amount) || 0;
      if (v.visit_outcome === "purchased") map[name].purchased++;
    });
    return Object.entries(map)
      .map(([name, d]) => ({ name, ...d, convRate: d.visits ? Math.round((d.purchased/d.visits)*100) : 0 }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [visits]);

  if (leaderboard.length < 2) return null;

  const medals = ["🥇","🥈","🥉"];

  return (
    <div className="bg-[#111418] border border-[#21272f] rounded-2xl p-4">
      <p className="text-xs font-semibold text-[#8b95a1] uppercase tracking-wider mb-3">
        🏆 Staff Leaderboard
      </p>
      <div className="space-y-2">
        {leaderboard.slice(0, 8).map(({ name, visits:v, revenue, convRate }, i) => (
          <div key={name} className="flex items-center gap-3">
            <span className="text-base w-6 flex-shrink-0">{medals[i] || `#${i+1}`}</span>
            <span className="text-xs text-white flex-1 truncate font-medium">{name}</span>
            <span className="text-[10px] text-[#8b95a1]">{v}v</span>
            <span className="text-xs font-bold" style={{ color: revenue > 0 ? "#4ade80" : "#4b5563" }}>
              {revenue > 0 ? `KES ${(revenue/1000).toFixed(0)}K` : "—"}
            </span>
            <span className="text-[10px] text-[#818cf8] w-9 text-right">{convRate}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Analytics (unchanged from v5 + new forecast) ────────────────────────────

function useAnalytics(visits) {
  return useMemo(() => {
    if (!visits.length) return null;

    const revenueByType = {};
    VISIT_TYPES.forEach(t => { revenueByType[t.value] = 0; });
    visits.forEach(v => {
      revenueByType[v.visit_type] = (revenueByType[v.visit_type] || 0) + (Number(v.order_amount) || 0);
    });

    const countyCounts = {};
    visits.forEach(v => { if (v.county) countyCounts[v.county] = (countyCounts[v.county] || 0) + 1; });
    const topCounties = Object.entries(countyCounts)
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([county, count]) => ({ county, count, pct: Math.round((count / visits.length) * 100) }));

    const byDow = Array(7).fill(0);
    const dowLabels = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    visits.forEach(v => { byDow[new Date(v.created).getDay()]++; });
    const bestDay = dowLabels[byDow.indexOf(Math.max(...byDow))];

    const total      = visits.length;
    const purchased  = visits.filter(v => v.visit_outcome === "purchased").length;
    const interested = visits.filter(v => v.visit_outcome === "interested").length;
    const followUp   = visits.filter(v => v.visit_outcome === "follow_up_needed").length;
    const notInt     = visits.filter(v => v.visit_outcome === "not_interested").length;
    const convRate   = total ? Math.round((purchased / total) * 100) : 0;

    const totalRevenue  = visits.reduce((s, v) => s + (Number(v.order_amount) || 0), 0);
    const avgOrderValue = purchased ? Math.round(totalRevenue / purchased) : 0;

    const overdue = visits.filter(isOverdue);

    const thisWeekStart = daysAgo(7);
    const lastWeekStart = daysAgo(14);
    const thisWeek = visits.filter(v => v.created?.slice(0,10) >= thisWeekStart).length;
    const lastWeek = visits.filter(v =>
      v.created?.slice(0,10) >= lastWeekStart && v.created?.slice(0,10) < thisWeekStart
    ).length;
    const weekTrend = lastWeek ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : null;

    const cropCounts = {};
    visits.forEach(v => {
      let parsedCrops = v.crops;
      if (typeof parsedCrops === "string") { try { parsedCrops = JSON.parse(parsedCrops); } catch { parsedCrops = []; } }
      const crops = Array.isArray(parsedCrops) ? parsedCrops : [];
      crops.forEach(c => { cropCounts[c] = (cropCounts[c] || 0) + 1; });
    });
    const topCrops = Object.entries(cropCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);

    const maxTypeRev = Math.max(...Object.values(revenueByType), 1);

    return {
      revenueByType, maxTypeRev, topCounties, bestDay, byDow, dowLabels,
      total, purchased, interested, followUp, notInt, convRate,
      totalRevenue, avgOrderValue, overdue, thisWeek, lastWeek, weekTrend, topCrops,
    };
  }, [visits]);
}

// ─── Analytics Dashboard (v5 unchanged + forecast) ───────────────────────────

function AnalyticsDashboard({ analytics, allVisits, onFollowUpClick, isAdmin }) {
  if (!analytics) return (
    <div className="bg-[#111418] border border-[#21272f] rounded-2xl p-8 text-center text-[#8b95a1] text-sm">
      No visit data yet — log your first visit to see insights.
    </div>
  );

  const {
    convRate, avgOrderValue, weekTrend, thisWeek,
    purchased, interested, followUp, notInt, total,
    overdue, topCounties, bestDay, byDow, dowLabels,
    topCrops, revenueByType, maxTypeRev,
  } = analytics;

  const funnelData = [
    { label:"Purchased",  count:purchased,  color:"#4ade80" },
    { label:"Interested", count:interested, color:"#60a5fa" },
    { label:"Follow Up",  count:followUp,   color:"#fbbf24" },
    { label:"Not Int.",   count:notInt,     color:"#6b7280" },
  ];

  return (
    <div className="space-y-3">

      {overdue.length > 0 && (
        <button onClick={onFollowUpClick}
          className="w-full flex items-center gap-3 px-4 py-3 bg-[#fbbf24]/10 border border-[#fbbf24]/30 rounded-2xl hover:bg-[#fbbf24]/15 transition-colors text-left">
          <AlertCircle size={18} className="text-[#fbbf24] flex-shrink-0 animate-pulse" />
          <div className="flex-1">
            <p className="text-sm font-bold text-[#fbbf24]">
              {overdue.length} overdue follow-up{overdue.length > 1 ? "s" : ""}
            </p>
            <p className="text-xs text-[#8b95a1]">Customers waiting — tap to filter</p>
          </div>
          <ChevronDown size={14} className="text-[#fbbf24]" />
        </button>
      )}

      <div className="grid grid-cols-3 gap-2">
        {[
          { label:"Conv. Rate",  value:`${convRate}%`,                       icon:"🎯", color:"#4ade80" },
          { label:"Avg Order",   value:`KES ${avgOrderValue.toLocaleString()}`, icon:"💰", color:"#c8f230" },
          { label:"This Week",   value:thisWeek,
            sub: weekTrend !== null ? `${weekTrend > 0 ? "+" : ""}${weekTrend}% vs last wk` : null,
            icon:"📅", color: weekTrend > 0 ? "#4ade80" : weekTrend < 0 ? "#ff4d4f" : "#8b95a1" },
        ].map(({ label, value, sub, icon, color }) => (
          <div key={label} className="bg-[#111418] border border-[#21272f] rounded-xl p-3 text-center">
            <p className="text-lg mb-0.5">{icon}</p>
            <p className="font-bold text-white text-base leading-tight">{value}</p>
            {sub && <p className="text-[10px] mt-0.5" style={{ color }}>{sub}</p>}
            <p className="text-[10px] text-[#8b95a1] mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Revenue Forecast — NEW in v6 */}
      <RevenueForecast visits={allVisits || []} />

      <div className="bg-[#111418] border border-[#21272f] rounded-2xl p-4">
        <p className="text-xs font-semibold text-[#8b95a1] uppercase tracking-wider mb-3">Outcome Breakdown</p>
        <div className="space-y-2">
          {funnelData.map(({ label, count, color }) => {
            const pct = total ? Math.round((count / total) * 100) : 0;
            return (
              <div key={label} className="flex items-center gap-3">
                <span className="text-xs text-[#8b95a1] w-20 flex-shrink-0">{label}</span>
                <div className="flex-1 h-2 bg-[#21272f] rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{ width:`${pct}%`, background:color }} />
                </div>
                <span className="text-xs font-bold text-white w-6 text-right">{count}</span>
                <span className="text-[10px] text-[#8b95a1] w-7">{pct}%</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-[#111418] border border-[#21272f] rounded-2xl p-4">
        <p className="text-xs font-semibold text-[#8b95a1] uppercase tracking-wider mb-3">Revenue by Type</p>
        <div className="space-y-2">
          {VISIT_TYPES.map(({ value, label, color }) => {
            const rev = revenueByType[value] || 0;
            const pct = Math.round((rev / maxTypeRev) * 100);
            return (
              <div key={value} className="flex items-center gap-3">
                <span className="text-xs w-20 flex-shrink-0" style={{ color }}>{label}</span>
                <div className="flex-1 h-2 bg-[#21272f] rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{ width:`${pct}%`, background:color }} />
                </div>
                <span className="text-xs text-[#8b95a1] w-20 text-right">
                  {rev > 0 ? `KES ${(rev/1000).toFixed(0)}K` : "—"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-[#111418] border border-[#21272f] rounded-2xl p-4">
        <p className="text-xs font-semibold text-[#8b95a1] uppercase tracking-wider mb-1">
          Activity by Day
          <span className="text-[#c8f230] font-bold ml-2">Best: {bestDay}</span>
        </p>
        <p className="text-[10px] text-[#8b95a1] mb-3">Use this to plan visit schedules</p>
        <div className="flex items-end gap-1.5 h-14">
          {byDow.map((count, i) => {
            const max = Math.max(...byDow) || 1;
            const h   = Math.max(4, Math.round((count / max) * 48));
            const isToday = new Date().getDay() === i;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full rounded-sm transition-all duration-500"
                  style={{ height:h, background: isToday ? "#c8f230" : count ? "#4ade8060" : "#21272f" }} />
                <span className="text-[9px] text-[#8b95a1]">{dowLabels[i][0]}</span>
              </div>
            );
          })}
        </div>
      </div>

      {topCounties.length > 0 && (
        <div className="bg-[#111418] border border-[#21272f] rounded-2xl p-4">
          <p className="text-xs font-semibold text-[#8b95a1] uppercase tracking-wider mb-3">Top Counties</p>
          <div className="space-y-2">
            {topCounties.map(({ county, count, pct }) => (
              <div key={county} className="flex items-center gap-3">
                <span className="text-xs text-white w-28 flex-shrink-0 truncate">{county}</span>
                <div className="flex-1 h-1.5 bg-[#21272f] rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-[#818cf8] transition-all duration-500"
                    style={{ width:`${pct}%` }} />
                </div>
                <span className="text-xs text-[#8b95a1] w-6 text-right">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {topCrops.length > 0 && (
        <div className="bg-[#111418] border border-[#21272f] rounded-2xl p-4">
          <p className="text-xs font-semibold text-[#8b95a1] uppercase tracking-wider mb-1">
            🌱 Crop Demand Intelligence
          </p>
          <p className="text-[10px] text-[#8b95a1] mb-3">Based on farmer visits — plan your stock accordingly</p>
          <div className="flex flex-wrap gap-2">
            {topCrops.map(([crop, count]) => (
              <span key={crop}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-xl bg-[#c8f230]/10 text-[#c8f230] border border-[#c8f230]/20 font-medium">
                {crop}
                <span className="text-[10px] bg-[#c8f230]/20 px-1.5 py-0.5 rounded-full">{count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Staff leaderboard in analytics (admin) */}
      {isAdmin && allVisits?.length > 0 && (
        <StaffLeaderboard visits={allVisits} />
      )}
    </div>
  );
}

// ─── All v5 sub-components (unchanged) ───────────────────────────────────────

function QuickLogModal({ open, onClose, onSuccess, user, position, online }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    visit_type:"farmer", contact_name:"", county:"",
    visit_purpose:"sale", visit_outcome:"interested", notes:"",
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]:v }));

  const submit = async () => {
    if (!form.contact_name.trim()) return toast.error("Name required");
    if (!form.county)              return toast.error("County required");
    setSaving(true);
    try {
      const payload = {
        staff:user.id, org_id:user.org_id, visit_type:form.visit_type, farmer_name:form.contact_name,
        county:form.county, visit_purpose:form.visit_purpose, visit_outcome:form.visit_outcome,
        notes:form.notes, gps_lat:position?.latitude??null, gps_lng:position?.longitude??null,
        farmer_phone:"", farm_name:"", sub_county:"", ward:"",
        products_recommended:"", products_sold:"", order_amount:0, next_visit_date:"",
        crops:JSON.stringify([]), acreage:null, acreage_unit:"acres",
        soil_type:"", irrigation:false, current_inputs:"",
      };
      if (!isOnline()) {
        await enqueueFarmerVisit(payload);
        toast("📴 Quick visit saved offline", { icon:"📴", duration:4000,
          style:{ background:"#181c21", color:"#ff9f43" } });
      } else {
        await pb.collection("ft_farmer_visits").create(payload);
        toast.success("⚡ Quick visit logged!");
      }
      qc.invalidateQueries(["farmer-visits"]);
      qc.invalidateQueries(["farmer-visits-all"]);
      onSuccess();
    } catch {
      toast.error("Failed to save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="⚡ Quick Log" width="max-w-sm">
      <div className="space-y-3">
        <div className="px-3 py-2 bg-[#c8f230]/10 border border-[#c8f230]/20 rounded-xl">
          <p className="text-xs text-[#c8f230] font-medium">
            Minimal details — add full notes later from the visit list
          </p>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {VISIT_TYPES.map(({ value:v, label, Icon, color, bg }) => (
            <button key={v} type="button" onClick={() => set("visit_type", v)}
              className="flex flex-col items-center gap-1 py-2 rounded-xl border text-[10px] font-bold transition-all"
              style={{
                borderColor: form.visit_type===v ? color : "#21272f",
                background:  form.visit_type===v ? bg    : "#111418",
                color:       form.visit_type===v ? color : "#8b95a1",
              }}>
              <Icon size={14} />{label}
            </button>
          ))}
        </div>
        <Input label="Name *" placeholder="Customer / farmer name"
          value={form.contact_name} onChange={e => set("contact_name", e.target.value)} />
        <Select label="County *" value={form.county} onChange={e => set("county", e.target.value)}>
          <option value="">Select county…</option>
          {KENYA_COUNTIES.map(c => <option key={c} value={c}>{c}</option>)}
        </Select>
        <div className="grid grid-cols-2 gap-2">
          <Select label="Purpose" value={form.visit_purpose} onChange={e => set("visit_purpose", e.target.value)}>
            {VISIT_PURPOSES.map(p => <option key={p} value={p}>{p.replace(/_/g," ")}</option>)}
          </Select>
          <Select label="Outcome" value={form.visit_outcome} onChange={e => set("visit_outcome", e.target.value)}>
            {VISIT_OUTCOMES.map(o => <option key={o} value={o}>{o.replace(/_/g," ")}</option>)}
          </Select>
        </div>
        <Textarea label="Quick Note (optional)" placeholder="One-line observation"
          rows={2} value={form.notes} onChange={e => set("notes", e.target.value)} />
        {position && (
          <p className="text-[10px] text-[#4ade80] flex items-center gap-1">
            <MapPin size={10} /> GPS will be attached automatically
          </p>
        )}
      </div>
      <div className="flex gap-3 pt-4 border-t border-[#21272f] mt-4">
        <Btn variant="ghost" onClick={onClose} className="flex-1">Cancel</Btn>
        <Btn onClick={submit} disabled={saving} className="flex-1">
          {saving ? "Saving…" : "⚡ Log Now"}
        </Btn>
      </div>
    </Modal>
  );
}

function ArrivalPhotoPrompt({ visitType, onPhotoTaken, onSkip, position }) {
  const [camOpen,  setCamOpen]  = useState(false);
  const [stamping, setStamping] = useState(false);
  const typeInfo = VISIT_TYPES.find(t => t.value === visitType) || VISIT_TYPES[3];
  const hint = visitType==="farmer" ? "farm entrance or field"
    : visitType==="agrovet"   ? "agrovet shopfront"
    : visitType==="stockist"  ? "stockist premises"
    : "distributor premises";

  const handleCapture = useCallback(async (photo) => {
    setCamOpen(false); setStamping(true);
    try   { onPhotoTaken(await stampPhoto(photo, position)); }
    catch { onPhotoTaken(photo); }
    finally { setStamping(false); }
  }, [position, onPhotoTaken]);

  return (
    <>
      <div className="flex flex-col items-center text-center px-4 py-6 gap-5">
        <div className="w-20 h-20 rounded-full flex items-center justify-center"
          style={{ background:typeInfo.bg, border:`2px solid ${typeInfo.color}` }}>
          <Camera size={36} style={{ color:typeInfo.color }} />
        </div>
        <div>
          <p className="text-white font-bold text-lg">Snap before you enter</p>
          <p className="text-[#8b95a1] text-sm mt-2 leading-relaxed max-w-xs">
            Quick photo of the <strong className="text-white">{hint}</strong> before
            the conversation. GPS &amp; time stamped automatically.
          </p>
        </div>
        {stamping && (
          <div className="flex items-center gap-2 text-[#c8f230] text-sm">
            <div className="w-4 h-4 border-2 border-[#c8f230] border-t-transparent rounded-full animate-spin" />
            Stamping GPS &amp; time…
          </div>
        )}
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <Btn onClick={() => setCamOpen(true)} disabled={stamping}
            className="w-full flex items-center justify-center gap-2">
            <Camera size={16} /> Open Camera
          </Btn>
          <button onClick={onSkip} className="text-sm text-[#8b95a1] hover:text-white transition-colors py-2">
            Skip photo →
          </button>
        </div>
        {position
          ? <p className="text-[10px] text-[#4ade80] flex items-center gap-1"><MapPin size={10} /> GPS ready (±{Math.round(position.accuracy)}m)</p>
          : <p className="text-[10px] text-[#ff9f43]">⚠️ GPS not yet ready — will stamp without coordinates</p>
        }
      </div>
      <CameraCapture open={camOpen} onClose={() => setCamOpen(false)}
        onCapture={handleCapture} title="Arrival Photo" facingMode="environment" />
    </>
  );
}

function VisitTypeSelector({ value, onChange }) {
  return (
    <div>
      <label className="text-xs font-medium text-[#8b95a1] uppercase tracking-wider block mb-2">Visit Type *</label>
      <div className="grid grid-cols-4 gap-2">
        {VISIT_TYPES.map(({ value:v, label, Icon, color, bg }) => (
          <button key={v} type="button" onClick={() => onChange(v)}
            className="flex flex-col items-center gap-1.5 py-3 px-1 rounded-xl border transition-all text-xs font-semibold"
            style={{
              borderColor: value===v ? color : "#21272f",
              background:  value===v ? bg    : "#111418",
              color:       value===v ? color : "#8b95a1",
            }}>
            <Icon size={18} />{label}
          </button>
        ))}
      </div>
    </div>
  );
}

function CustomerLookup({ visitType, nameValue, onSelect, onChange }) {
  const [results, setResults] = useState([]);
  const timerRef = useRef(null);

  useEffect(() => {
    if (nameValue.length < 2) { setResults([]); return; }
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        const r = await pb.collection("ft_customers").getList(1, 5, {
          filter:`(name ~ "${nameValue}" || phone ~ "${nameValue}") && category = "${visitType}"`,
          sort:"-last_visit_date",
        });
        setResults(r.items);
      } catch { setResults([]); }
    }, 350);
    return () => clearTimeout(timerRef.current);
  }, [nameValue, visitType]);

  const label = visitType==="farmer" ? "Farmer Name *"
    : visitType==="agrovet"  ? "Agrovet / Shop Name *"
    : visitType==="stockist" ? "Stockist Name *"
    : "Distributor Name *";

  return (
    <div className="relative">
      <Input label={label} placeholder="Type to search existing or add new…"
        value={nameValue} onChange={e => onChange(e.target.value)} />
      {results.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-[#181c21] border border-[#2a3040] rounded-xl overflow-hidden shadow-xl">
          <p className="text-[10px] text-[#8b95a1] px-3 py-1.5 border-b border-[#21272f]">
            Existing — tap to fill (avoids duplicates)
          </p>
          {results.map(c => (
            <button key={c.id} type="button"
              onMouseDown={() => { onSelect(c); setResults([]); }}
              className="w-full text-left px-3 py-2.5 hover:bg-[#21272f] transition-colors border-b border-[#21272f] last:border-0">
              <p className="text-sm font-medium text-white">{c.name}</p>
              <p className="text-xs text-[#8b95a1]">
                {c.town ? `${c.town}, ` : ""}{c.county}{c.phone ? ` · ${c.phone}` : ""}
                {c.last_visit_date ? ` · Last: ${c.last_visit_date.slice(0,10)}` : ""}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function LinkedOrderPicker({ phone, name, linkedId, onLink }) {
  const [orders, setOrders] = useState([]);
  useEffect(() => {
    if (!phone || phone.length < 9) { setOrders([]); return; }
    pb.collection("ft_orders").getList(1, 5, {
      filter:`customer_phone = "${phone}" || customer_name ~ "${name}"`, sort:"-created",
    }).then(r => setOrders(r.items)).catch(() => setOrders([]));
  }, [phone, name]);

  if (!orders.length) return null;
  return (
    <div className="bg-[#0d1b2a] border border-[#1e3a5f] rounded-xl p-3 mt-3">
      <p className="text-xs font-semibold text-[#60a5fa] mb-2">
        📋 {orders.length} existing order{orders.length>1?"s":""} — link one?
      </p>
      {orders.map(o => (
        <button key={o.id} type="button"
          onClick={() => onLink(linkedId===o.id ? null : o.id)}
          className="w-full flex justify-between items-center py-2 border-b border-[#1e3a5f] last:border-0 text-left">
          <div>
            <span className="text-sm text-white font-medium">{o.order_no}</span>
            <span className="text-xs text-[#8b95a1] ml-2">
              KES {Number(o.order_amount).toLocaleString()} · {o.status}
            </span>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            linkedId===o.id ? "bg-[#16a34a] text-white" : "bg-[#21272f] text-[#8b95a1]"
          }`}>
            {linkedId===o.id ? "✓ Linked" : "Link"}
          </span>
        </button>
      ))}
    </div>
  );
}

function CropSelector({ selected, onChange }) {
  return (
    <div>
      <label className="text-xs font-medium text-[#8b95a1] uppercase tracking-wider block mb-2">Crops Grown</label>
      <div className="flex flex-wrap gap-1.5">
        {CROPS.map(crop => {
          const on = selected.includes(crop);
          return (
            <button key={crop} type="button"
              onClick={() => onChange(on ? selected.filter(c => c!==crop) : [...selected, crop])}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                on ? "bg-[#c8f230] text-[#0a0d0f]" : "bg-[#21272f] text-[#8b95a1] hover:text-white"
              }`}>
              {crop}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function VisitCard({ visit, onView }) {
  let _crops = visit.crops;
  if (typeof _crops === "string") { try { _crops = JSON.parse(_crops); } catch { _crops = []; } }
  const crops = Array.isArray(_crops) ? _crops : [];
  const typeInfo = VISIT_TYPES.find(t => t.value === visit.visit_type) || VISIT_TYPES[3];
  const { Icon } = typeInfo;
  const overdue  = isOverdue(visit);

  return (
    <div
      className={`bg-[#111418] border rounded-2xl p-4 hover:border-[#2a3040] transition-all cursor-pointer card-lift ${
        overdue ? "border-[#fbbf24]/40" : "border-[#21272f]"
      }`}
      style={{ borderLeft:`3px solid ${overdue ? "#fbbf24" : typeInfo.color}` }}
      onClick={() => onView(visit)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background:typeInfo.bg, color:typeInfo.color }}>
              <Icon size={10} />{typeInfo.label}
            </span>
            <Badge label={visit.visit_outcome?.replace(/_/g," ")}
              color={OUTCOME_COLORS[visit.visit_outcome]??"default"} size="xs" />
            <Badge label={visit.visit_purpose?.replace(/_/g," ")} size="xs" />
            {overdue && (
              <span className="text-[10px] text-[#fbbf24] font-bold flex items-center gap-1">
                <AlertCircle size={10} /> Overdue
              </span>
            )}
          </div>
          <h3 className="font-semibold text-white">
            {visit.farmer_name}
            {visit.farm_name && visit.farm_name !== visit.farmer_name && (
              <span className="text-[#8b95a1] font-normal text-sm ml-1.5">· {visit.farm_name}</span>
            )}
          </h3>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="text-xs text-[#8b95a1] flex items-center gap-1">
              <MapPin size={10} />{visit.county}{visit.sub_county ? `, ${visit.sub_county}` : ""}
            </span>
            {visit.farmer_phone && <span className="text-xs text-[#8b95a1]">📞 {visit.farmer_phone}</span>}
            {visit.order_amount > 0 && (
              <span className="text-xs text-[#4ade80] font-semibold">
                KES {Number(visit.order_amount).toLocaleString()}
              </span>
            )}
            <span className="text-xs text-[#4b5563]">
              {new Date(visit.created).toLocaleDateString("en-KE",{day:"2-digit",month:"short",year:"numeric"})}
            </span>
          </div>
          {crops.length > 0 && (
            <div className="flex gap-1 mt-2 flex-wrap">
              {crops.slice(0,3).map(c => (
                <span key={c} className="text-[10px] bg-[#c8f230]/10 text-[#c8f230] px-1.5 py-0.5 rounded-md">{c}</span>
              ))}
              {crops.length > 3 && <span className="text-[10px] text-[#8b95a1]">+{crops.length-3}</span>}
            </div>
          )}
        </div>
        <div className="text-right flex-shrink-0 space-y-0.5">
          {visit.linked_order && <span className="text-[10px] text-[#60a5fa] block">🔗 Order</span>}
          {visit.photos?.length > 0 && (
            <span className="text-[10px] text-[#8b95a1] block">
              📷 {Array.isArray(visit.photos) ? visit.photos.length : 1}
            </span>
          )}
          {visit.next_visit_date && (
            <p className="text-[10px] text-[#818cf8]">📅 {visit.next_visit_date}</p>
          )}
          {visit.expand?.staff && (
            <p className="text-[10px] text-[#8b95a1]">{visit.expand.staff.name}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function PowerFilters({ filters, onChange, onReset, staffList, activeCount }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-[#111418] border border-[#21272f] rounded-2xl overflow-hidden">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#181c21] transition-colors">
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-[#c8f230]" />
          <span className="text-sm font-semibold text-white">Advanced Filters</span>
          {activeCount > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#c8f230] text-[#0a0d0f]">
              {activeCount} active
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {activeCount > 0 && (
            <button type="button" onClick={e => { e.stopPropagation(); onReset(); }}
              className="text-[10px] text-[#ff4d4f] flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#ff4d4f]/10 hover:bg-[#ff4d4f]/20 transition-colors">
              <X size={10} /> Reset
            </button>
          )}
          {open ? <ChevronUp size={14} className="text-[#8b95a1]" /> : <ChevronDown size={14} className="text-[#8b95a1]" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-[#21272f] p-4 space-y-4">
          <div>
            <label className="text-[10px] text-[#8b95a1] uppercase tracking-wider block mb-2">Date Range</label>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <input type="date" value={filters.dateFrom} onChange={e => onChange("dateFrom", e.target.value)}
                className="w-full bg-[#0d1014] border border-[#21272f] rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-[#c8f230] transition-colors" />
              <input type="date" value={filters.dateTo} onChange={e => onChange("dateTo", e.target.value)}
                className="w-full bg-[#0d1014] border border-[#21272f] rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-[#c8f230] transition-colors" />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {[
                { label:"Today",     from:daysAgo(0),  to:daysAgo(0)  },
                { label:"This week", from:daysAgo(7),  to:daysAgo(0)  },
                { label:"30 days",   from:daysAgo(30), to:daysAgo(0)  },
                { label:"90 days",   from:daysAgo(90), to:daysAgo(0)  },
              ].map(({ label, from, to }) => (
                <button key={label} type="button"
                  onClick={() => { onChange("dateFrom", from); onChange("dateTo", to); }}
                  className="text-[10px] px-2.5 py-1 rounded-lg bg-[#21272f] text-[#8b95a1] hover:text-[#c8f230] hover:bg-[#c8f230]/10 transition-colors font-medium">
                  {label}
                </button>
              ))}
            </div>
          </div>

          {staffList.length > 0 && (
            <div>
              <label className="text-[10px] text-[#8b95a1] uppercase tracking-wider block mb-1">Staff Member</label>
              <select value={filters.staffId} onChange={e => onChange("staffId", e.target.value)}
                className="w-full bg-[#0d1014] border border-[#21272f] rounded-xl px-3 py-2 text-sm text-[#c2cad4] outline-none focus:border-[#c8f230] transition-colors">
                <option value="">All Staff</option>
                {staffList.map(s => (
                  <option key={s.id} value={s.id}>{s.name}{s.county ? ` (${s.county})` : ""}</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-[#8b95a1] uppercase tracking-wider block mb-1">Purpose</label>
              <select value={filters.purpose} onChange={e => onChange("purpose", e.target.value)}
                className="w-full bg-[#0d1014] border border-[#21272f] rounded-xl px-3 py-2 text-sm text-[#c2cad4] outline-none focus:border-[#c8f230] transition-colors">
                <option value="">All</option>
                {VISIT_PURPOSES.map(p => <option key={p} value={p}>{p.replace(/_/g," ")}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-[#8b95a1] uppercase tracking-wider block mb-1">Outcome</label>
              <select value={filters.outcome} onChange={e => onChange("outcome", e.target.value)}
                className="w-full bg-[#0d1014] border border-[#21272f] rounded-xl px-3 py-2 text-sm text-[#c2cad4] outline-none focus:border-[#c8f230] transition-colors">
                <option value="">All</option>
                {VISIT_OUTCOMES.map(o => <option key={o} value={o}>{o.replace(/_/g," ")}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-[#8b95a1] uppercase tracking-wider block mb-1">Min Order (KES)</label>
              <input type="number" min="0" placeholder="0" value={filters.minAmount}
                onChange={e => onChange("minAmount", e.target.value)}
                className="w-full bg-[#0d1014] border border-[#21272f] rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-[#c8f230] transition-colors" />
            </div>
            <div>
              <label className="text-[10px] text-[#8b95a1] uppercase tracking-wider block mb-1">Photos</label>
              <div className="flex gap-1.5">
                {[{ value:"", label:"Any" }, { value:"yes", label:"Has 📷" }].map(opt => (
                  <button key={opt.value} type="button" onClick={() => onChange("hasPhotos", opt.value)}
                    className={`flex-1 text-xs py-2 px-1 rounded-xl border font-medium transition-all ${
                      filters.hasPhotos===opt.value
                        ? "border-[#c8f230] bg-[#c8f230]/10 text-[#c8f230]"
                        : "border-[#21272f] text-[#8b95a1] hover:text-white"
                    }`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="text-[10px] text-[#8b95a1] uppercase tracking-wider block mb-1">Crop (client-side)</label>
            <select value={filters.crop} onChange={e => onChange("crop", e.target.value)}
              className="w-full bg-[#0d1014] border border-[#21272f] rounded-xl px-3 py-2 text-sm text-[#c2cad4] outline-none focus:border-[#c8f230] transition-colors">
              <option value="">All Crops</option>
              {CROPS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label className="text-[10px] text-[#8b95a1] uppercase tracking-wider block mb-2">Quick Filters</label>
            <div className="flex gap-2 flex-wrap">
              {[
                { key:"irrigationOnly", label:"🚿 Irrigated" },
                { key:"salesOnly",      label:"💰 Sales Only" },
                { key:"followUpDue",    label:"🔔 Follow-up Due" },
              ].map(({ key, label }) => (
                <button key={key} type="button" onClick={() => onChange(key, !filters[key])}
                  className={`text-xs py-1.5 px-3 rounded-xl border font-medium transition-all ${
                    filters[key]
                      ? "border-[#c8f230] bg-[#c8f230]/10 text-[#c8f230]"
                      : "border-[#21272f] text-[#8b95a1] hover:text-white"
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function FarmerVisitsPage() {
  const { user }     = useAuth();
  const isAdmin      = ["admin","manager","supervisor"].includes(user?.role);
  const { position } = useGPS();
  const qc           = useQueryClient();
  const online       = isOnline();

  const [showCreate,     setShowCreate]     = useState(false);
  const [showQuickLog,   setShowQuickLog]   = useState(false);
  const [showReport,     setShowReport]     = useState(false);   // v6: replaces basic export modal
  const [showAnalytics,  setShowAnalytics]  = useState(false);
  const [showTimeline,   setShowTimeline]   = useState(false);   // v6 NEW
  const [showFollowUps,  setShowFollowUps]  = useState(false);   // v6 NEW
  const [formStep,       setFormStep]       = useState("arrive");
  const [selected,       setSelected]       = useState(null);
  const [arrivalPhoto,   setArrivalPhoto]   = useState(null);
  const [extraCamOpen,   setExtraCamOpen]   = useState(false);
  const [capturedPhotos, setCapturedPhotos] = useState([]);
  const [form,           setForm]           = useState(BLANK_FORM);
  const [page,           setPage]           = useState(1);
  const [filters,        setFilters]        = useState(BLANK_FILTERS);

  const setFilter = useCallback((key, value) => {
    setFilters(f => ({ ...f, [key]:value }));
    setPage(1);
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(BLANK_FILTERS);
    setPage(1);
  }, []);

  const activeFilterCount = useMemo(() => [
    filters.dateFrom, filters.dateTo, filters.staffId, filters.county,
    filters.visitType !== "all" ? filters.visitType : "",
    filters.purpose, filters.outcome, filters.minAmount, filters.hasPhotos, filters.crop,
    filters.irrigationOnly ? "1" : "",
    filters.salesOnly      ? "1" : "",
    filters.followUpDue    ? "1" : "",
  ].filter(Boolean).length, [filters]);

  const { data: staffData } = useQuery({
    queryKey: ["staff-list"],
    queryFn:  () => pb.collection("ft_users").getFullList({
      filter:"role = 'field_staff'", sort:"name", fields:"id,name,county,role",
    }),
    enabled:   isAdmin,
    staleTime: 300000,
  });
  const staffList = staffData || [];

  const openCreate = () => {
    setFormStep("arrive"); setArrivalPhoto(null);
    setCapturedPhotos([]); setForm(BLANK_FORM); setShowCreate(true);
  };
  const handleArrivalPhoto = useCallback((photo) => {
    setArrivalPhoto(photo); setCapturedPhotos([photo]); setFormStep("form");
  }, []);
  const handleSkipArrival = () => { setArrivalPhoto(null); setFormStep("form"); };
  const handleExtraCapture = useCallback(async (photo) => {
    setExtraCamOpen(false);
    try {
      const s = await stampPhoto(photo, position);
      setCapturedPhotos(p => [...p, s]);
      toast.success("Photo added!");
    } catch {
      setCapturedPhotos(p => [...p, photo]);
      toast.success("Photo added!");
    }
  }, [position]);

  const set          = (k, v) => setForm(p => ({ ...p, [k]:v }));
  const setVisitType = t => setForm(p => ({
    ...BLANK_FORM, visit_type:t,
    contact_name:p.contact_name, contact_phone:p.contact_phone,
    county:p.county, sub_county:p.sub_county,
  }));
  const handleSelectCustomer = c => setForm(p => ({
    ...p, contact_name:c.name, contact_phone:c.phone||p.contact_phone,
    business_name:c.name, county:c.county||p.county,
    sub_county:c.town||p.sub_county, _customerId:c.id,
  }));

  const filterParts = buildFilterParts(filters, user?.id, !isAdmin);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["farmer-visits", user?.id, isAdmin, filters, page],
    queryFn: () => pb.collection("ft_farmer_visits").getList(page, PAGE_SIZE, {
      filter: filterParts.join(" && ") || "", sort:"-created,-id", expand:"staff",
    }),
    keepPreviousData: true,
    refetchInterval:  60000,
  });

  const { data: allData } = useQuery({
    queryKey: ["farmer-visits-all", user?.id, isAdmin],
    queryFn:  () => pb.collection("ft_farmer_visits").getList(1, 500, {
      filter: isAdmin ? "" : `staff = "${user?.id}"`, sort:"-created,-id", expand:"staff",
    }),
    enabled:   showAnalytics || showTimeline || showFollowUps || showReport,
    staleTime: 120000,
  });

  const visits     = data?.items ?? [];
  const totalItems = data?.totalItems ?? 0;
  const hasMore    = page * PAGE_SIZE < totalItems;

  const displayVisits = useMemo(() => {
    if (!filters.crop) return visits;
    return visits.filter(v => Array.isArray(v.crops) && v.crops.includes(filters.crop));
  }, [visits, filters.crop]);

  const allVisits  = allData?.items ?? [];
  const analytics  = useAnalytics(allVisits);

  const statsByType   = VISIT_TYPES.map(t => ({ ...t, count:visits.filter(v=>v.visit_type===t.value).length }));
  const converted     = visits.filter(v => v.visit_outcome==="purchased").length;
  const totalRevenue  = visits.reduce((s,v) => s+(Number(v.order_amount)||0), 0);
  const conversionPct = visits.length ? Math.round((converted/visits.length)*100) : 0;
  const overdueCount  = visits.filter(isOverdue).length;

  // Overdue for bulk action (from all visits when panel open)
  const overdueVisits = useMemo(
    () => allVisits.filter(isOverdue).sort((a,b) => a.next_visit_date?.localeCompare(b.next_visit_date)),
    [allVisits]
  );

  const createMut = useMutation({
    mutationFn: async (formData) => {
      const payload = {
        staff:                user.id,
        org_id:               user.org_id,
        visit_type:           formData.visit_type,
        farmer_name:          formData.contact_name,
        farmer_phone:         formData.contact_phone || "",
        farm_name:            formData.business_name || formData.farm_name || "",
        county:               formData.county,
        sub_county:           formData.sub_county || "",
        ward:                 formData.ward || "",
        visit_purpose:        formData.visit_purpose,
        visit_outcome:        formData.visit_outcome,
        products_recommended: formData.products_recommended || "",
        products_sold:        formData.products_sold || "",
        order_amount:         parseFloat(formData.order_amount) || 0,
        next_visit_date:      formData.next_visit_date || "",
        notes:                formData.notes || "",
        linked_order:         formData._linkedOrderId || "",
        crops:                JSON.stringify(formData.crops || []),
        acreage:              formData.acreage ? parseFloat(formData.acreage) : null,
        acreage_unit:         formData.acreage_unit,
        soil_type:            formData.soil_type || "",
        irrigation:           formData.irrigation,
        current_inputs:       formData.current_inputs || "",
        _meta: JSON.stringify({
          stock_level:formData.stock_level, competitor_products:formData.competitor_products,
          display_quality:formData.display_quality, coverage_counties:formData.coverage_counties,
          team_size:formData.team_size, monthly_offtake:formData.monthly_offtake,
        }),
        gps_lat: position?.latitude  ?? null,
        gps_lng: position?.longitude ?? null,
      };

      if (!isOnline()) {
        await enqueueFarmerVisit(payload);
        return { _offline:true };
      }

      const fd = new FormData();
      Object.entries(payload).forEach(([k, v]) => {
        if (v !== null && v !== undefined)
          fd.append(k, typeof v === "object" ? JSON.stringify(v) : String(v));
      });
      for (const photo of capturedPhotos) {
        if (photo.blob) fd.append("photos", photo.blob, `visit-${Date.now()}.jpg`);
      }
      const visit = await pb.collection("ft_farmer_visits").create(fd);

      try {
        if (formData._customerId) {
          await pb.collection("ft_customers").update(formData._customerId, {
            last_visit_date: new Date().toISOString().slice(0,10),
            ...(formData.visit_outcome==="purchased"
              ? { last_order_date: new Date().toISOString().slice(0,10) } : {}),
          });
        } else if (formData.contact_name.trim()) {
          const existing = await pb.collection("ft_customers").getList(1, 1, {
            filter: formData.contact_phone
              ? `phone = "${formData.contact_phone}"`
              : `name = "${formData.contact_name}" && county = "${formData.county}"`,
          });
          if (!existing.totalItems) {
            await pb.collection("ft_customers").create({
              name:formData.contact_name, phone:formData.contact_phone||"",
              category:formData.visit_type, county:formData.county, town:formData.sub_county||"",
              gps_lat:position?.latitude??null, gps_lng:position?.longitude??null,
              assigned_staff:user.id, status:"active",
              last_visit_date:new Date().toISOString().slice(0,10),
            });
          }
        }
      } catch (e) { console.warn("[FarmerVisits] customer upsert:", e?.message); }

      return visit;
    },
    onSuccess: (result) => {
      qc.invalidateQueries(["farmer-visits"]);
      qc.invalidateQueries(["farmer-visits-all"]);
      setShowCreate(false); setForm(BLANK_FORM); setCapturedPhotos([]);
      if (result?._offline) {
        toast("📴 Visit saved offline — syncs when connected", { icon:"📴", duration:5000,
          style:{ background:"#181c21", color:"#ff9f43", border:"1px solid #ff9f43" } });
      } else {
        toast.success("✅ Visit recorded!");
      }
    },
    onError: (err) => { console.error(err); toast.error("Failed to save. Try again."); },
  });

  const handleSubmit = () => {
    if (!form.contact_name.trim()) return toast.error("Name is required");
    if (!form.county)              return toast.error("County is required");
    if (!form.visit_purpose)       return toast.error("Visit purpose is required");
    if (!form.visit_outcome)       return toast.error("Visit outcome is required");
    createMut.mutate(form);
  };

  return (
    <div className="p-5 max-w-3xl mx-auto space-y-5 pb-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-2xl text-white flex items-center gap-2">
            <Users size={22} className="text-[#c8f230]" /> Field Visits
          </h1>
          <p className="text-[#8b95a1] text-sm mt-0.5">
            {isFetching && !isLoading
              ? <span className="text-[#c8f230]">Refreshing…</span>
              : <>{totalItems.toLocaleString()} visit{totalItems!==1?"s":""}
                  {activeFilterCount > 0 ? " (filtered)" : ""}</>
            }
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap justify-end">
          {!online && (
            <span className="flex items-center gap-1.5 text-xs text-[#ff9f43] bg-[#ff9f43]/10 border border-[#ff9f43]/20 px-3 py-1.5 rounded-xl">
              <WifiOff size={12} /> Offline
            </span>
          )}
          {/* Insights */}
          <button onClick={() => setShowAnalytics(a => !a)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-colors ${
              showAnalytics
                ? "bg-[#c8f230]/10 border-[#c8f230]/40 text-[#c8f230]"
                : "bg-[#111418] border-[#21272f] text-[#8b95a1] hover:text-white"
            }`}>
            <BarChart2 size={12} /> Insights
          </button>
          {/* Timeline — NEW v6 */}
          <button onClick={() => setShowTimeline(t => !t)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-colors ${
              showTimeline
                ? "bg-[#818cf8]/10 border-[#818cf8]/40 text-[#818cf8]"
                : "bg-[#111418] border-[#21272f] text-[#8b95a1] hover:text-white"
            }`}>
            <Calendar size={12} /> Timeline
          </button>
          {/* Report Generator — v6: replaces basic export */}
          {isAdmin && (
            <button onClick={() => setShowReport(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#111418] border border-[#21272f] text-[#8b95a1] hover:text-white text-xs font-medium transition-colors">
              <FileText size={12} /> Reports
            </button>
          )}
          <button onClick={() => setShowQuickLog(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#111418] border border-[#21272f] text-[#c8f230] hover:bg-[#c8f230]/10 text-xs font-bold transition-colors">
            <Zap size={12} /> Quick
          </button>
          <Btn onClick={openCreate}><Plus size={16} /> Log Visit</Btn>
        </div>
      </div>

      {/* Analytics dashboard */}
      {showAnalytics && (
        <AnalyticsDashboard
          analytics={analytics}
          allVisits={allVisits}
          isAdmin={isAdmin}
          onFollowUpClick={() => {
            setFilter("followUpDue", true);
            setShowAnalytics(false);
            setShowFollowUps(true);
          }}
        />
      )}

      {/* Timeline view — v6 NEW */}
      {showTimeline && (
        <div className="bg-[#111418] border border-[#21272f] rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-white flex items-center gap-2">
              <Calendar size={14} className="text-[#818cf8]" /> Visit Timeline
            </p>
            <button onClick={() => setShowTimeline(false)}
              className="text-[#8b95a1] hover:text-white p-1 rounded-lg hover:bg-[#21272f] transition-colors">
              <X size={14} />
            </button>
          </div>
          <TimelineView visits={allVisits.length ? allVisits : visits} onClose={() => setShowTimeline(false)} />
        </div>
      )}

      {/* Bulk follow-up manager — v6 NEW */}
      {showFollowUps && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-bold text-[#fbbf24] flex items-center gap-2">
              <Clock size={14} /> Follow-up Manager
            </p>
            <button onClick={() => setShowFollowUps(false)}
              className="text-[#8b95a1] hover:text-white p-1 rounded-lg hover:bg-[#21272f] transition-colors">
              <X size={14} />
            </button>
          </div>
          <BulkFollowUpBar
            overdueVisits={overdueVisits}
            onDone={() => { qc.invalidateQueries(["farmer-visits"]); }}
          />
        </div>
      )}

      {/* Visit type stat chips */}
      <div className="grid grid-cols-4 gap-2">
        {statsByType.map(({ value, label, Icon, color, bg, count }) => (
          <div key={value}
            className="bg-[#111418] border border-[#21272f] rounded-2xl p-3 text-center cursor-pointer transition-all hover:border-[#2a3040]"
            style={filters.visitType===value ? { borderColor:color, background:bg } : {}}
            onClick={() => setFilter("visitType", filters.visitType===value ? "all" : value)}>
            <Icon size={16} className="mx-auto mb-1" style={{ color }} />
            <p className="font-bold text-white text-lg">{count}</p>
            <p className="text-[10px] text-[#8b95a1]">{label}</p>
          </div>
        ))}
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-[#111418] border border-[#21272f] rounded-xl px-3 py-3">
          <p className="text-[10px] text-[#8b95a1] uppercase tracking-wider">Revenue</p>
          <p className="text-[#4ade80] font-bold text-lg leading-tight">
            KES {totalRevenue.toLocaleString()}
          </p>
        </div>
        <div className="bg-[#111418] border border-[#21272f] rounded-xl px-3 py-3">
          <p className="text-[10px] text-[#8b95a1] uppercase tracking-wider">Conv. Rate</p>
          <p className="text-white font-bold text-lg">
            {conversionPct}<span className="text-sm font-normal text-[#8b95a1]">%</span>
            <span className="text-xs text-[#8b95a1] ml-1">({converted})</span>
          </p>
        </div>
        <button
          onClick={() => { setFilter("followUpDue", !filters.followUpDue); setShowFollowUps(true); }}
          className={`rounded-xl px-3 py-3 text-left transition-all border ${
            overdueCount > 0
              ? "border-[#fbbf24]/30 bg-[#fbbf24]/5"
              : "border-[#21272f] bg-[#111418]"
          }`}>
          <p className="text-[10px] text-[#8b95a1] uppercase tracking-wider">Follow-ups</p>
          <p className={`font-bold text-lg ${overdueCount > 0 ? "text-[#fbbf24]" : "text-white"}`}>
            {overdueCount}
            <span className="text-xs font-normal text-[#8b95a1] ml-1">overdue</span>
          </p>
        </button>
      </div>

      {/* Search + county */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b95a1]" />
          <input
            placeholder="Search name, phone, county…"
            value={filters.search}
            onChange={e => setFilter("search", e.target.value)}
            className="w-full bg-[#111418] border border-[#21272f] rounded-xl pl-9 pr-4 py-2.5 text-sm text-white outline-none focus:border-[#c8f230] transition-colors"
          />
        </div>
        <select value={filters.county} onChange={e => setFilter("county", e.target.value)}
          className="bg-[#111418] border border-[#21272f] rounded-xl px-3 py-2.5 text-sm text-[#8b95a1] outline-none focus:border-[#c8f230] transition-colors">
          <option value="">All Counties</option>
          {KENYA_COUNTIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Power filters (admin) */}
      {isAdmin && (
        <PowerFilters
          filters={filters} onChange={setFilter} onReset={resetFilters}
          staffList={staffList} activeCount={activeFilterCount}
        />
      )}

      {/* Visit list */}
      <div className="space-y-3">
        {isLoading && (
          <div className="py-16 text-center text-[#8b95a1] text-sm">Loading…</div>
        )}
        {displayVisits.map(v => (
          <VisitCard key={v.id} visit={v} onView={setSelected} />
        ))}
        {!isLoading && !displayVisits.length && (
          <div className="py-16 text-center text-[#8b95a1]">
            <Users size={40} className="mx-auto mb-3 opacity-20" />
            <p className="text-sm">No visits match your filters</p>
            {activeFilterCount > 0
              ? <button onClick={resetFilters} className="mt-3 text-xs text-[#c8f230] underline">Clear filters</button>
              : <Btn onClick={openCreate} className="mt-4"><Plus size={14} /> Log your first visit</Btn>
            }
          </div>
        )}
        {hasMore && (
          <button onClick={() => setPage(p => p+1)} disabled={isFetching}
            className="w-full py-3 rounded-xl bg-[#111418] border border-[#21272f] text-sm text-[#8b95a1] hover:text-white hover:border-[#2a3040] transition-colors flex items-center justify-center gap-2">
            {isFetching
              ? <><RefreshCw size={13} className="animate-spin" /> Loading…</>
              : <>Load more · {totalItems - visits.length} remaining</>
            }
          </button>
        )}
      </div>

      {/* ── CREATE MODAL (unchanged from v5) ── */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)}
        title={formStep==="arrive" ? "Start Visit" : "Log Field Visit"} width="max-w-xl">

        {formStep === "arrive" && (
          <ArrivalPhotoPrompt visitType={form.visit_type} position={position}
            onPhotoTaken={handleArrivalPhoto} onSkip={handleSkipArrival} />
        )}

        {formStep === "form" && (
          <div className="space-y-4 max-h-[72vh] overflow-y-auto pr-1">

            {arrivalPhoto && (
              <div className="flex items-center gap-3 px-3 py-2.5 bg-[#0d1f0d] border border-[#4ade80]/30 rounded-xl">
                <img src={arrivalPhoto.dataUrl} alt="Arrival"
                  className="w-12 h-12 rounded-lg object-cover border border-[#4ade80]/40 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-[#4ade80]">✓ Arrival photo captured</p>
                  <p className="text-[10px] text-[#8b95a1]">GPS &amp; timestamp stamped</p>
                </div>
                <button onClick={() => setFormStep("arrive")}
                  className="text-[10px] text-[#8b95a1] hover:text-white underline">Retake</button>
              </div>
            )}

            {!online && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-[#ff9f43]/10 border border-[#ff9f43]/20 rounded-xl">
                <WifiOff size={13} className="text-[#ff9f43] flex-shrink-0" />
                <p className="text-xs text-[#ff9f43]">Offline — saved locally, syncs when connected.</p>
              </div>
            )}

            <VisitTypeSelector value={form.visit_type} onChange={setVisitType} />

            <div className="border-t border-[#21272f] pt-4">
              <p className="text-xs font-semibold text-[#8b95a1] uppercase tracking-wider mb-3">Contact Details</p>
              <CustomerLookup visitType={form.visit_type} nameValue={form.contact_name}
                onChange={v => set("contact_name", v)} onSelect={handleSelectCustomer} />
              <div className="grid grid-cols-2 gap-3 mt-3">
                <Input label="Phone Number" placeholder="07XXXXXXXX" type="tel"
                  value={form.contact_phone} onChange={e => set("contact_phone", e.target.value)} />
                {form.visit_type !== "farmer"
                  ? <Input label="Business / Shop Name" placeholder="Shop name"
                      value={form.business_name} onChange={e => set("business_name", e.target.value)} />
                  : <Input label="Farm / Plot Name" placeholder="e.g. Shamba ya Kilimani"
                      value={form.farm_name} onChange={e => set("farm_name", e.target.value)} />
                }
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <Select label="County *" value={form.county} onChange={e => set("county", e.target.value)}>
                  <option value="">Select county…</option>
                  {KENYA_COUNTIES.map(c => <option key={c} value={c}>{c}</option>)}
                </Select>
                <Input label="Sub-County / Ward" placeholder="Optional"
                  value={form.sub_county} onChange={e => set("sub_county", e.target.value)} />
              </div>
              {position && (
                <div className="flex items-center gap-2 px-3 py-2 bg-[#00c096]/10 border border-[#00c096]/20 rounded-xl mt-3">
                  <MapPin size={12} className="text-[#00c096]" />
                  <span className="text-xs text-[#00c096]">GPS captured (±{Math.round(position.accuracy)}m)</span>
                </div>
              )}
              <LinkedOrderPicker phone={form.contact_phone} name={form.contact_name}
                linkedId={form._linkedOrderId} onLink={id => set("_linkedOrderId", id)} />
            </div>

            <div className="border-t border-[#21272f] pt-4">
              <p className="text-xs font-semibold text-[#8b95a1] uppercase tracking-wider mb-3">Visit Details</p>
              <div className="grid grid-cols-2 gap-3">
                <Select label="Visit Purpose *" value={form.visit_purpose} onChange={e => set("visit_purpose", e.target.value)}>
                  {VISIT_PURPOSES.map(p => <option key={p} value={p}>{p.replace(/_/g," ")}</option>)}
                </Select>
                <Select label="Visit Outcome *" value={form.visit_outcome} onChange={e => set("visit_outcome", e.target.value)}>
                  {VISIT_OUTCOMES.map(o => <option key={o} value={o}>{o.replace(/_/g," ")}</option>)}
                </Select>
              </div>
              <div className="mt-3 space-y-3">
                <Textarea label="Products Recommended" placeholder="Products you recommended" rows={2}
                  value={form.products_recommended} onChange={e => set("products_recommended", e.target.value)} />
                <Textarea label="Products Sold / Ordered" placeholder="Products sold or ordered" rows={2}
                  value={form.products_sold} onChange={e => set("products_sold", e.target.value)} />
                {(form.visit_purpose==="sale" || form.visit_outcome==="purchased") && (
                  <Input label="Order Amount (KES)" type="number" placeholder="0"
                    value={form.order_amount} onChange={e => set("order_amount", e.target.value)} />
                )}
                <Input label="Next Visit Date" type="date"
                  value={form.next_visit_date} onChange={e => set("next_visit_date", e.target.value)} />
                <Textarea label="Field Notes" placeholder="Observations, opportunities, issues…" rows={2}
                  value={form.notes} onChange={e => set("notes", e.target.value)} />
              </div>
            </div>

            {form.visit_type === "farmer" && (
              <div className="border-t border-[#21272f] pt-4 space-y-4">
                <p className="text-xs font-semibold text-[#8b95a1] uppercase tracking-wider">Farm Details</p>
                <CropSelector selected={form.crops} onChange={v => set("crops", v)} />
                <div className="grid grid-cols-3 gap-3">
                  <Input label="Acreage" type="number" min="0" step="0.5" placeholder="2.5"
                    value={form.acreage} onChange={e => set("acreage", e.target.value)} />
                  <Select label="Unit" value={form.acreage_unit} onChange={e => set("acreage_unit", e.target.value)}>
                    <option value="acres">Acres</option>
                    <option value="hectares">Hectares</option>
                  </Select>
                  <Select label="Soil Type" value={form.soil_type} onChange={e => set("soil_type", e.target.value)}>
                    <option value="">Unknown</option>
                    {SOIL_TYPES.map(s => <option key={s} value={s}>{s.replace("_"," ")}</option>)}
                  </Select>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <div onClick={() => set("irrigation", !form.irrigation)}
                    className={`w-10 h-5 rounded-full transition-colors relative ${form.irrigation ? "bg-[#c8f230]" : "bg-[#21272f]"}`}>
                    <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${form.irrigation ? "translate-x-5" : "translate-x-0.5"}`} />
                  </div>
                  <span className="text-sm text-[#c2cad4]">Irrigation system present</span>
                </label>
                <Textarea label="Current Inputs Used" placeholder="What inputs does the farmer currently use?" rows={2}
                  value={form.current_inputs} onChange={e => set("current_inputs", e.target.value)} />
              </div>
            )}

            {(form.visit_type==="stockist" || form.visit_type==="agrovet") && (
              <div className="border-t border-[#21272f] pt-4 space-y-3">
                <p className="text-xs font-semibold text-[#8b95a1] uppercase tracking-wider">
                  {form.visit_type==="agrovet" ? "Agrovet" : "Stockist"} Details
                </p>
                <Select label="Current Stock Level" value={form.stock_level} onChange={e => set("stock_level", e.target.value)}>
                  <option value="">Select…</option>
                  {STOCK_LEVELS.map(s => <option key={s} value={s}>{s.replace(/_/g," ")}</option>)}
                </Select>
                <Textarea label="Competitor Products on Shelf" placeholder="Other brands stocked…" rows={2}
                  value={form.competitor_products} onChange={e => set("competitor_products", e.target.value)} />
                <Select label="Display / Branding Quality" value={form.display_quality} onChange={e => set("display_quality", e.target.value)}>
                  <option value="">Select…</option>
                  {DISPLAY_QUALITY.map(d => <option key={d} value={d}>{d.replace(/_/g," ")}</option>)}
                </Select>
              </div>
            )}

            {form.visit_type === "distributor" && (
              <div className="border-t border-[#21272f] pt-4 space-y-3">
                <p className="text-xs font-semibold text-[#8b95a1] uppercase tracking-wider">Distributor Details</p>
                <Input label="Counties Covered" placeholder="e.g. Nakuru, Baringo, Laikipia"
                  value={form.coverage_counties} onChange={e => set("coverage_counties", e.target.value)} />
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Sales Team Size" type="number" placeholder="No. of reps"
                    value={form.team_size} onChange={e => set("team_size", e.target.value)} />
                  <Input label="Monthly Offtake (KES)" type="number" placeholder="0"
                    value={form.monthly_offtake} onChange={e => set("monthly_offtake", e.target.value)} />
                </div>
              </div>
            )}

            {online && (
              <div className="border-t border-[#21272f] pt-4">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-[#8b95a1] uppercase tracking-wider">Extra Photos</label>
                  <span className="text-[10px] text-[#8b95a1]">{capturedPhotos.length}/4 · GPS+time stamped</span>
                </div>
                <button onClick={() => setExtraCamOpen(true)} disabled={capturedPhotos.length >= 4}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#21272f] text-[#8b95a1] hover:text-white text-xs font-medium transition-colors disabled:opacity-40">
                  <Camera size={13} /> Add Another Photo
                </button>
                {capturedPhotos.length > 0 && (
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {capturedPhotos.map((p, i) => (
                      <div key={i} className="relative w-16 h-16 rounded-xl overflow-hidden border border-[#21272f] group">
                        <img src={p.dataUrl} alt="" className="w-full h-full object-cover" />
                        {i===0 && arrivalPhoto && (
                          <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-[8px] text-[#4ade80] text-center py-0.5">Arrival</div>
                        )}
                        <button
                          onClick={() => {
                            setCapturedPhotos(prev => prev.filter((_,idx) => idx!==i));
                            if (i===0) setArrivalPhoto(null);
                          }}
                          className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-[#ff4d4f] text-white items-center justify-center text-[10px] hidden group-hover:flex">
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {formStep === "form" && (
          <div className="flex gap-3 pt-5 border-t border-[#21272f] mt-5">
            <Btn variant="ghost" onClick={() => setShowCreate(false)} className="flex-1">Cancel</Btn>
            <Btn onClick={handleSubmit} disabled={createMut.isPending} className="flex-1">
              {createMut.isPending ? "Saving…" : online ? "✓ Save Visit" : "💾 Save Offline"}
            </Btn>
          </div>
        )}
      </Modal>

      {/* ── DETAIL MODAL (unchanged from v5) ── */}
      {selected && (
        <Modal open={!!selected} onClose={() => setSelected(null)} title="Visit Details" width="max-w-md">
          <div className="space-y-3 text-sm max-h-[72vh] overflow-y-auto">
            {(() => {
              const ti = VISIT_TYPES.find(t => t.value===selected.visit_type) || VISIT_TYPES[3];
              const { Icon } = ti;
              let meta = {};
              try { meta = JSON.parse(selected._meta || "{}"); } catch {}
              const row = (label, val) => val ? (
                <div key={label} className="flex gap-3">
                  <span className="text-[#8b95a1] text-xs w-36 flex-shrink-0 pt-0.5">{label}</span>
                  <span className="text-[#c2cad4] text-xs">{val}</span>
                </div>
              ) : null;
              return (<>
                <div className="flex gap-2 flex-wrap items-center">
                  <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full"
                    style={{ background:ti.bg, color:ti.color }}><Icon size={12}/>{ti.label}</span>
                  <Badge label={selected.visit_outcome?.replace(/_/g," ")} color={OUTCOME_COLORS[selected.visit_outcome]??"default"} />
                  <Badge label={selected.visit_purpose?.replace(/_/g," ")} />
                  {isOverdue(selected) && (
                    <span className="text-[10px] text-[#fbbf24] font-bold flex items-center gap-1">
                      <AlertCircle size={10} /> Overdue
                    </span>
                  )}
                  <span className="text-[10px] text-[#4b5563] ml-auto">
                    {new Date(selected.created).toLocaleDateString("en-KE",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})}
                  </span>
                </div>
                <div className="space-y-2 bg-[#111418] rounded-xl p-3">
                  {row("Name", selected.farmer_name)}
                  {row("Business", selected.farm_name)}
                  {row("Phone", selected.farmer_phone)}
                  {row("County", selected.county+(selected.sub_county?`, ${selected.sub_county}`:""))}
                  {row("Next Visit", selected.next_visit_date)}
                  {selected.order_amount>0 && row("Order Amount", `KES ${Number(selected.order_amount).toLocaleString()}`)}
                  {row("Products Sold", selected.products_sold)}
                  {row("Products Recommended", selected.products_recommended)}
                  {(() => { let sc = selected.crops; if (typeof sc === "string") { try { sc = JSON.parse(sc); } catch { sc = []; } } selected._parsedCrops = sc; return Array.isArray(sc) && sc.length > 0; })() && (
                    <div className="flex gap-3">
                      <span className="text-[#8b95a1] text-xs w-36 flex-shrink-0 pt-0.5">Crops</span>
                      <div className="flex flex-wrap gap-1">
                        {(selected._parsedCrops || []).map(c => (
                          <span key={c} className="text-[10px] bg-[#c8f230]/10 text-[#c8f230] px-1.5 py-0.5 rounded-md">{c}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {selected.acreage && row("Acreage", `${selected.acreage} ${selected.acreage_unit}`)}
                  {selected.soil_type && row("Soil", selected.soil_type.replace("_"," "))}
                  {meta.stock_level && row("Stock Level", meta.stock_level.replace(/_/g," "))}
                  {meta.display_quality && row("Display Quality", meta.display_quality.replace(/_/g," "))}
                  {meta.competitor_products && row("Competitor Products", meta.competitor_products)}
                  {meta.coverage_counties && row("Counties Covered", meta.coverage_counties)}
                  {meta.team_size && row("Team Size", meta.team_size)}
                  {meta.monthly_offtake && row("Monthly Offtake", `KES ${Number(meta.monthly_offtake).toLocaleString()}`)}
                  {selected.notes && row("Notes", selected.notes)}
                  {selected.linked_order && row("Linked Order", "🔗 "+selected.linked_order)}
                  {selected.expand?.staff && row("Recorded by", selected.expand.staff.name)}
                </div>
                {selected.gps_lat && selected.gps_lng && (
                  <a href={`https://maps.google.com/?q=${selected.gps_lat},${selected.gps_lng}`}
                    target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 px-3 py-2 bg-[#111418] border border-[#21272f] rounded-xl text-xs text-[#60a5fa] hover:border-[#60a5fa] transition-colors">
                    <MapPin size={12}/> View on Google Maps
                  </a>
                )}
                {selected.photos?.length > 0 && (
                  <div>
                    <p className="text-[#8b95a1] text-xs mb-2">Photos</p>
                    <div className="grid grid-cols-2 gap-2">
                      {(Array.isArray(selected.photos)?selected.photos:[selected.photos]).map((photo,i) => (
                        <a key={i} href={`${API}/api/files/ft_farmer_visits/${selected.id}/${photo}`}
                          target="_blank" rel="noreferrer">
                          <img
                            src={`${API}/api/files/ft_farmer_visits/${selected.id}/${photo}?thumb=400x400`}
                            alt={`Visit photo ${i+1}`}
                            className="w-full h-32 object-cover rounded-xl border border-[#21272f] hover:opacity-80 transition-opacity"
                            onError={e => { e.target.style.display="none"; }}
                          />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </>);
            })()}
          </div>
          <div className="pt-4 border-t border-[#21272f] mt-4">
            <Btn variant="ghost" onClick={() => setSelected(null)} className="w-full">Close</Btn>
          </div>
        </Modal>
      )}

      {/* Quick Log */}
      <QuickLogModal
        open={showQuickLog} onClose={() => setShowQuickLog(false)}
        onSuccess={() => setShowQuickLog(false)}
        user={user} position={position} online={online}
      />

      {/* ── Report Generator (v6) ── */}
      <ReportGeneratorModal
        open={showReport} onClose={() => setShowReport(false)}
        staffList={staffList} userId={user?.id} isAdmin={isAdmin}
      />

      <CameraCapture
        open={extraCamOpen} onClose={() => setExtraCamOpen(false)}
        onCapture={handleExtraCapture} title="Visit Photo" facingMode="environment"
      />
    </div>
  );
}