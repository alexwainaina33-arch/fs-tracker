// src/pages/admin/TeamSummaryPage.jsx
import React, { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { pb } from "../../lib/pb";
import { useAuth } from "../../store/auth";
import { Badge } from "../../components/ui/Badge";
import { formatKES } from "../../hooks/useOrders";
import { format, differenceInMinutes, startOfDay, endOfDay, subDays, isToday as fnsIsToday } from "date-fns";
import { useNavigate } from "react-router-dom";
import {
  Users, MapPin, Leaf, ShoppingCart, RefreshCcw, Share2, Map,
  Navigation, Battery, AlertOctagon, TrendingUp, Calendar,
  Filter, X, ChevronDown, Clock, CheckCircle, XCircle,
  Wifi, WifiOff, Search,
} from "lucide-react";
import toast from "react-hot-toast";

// ── Reverse geocoder ──────────────────────────────────────────────────────────
const _geoCache = {};
async function reverseGeocode(lat, lng) {
  if (!lat || !lng || (lat === 0 && lng === 0)) return null;
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  if (_geoCache[key]) return _geoCache[key];
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14`,
      { headers: { "Accept-Language": "en-US,en" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const a = data.address ?? {};
    const place  = a.suburb || a.neighbourhood || a.town || a.village || a.city_district || a.city || a.county || "";
    const region = a.city || a.state_district || a.county || "";
    const result = place && region && region !== place ? `${place}, ${region}` : (place || region || null);
    _geoCache[key] = result;
    return result;
  } catch { return null; }
}
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Helpers ───────────────────────────────────────────────────────────────────
function minsAgo(dateStr) {
  const m = differenceInMinutes(new Date(), new Date(dateStr));
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ${m % 60}m ago`;
}
function gmapsUrl(lat, lng) { return `https://maps.google.com/?q=${lat},${lng}`; }

function waText(name, att, geoName, visitCount, orderCount, orderAmount, dateFrom, dateTo) {
  const dateLabel = dateFrom === dateTo ? format(new Date(dateFrom), "dd MMM yyyy") : `${format(new Date(dateFrom), "dd MMM")} – ${format(new Date(dateTo), "dd MMM yyyy")}`;
  return [
    `*${name} — ${dateLabel}*`,
    `Status: ${att ? (att.status === "late" ? "⚠️ Late" : "✅ Present") : "❌ Not clocked in"}`,
    att?.clock_in  ? `Clock-in:  ${format(new Date(att.clock_in),  "HH:mm")}` : null,
    att?.clock_out ? `Clock-out: ${format(new Date(att.clock_out), "HH:mm")}` : null,
    geoName        ? `Location:  ${geoName}` : null,
    `Farm Visits: ${visitCount}`,
    `Orders: ${orderCount} · ${formatKES(orderAmount)}`,
    ``,
    `_Sent via FieldTrack_`,
  ].filter(Boolean).join("\n");
}

// ── Preset ranges ─────────────────────────────────────────────────────────────
const TODAY = format(new Date(), "yyyy-MM-dd");
const PRESETS = [
  { label: "Today",      from: TODAY,                              to: TODAY },
  { label: "Yesterday",  from: format(subDays(new Date(), 1), "yyyy-MM-dd"), to: format(subDays(new Date(), 1), "yyyy-MM-dd") },
  { label: "Last 7d",   from: format(subDays(new Date(), 6), "yyyy-MM-dd"), to: TODAY },
  { label: "Last 30d",  from: format(subDays(new Date(), 29), "yyyy-MM-dd"), to: TODAY },
];

// ── Stat pill ─────────────────────────────────────────────────────────────────
function Stat({ icon: Icon, value, label, color = "text-[#8b95a1]" }) {
  return (
    <div className="flex flex-col items-center gap-0.5 min-w-0">
      <div className="flex items-center gap-1">
        <Icon size={11} className={color} />
        <span className={`text-sm font-bold ${color}`}>{value}</span>
      </div>
      <span className="text-[9px] text-[#4a5568] uppercase tracking-wider">{label}</span>
    </div>
  );
}

// ── Staff card ────────────────────────────────────────────────────────────────
function StaffCard({ staff, attendance, latestLoc, geoName, visitCount, orderCount, orderAmount, isGeocoding, dateFrom, dateTo }) {
  const navigate = useNavigate();

  const isClockedIn  = attendance?.clock_in && !attendance?.clock_out;
  const isClockedOut = attendance?.clock_in &&  attendance?.clock_out;
  const notClockedIn = !attendance;

  const lastPingMins = latestLoc ? differenceInMinutes(new Date(), new Date(latestLoc.recorded_at)) : null;
  const isLive  = lastPingMins !== null && lastPingMins <= 10;
  const isStale = lastPingMins !== null && lastPingMins > 10 && lastPingMins <= 60;
  const isIdle  = isClockedIn && lastPingMins !== null && lastPingMins > 120
    && new Date().getHours() >= 8 && new Date().getHours() <= 18;

  const statusColor = notClockedIn ? "border-[#3d4550]"
    : attendance?.status === "late" ? "border-[#ff9f43]/30"
    : isClockedOut ? "border-[#21272f]"
    : "border-[#00c096]/30";

  const dotColor = notClockedIn ? "#3d4550" : isLive ? "#00c096" : isStale ? "#ff9f43" : "#3d4550";

  const handleShare = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(waText(staff.name, attendance, geoName, visitCount, orderCount, orderAmount, dateFrom, dateTo))}`, "_blank");
  };

  return (
    <div className={`bg-[#111418] border rounded-2xl overflow-hidden transition-all duration-200 ${statusColor}`}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="relative flex-shrink-0">
            <div className="w-11 h-11 rounded-xl bg-[#c8f230]/10 border border-[#c8f230]/20 flex items-center justify-center text-base font-bold text-[#c8f230]">
              {staff.name?.[0]?.toUpperCase() ?? "?"}
            </div>
            <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#111418] ${isLive ? "animate-pulse" : ""}`} style={{ backgroundColor: dotColor }} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-white text-sm truncate">{staff.name}</h3>
              {attendance?.status && <Badge label={attendance.status} color={attendance.status === "late" ? "warn" : "ok"} size="xs" />}
              {isIdle && (
                <span className="flex items-center gap-0.5 text-[9px] text-[#ff4d4f] bg-[#ff4d4f]/10 px-1.5 py-0.5 rounded-full font-semibold">
                  <AlertOctagon size={9} /> IDLE
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {attendance?.clock_in ? (
                <span className="text-[10px] text-[#8b95a1] font-mono flex items-center gap-1">
                  <span className="text-[#00c096]">▶</span>
                  {format(new Date(attendance.clock_in), "HH:mm")}
                  {attendance.clock_out ? (
                    <><span className="text-[#3d4550]">→</span><span className="text-[#ff4d4f]">■</span>{format(new Date(attendance.clock_out), "HH:mm")}</>
                  ) : (
                    <span className="text-[#00c096] animate-pulse ml-0.5">· active</span>
                  )}
                </span>
              ) : (
                <span className="text-[10px] text-[#3d4550]">Not clocked in</span>
              )}
            </div>

            <div className="mt-1.5 flex items-center gap-1">
              <MapPin size={10} className="text-[#c8f230] flex-shrink-0" />
              {isGeocoding ? (
                <span className="text-[10px] text-[#4a5568] animate-pulse">Locating…</span>
              ) : geoName ? (
                <a href={latestLoc ? gmapsUrl(latestLoc.latitude, latestLoc.longitude) : "#"} target="_blank" rel="noreferrer" className="text-[10px] text-[#c8f230] hover:underline truncate">
                  {geoName} {lastPingMins !== null && <span className="text-[#4a5568]">· {minsAgo(latestLoc.recorded_at)}</span>}
                </a>
              ) : latestLoc ? (
                <a href={gmapsUrl(latestLoc.latitude, latestLoc.longitude)} target="_blank" rel="noreferrer" className="text-[10px] text-[#4a5568] hover:text-[#c8f230] font-mono">
                  {latestLoc.latitude.toFixed(4)}, {latestLoc.longitude.toFixed(4)} ↗
                </a>
              ) : (
                <span className="text-[10px] text-[#3d4550]">No GPS</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-around mt-4 pt-3 border-t border-[#21272f]">
          <Stat icon={Leaf}         value={visitCount}            label="Visits"   color="text-[#00c096]" />
          <div className="w-px h-6 bg-[#21272f]" />
          <Stat icon={ShoppingCart} value={orderCount}            label="Orders"   color="text-[#c8f230]" />
          <div className="w-px h-6 bg-[#21272f]" />
          <Stat icon={TrendingUp}   value={formatKES(orderAmount)} label="Revenue" color="text-[#54a0ff]" />
          {latestLoc?.battery_level != null && (
            <><div className="w-px h-6 bg-[#21272f]" />
            <Stat icon={Battery} value={`${latestLoc.battery_level}%`} label="Battery" color={latestLoc.battery_level < 20 ? "text-[#ff4d4f]" : "text-[#4a5568]"} /></>
          )}
        </div>

        {isIdle && (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-[#ff4d4f]/10 border border-[#ff4d4f]/20 rounded-xl">
            <AlertOctagon size={12} className="text-[#ff4d4f] flex-shrink-0" />
            <p className="text-[11px] text-[#ff4d4f]">No GPS movement for {Math.floor(lastPingMins / 60)}h {lastPingMins % 60}m</p>
          </div>
        )}

        <div className="flex gap-2 mt-3">
          <button onClick={handleShare} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#25d366]/10 border border-[#25d366]/20 text-[#25d366] text-xs font-medium hover:bg-[#25d366]/20 transition-all">
            <Share2 size={12} /> WhatsApp
          </button>
          <button onClick={() => { navigate("/map"); toast(`Select ${staff.name.split(" ")[0]} in the sidebar`, { duration: 4000 }); }}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#54a0ff]/10 border border-[#54a0ff]/20 text-[#54a0ff] text-xs font-medium hover:bg-[#54a0ff]/20 transition-all">
            <Map size={12} /> View Route
          </button>
          {latestLoc && (
            <a href={gmapsUrl(latestLoc.latitude, latestLoc.longitude)} target="_blank" rel="noreferrer"
              className="flex items-center justify-center px-3 py-2 rounded-xl bg-[#c8f230]/10 border border-[#c8f230]/20 text-[#c8f230] text-xs hover:bg-[#c8f230]/20 transition-all">
              <MapPin size={12} />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Header stat card ──────────────────────────────────────────────────────────
function HeaderStat({ icon: Icon, value, label, color, bg }) {
  return (
    <div className={`${bg} border border-[#21272f] rounded-2xl p-3 flex items-center gap-3`}>
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${bg}`}>
        <Icon size={15} className={color} />
      </div>
      <div>
        <p className={`text-lg font-bold ${color}`}>{value}</p>
        <p className="text-[10px] text-[#4a5568] uppercase tracking-wider">{label}</p>
      </div>
    </div>
  );
}

// ── Filter bar ────────────────────────────────────────────────────────────────
function FilterBar({ filters, setFilters, allStaff, onClear }) {
  const activeCount = [filters.status, filters.gpsStatus, filters.search].filter(Boolean).length;

  return (
    <div className="bg-[#111418] border border-[#21272f] rounded-2xl p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter size={13} className="text-[#c8f230]" />
          <span className="text-xs font-semibold text-white">Filters</span>
          {activeCount > 0 && (
            <span className="text-[10px] bg-[#c8f230] text-[#0a0d0f] rounded-full px-1.5 py-0.5 font-bold">{activeCount}</span>
          )}
        </div>
        {activeCount > 0 && (
          <button onClick={onClear} className="flex items-center gap-1 text-[10px] text-[#8b95a1] hover:text-white transition-colors">
            <X size={10} /> Clear all
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {/* Search */}
        <div className="relative">
          <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#4a5568]" />
          <input
            type="text"
            placeholder="Search staff…"
            value={filters.search}
            onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
            className="pl-7 pr-3 py-1.5 bg-[#0a0d0f] border border-[#21272f] rounded-xl text-xs text-white placeholder-[#3d4550] outline-none focus:border-[#c8f230] transition-colors w-36"
          />
        </div>

        {/* Attendance status */}
        <div className="flex items-center gap-1 bg-[#0a0d0f] border border-[#21272f] rounded-xl p-0.5">
          {[
            { value: "",        label: "All",     icon: Users },
            { value: "present", label: "Present", icon: CheckCircle },
            { value: "late",    label: "Late",    icon: Clock },
            { value: "absent",  label: "Absent",  icon: XCircle },
          ].map(({ value, label, icon: Icon }) => (
            <button key={value}
              onClick={() => setFilters(f => ({ ...f, status: f.status === value ? "" : value }))}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                filters.status === value
                  ? "bg-[#c8f230] text-[#0a0d0f]"
                  : "text-[#8b95a1] hover:text-white"
              }`}>
              <Icon size={11} /> {label}
            </button>
          ))}
        </div>

        {/* GPS status */}
        <div className="flex items-center gap-1 bg-[#0a0d0f] border border-[#21272f] rounded-xl p-0.5">
          {[
            { value: "",      label: "All GPS",  icon: Wifi },
            { value: "live",  label: "Live",     icon: Wifi },
            { value: "stale", label: "Stale",    icon: WifiOff },
            { value: "idle",  label: "Idle",     icon: AlertOctagon },
            { value: "off",   label: "Offline",  icon: WifiOff },
          ].map(({ value, label, icon: Icon }) => (
            <button key={value}
              onClick={() => setFilters(f => ({ ...f, gpsStatus: f.gpsStatus === value ? "" : value }))}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                filters.gpsStatus === value
                  ? value === "idle" ? "bg-[#ff4d4f] text-white"
                    : "bg-[#c8f230] text-[#0a0d0f]"
                  : "text-[#8b95a1] hover:text-white"
              }`}>
              <Icon size={11} /> {label}
            </button>
          ))}
        </div>

        {/* Sort */}
        <select
          value={filters.sort}
          onChange={e => setFilters(f => ({ ...f, sort: e.target.value }))}
          className="px-3 py-1.5 bg-[#0a0d0f] border border-[#21272f] rounded-xl text-xs text-white outline-none focus:border-[#c8f230] transition-colors"
        >
          <option value="name">Sort: Name</option>
          <option value="visits_desc">Sort: Most Visits</option>
          <option value="orders_desc">Sort: Most Orders</option>
          <option value="revenue_desc">Sort: Most Revenue</option>
          <option value="clockin_asc">Sort: Earliest In</option>
        </select>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function TeamSummaryPage() {
  const navigate = useNavigate();

  // Date range state
  const [dateFrom, setDateFrom] = useState(TODAY);
  const [dateTo,   setDateTo]   = useState(TODAY);
  const [activePreset, setActivePreset] = useState("Today");

  const [locationNames, setLocationNames] = useState({});
  const [geocodingIds,  setGeocodingIds]  = useState(new Set());
  const [lastRefresh,   setLastRefresh]   = useState(new Date());

  const [filters, setFilters] = useState({ status: "", gpsStatus: "", search: "", sort: "name" });

  const rangeStart = startOfDay(new Date(dateFrom)).toISOString().replace("T", " ");
  const rangeEnd   = endOfDay(new Date(dateTo)).toISOString().replace("T", " ");
  const isSingleToday = dateFrom === TODAY && dateTo === TODAY;

  const applyPreset = (preset) => {
    setActivePreset(preset.label);
    setDateFrom(preset.from);
    setDateTo(preset.to);
    setLocationNames({});
  };

  // ── Data queries ───────────────────────────────────────────────────────────
  const { data: allStaff } = useQuery({
    queryKey: ["summary-staff"],
    queryFn:  () => pb.collection("ft_users").getFullList({
      filter: `role = "field_staff" && status = "active"`,
      sort: "name",
      fields: "id,name,county",
    }),
    staleTime: 300000,
  });

  const { data: attendance, refetch: refetchAtt } = useQuery({
    queryKey: ["summary-att", dateFrom, dateTo],
    queryFn: () => pb.collection("ft_attendance").getFullList({
      // For ranges: get all records in window; for single day use date field
      filter: isSingleToday
        ? `date = "${dateFrom}"`
        : `date >= "${dateFrom}" && date <= "${dateTo}"`,
      sort: "user",
    }),
    refetchInterval: isSingleToday ? 30000 : false,
  });

  const { data: liveLocations, refetch: refetchLocs } = useQuery({
    queryKey: ["summary-locs", dateFrom, dateTo],
    queryFn: async () => {
      const filter = isSingleToday
        ? `recorded_at >= "${new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()}"`
        : `recorded_at >= "${rangeStart}" && recorded_at <= "${rangeEnd}"`;
      const list = await pb.collection("ft_locations").getList(1, 500, {
        filter,
        sort: "-recorded_at",
        fields: "id,user,latitude,longitude,recorded_at,speed_kmh,battery_level,accuracy_meters",
      });
      const latest = {};
      for (const loc of list.items) {
        if (loc.latitude === 0 && loc.longitude === 0) continue;
        if (!latest[loc.user]) latest[loc.user] = loc;
      }
      return latest;
    },
    refetchInterval: isSingleToday ? 30000 : false,
    staleTime: 0,
  });

  const { data: visits } = useQuery({
    queryKey: ["summary-visits", dateFrom, dateTo],
    queryFn: async () => {
      const list = await pb.collection("ft_farmer_visits").getFullList({
        filter: `created >= "${rangeStart}" && created <= "${rangeEnd}"`,
        fields: "id,staff",
      });
      const counts = {};
      for (const v of list) counts[v.staff] = (counts[v.staff] ?? 0) + 1;
      return counts;
    },
    refetchInterval: isSingleToday ? 60000 : false,
  });

  const { data: orders } = useQuery({
    queryKey: ["summary-orders", dateFrom, dateTo],
    queryFn: async () => {
      const list = await pb.collection("ft_orders").getFullList({
        filter: `submitted_at >= "${rangeStart}" && submitted_at <= "${rangeEnd}"`,
        fields: "id,staff,order_amount",
      });
      const summary = {};
      for (const o of list) {
        if (!summary[o.staff]) summary[o.staff] = { count: 0, amount: 0 };
        summary[o.staff].count++;
        summary[o.staff].amount += Number(o.order_amount ?? 0);
      }
      return summary;
    },
    refetchInterval: isSingleToday ? 60000 : false,
  });

  // ── Reverse geocode ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!liveLocations || !allStaff) return;
    let active = true;
    const toGeocode = allStaff
      .map(s => ({ id: s.id, loc: liveLocations[s.id] }))
      .filter(({ id, loc }) => loc && !locationNames[id]);
    if (!toGeocode.length) return;
    setGeocodingIds(new Set(toGeocode.map(x => x.id)));
    (async () => {
      for (const { id, loc } of toGeocode) {
        if (!active) break;
        const name = await reverseGeocode(loc.latitude, loc.longitude);
        if (active && name) setLocationNames(prev => ({ ...prev, [id]: name }));
        setGeocodingIds(prev => { const n = new Set(prev); n.delete(id); return n; });
        await delay(1100);
      }
    })();
    return () => { active = false; };
  }, [liveLocations, allStaff?.length]);

  // ── Derived data ───────────────────────────────────────────────────────────
  const attByUser = useMemo(() => {
    // For ranges, take the most recent attendance record per user
    const m = {};
    for (const a of (attendance ?? []).slice().sort((x, y) => x.date > y.date ? -1 : 1)) {
      if (!m[a.user]) m[a.user] = a;
    }
    return m;
  }, [attendance]);

  const now = new Date();
  const onField     = (attendance ?? []).filter(a => a.clock_in && !a.clock_out).length;
  const liveCount   = Object.values(liveLocations ?? {}).filter(l => differenceInMinutes(now, new Date(l.recorded_at)) <= 10).length;
  const totalVisits  = Object.values(visits  ?? {}).reduce((s, v) => s + v, 0);
  const totalRevenue = Object.values(orders  ?? {}).reduce((s, o) => s + o.amount, 0);
  const totalOrders  = Object.values(orders  ?? {}).reduce((s, o) => s + o.count, 0);
  const idleCount   = (allStaff ?? []).filter(s => {
    const att = attByUser[s.id];
    const loc = liveLocations?.[s.id];
    if (!att?.clock_in || att.clock_out || !loc) return false;
    return differenceInMinutes(now, new Date(loc.recorded_at)) > 120;
  }).length;

  // ── Filtered + sorted staff list ───────────────────────────────────────────
  const filteredStaff = useMemo(() => {
    if (!allStaff) return [];
    let list = [...allStaff];

    // Search
    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(s => s.name.toLowerCase().includes(q));
    }

    // Attendance status filter
    if (filters.status) {
      list = list.filter(s => {
        const att = attByUser[s.id];
        if (filters.status === "absent")  return !att;
        if (filters.status === "present") return att && att.status !== "late";
        if (filters.status === "late")    return att?.status === "late";
        return true;
      });
    }

    // GPS status filter
    if (filters.gpsStatus) {
      list = list.filter(s => {
        const loc = liveLocations?.[s.id];
        const att = attByUser[s.id];
        const mins = loc ? differenceInMinutes(now, new Date(loc.recorded_at)) : null;
        if (filters.gpsStatus === "live")  return mins !== null && mins <= 10;
        if (filters.gpsStatus === "stale") return mins !== null && mins > 10 && mins <= 60;
        if (filters.gpsStatus === "idle")  return att?.clock_in && !att.clock_out && mins !== null && mins > 120;
        if (filters.gpsStatus === "off")   return !loc;
        return true;
      });
    }

    // Sort
    list.sort((a, b) => {
      const av = visits?.[a.id] ?? 0,  bv = visits?.[b.id] ?? 0;
      const ao = orders?.[a.id]?.count ?? 0, bo = orders?.[b.id]?.count ?? 0;
      const ar = orders?.[a.id]?.amount ?? 0, br = orders?.[b.id]?.amount ?? 0;
      const aAtt = attByUser[a.id], bAtt = attByUser[b.id];
      if (filters.sort === "visits_desc")  return bv - av;
      if (filters.sort === "orders_desc")  return bo - ao;
      if (filters.sort === "revenue_desc") return br - ar;
      if (filters.sort === "clockin_asc") {
        if (!aAtt?.clock_in && !bAtt?.clock_in) return 0;
        if (!aAtt?.clock_in) return 1;
        if (!bAtt?.clock_in) return -1;
        return new Date(aAtt.clock_in) - new Date(bAtt.clock_in);
      }
      return a.name.localeCompare(b.name);
    });

    return list;
  }, [allStaff, filters, attByUser, liveLocations, visits, orders]);

  const handleRefresh = () => {
    refetchAtt(); refetchLocs();
    setLastRefresh(new Date());
    toast.success("Refreshed");
  };

  const handleTeamShare = () => {
    if (!allStaff?.length) return;
    const dateLabel = dateFrom === dateTo
      ? format(new Date(dateFrom), "dd MMM yyyy")
      : `${format(new Date(dateFrom), "dd MMM")} – ${format(new Date(dateTo), "dd MMM yyyy")}`;
    const lines = [
      `*Team Summary — ${dateLabel}*`,
      `On field: ${onField} | Live GPS: ${liveCount} | Visits: ${totalVisits} | Orders: ${totalOrders}`,
      `Revenue: ${formatKES(totalRevenue)}`,
      ``,
      ...(filteredStaff).map(s => {
        const att = attByUser[s.id];
        const loc = locationNames[s.id] || (liveLocations?.[s.id] ? "GPS active" : "offline");
        return `• ${s.name}: ${att?.clock_in ? (att.clock_out ? "✅ Done" : "🟢 Active") : "❌ Absent"} · ${loc}`;
      }),
      ``, `_Sent via FieldTrack_`,
    ].join("\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(lines)}`, "_blank");
  };

  const dateLabel = dateFrom === dateTo
    ? format(new Date(dateFrom), "dd MMM yyyy")
    : `${format(new Date(dateFrom), "dd MMM")} – ${format(new Date(dateTo), "dd MMM yyyy")}`;

  return (
    <div className="p-5 max-w-5xl mx-auto space-y-4 pb-8">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <div>
          <h1 className="font-display font-bold text-2xl text-white flex items-center gap-2">
            <Users size={22} className="text-[#c8f230]" /> Team Summary
          </h1>
          <p className="text-[#8b95a1] text-sm mt-0.5">
            {filteredStaff.length}/{allStaff?.length ?? 0} staff · {dateLabel} · refreshed {format(lastRefresh, "HH:mm:ss")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleRefresh} className="w-9 h-9 bg-[#111418] border border-[#21272f] rounded-xl flex items-center justify-center text-[#8b95a1] hover:text-white transition-colors">
            <RefreshCcw size={14} />
          </button>
          <button onClick={handleTeamShare} className="flex items-center gap-1.5 px-3 py-2 bg-[#25d366]/10 border border-[#25d366]/20 rounded-xl text-[#25d366] text-xs font-medium hover:bg-[#25d366]/20 transition-all">
            <Share2 size={13} /> Share All
          </button>
        </div>
      </div>

      {/* ── Date range controls ──────────────────────────────────────────── */}
      <div className="bg-[#111418] border border-[#21272f] rounded-2xl p-3 space-y-3">
        <div className="flex items-center gap-2">
          <Calendar size={13} className="text-[#c8f230]" />
          <span className="text-xs font-semibold text-white">Date Range</span>
        </div>

        {/* Preset chips */}
        <div className="flex flex-wrap gap-2">
          {PRESETS.map(preset => (
            <button key={preset.label}
              onClick={() => applyPreset(preset)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                activePreset === preset.label
                  ? "bg-[#c8f230] text-[#0a0d0f]"
                  : "bg-[#0a0d0f] border border-[#21272f] text-[#8b95a1] hover:text-white hover:border-[#c8f230]/40"
              }`}>
              {preset.label}
            </button>
          ))}
          {/* Custom indicator */}
          {!PRESETS.find(p => p.from === dateFrom && p.to === dateTo) && (
            <span className="px-3 py-1.5 rounded-xl text-xs font-medium bg-[#54a0ff]/20 border border-[#54a0ff]/30 text-[#54a0ff]">
              Custom
            </span>
          )}
        </div>

        {/* Custom date inputs */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 bg-[#0a0d0f] border border-[#21272f] rounded-xl px-3 py-2">
            <span className="text-[10px] text-[#4a5568] uppercase tracking-wider font-medium">From</span>
            <input
              type="date"
              value={dateFrom}
              max={dateTo}
              onChange={e => { setDateFrom(e.target.value); setActivePreset(""); setLocationNames({}); }}
              className="bg-transparent text-xs text-white outline-none"
            />
          </div>
          <span className="text-[#3d4550] text-sm">→</span>
          <div className="flex items-center gap-2 bg-[#0a0d0f] border border-[#21272f] rounded-xl px-3 py-2">
            <span className="text-[10px] text-[#4a5568] uppercase tracking-wider font-medium">To</span>
            <input
              type="date"
              value={dateTo}
              min={dateFrom}
              max={TODAY}
              onChange={e => { setDateTo(e.target.value); setActivePreset(""); setLocationNames({}); }}
              className="bg-transparent text-xs text-white outline-none"
            />
          </div>
        </div>
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <FilterBar
        filters={filters}
        setFilters={setFilters}
        allStaff={allStaff}
        onClear={() => setFilters({ status: "", gpsStatus: "", search: "", sort: "name" })}
      />

      {/* ── Idle banner ──────────────────────────────────────────────────── */}
      {idleCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-[#ff4d4f]/10 border border-[#ff4d4f]/20 rounded-xl">
          <AlertOctagon size={16} className="text-[#ff4d4f] flex-shrink-0 animate-pulse" />
          <p className="text-sm text-[#ff4d4f] font-medium">
            {idleCount} staff member{idleCount > 1 ? "s have" : " has"} not moved in over 2 hours while clocked in
          </p>
        </div>
      )}

      {/* ── Summary stats ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <HeaderStat icon={Users}        value={onField}                label="On Field"     color="text-[#00c096]" bg="bg-[#00c096]/10" />
        <HeaderStat icon={Navigation}   value={liveCount}              label="Live GPS"     color="text-[#c8f230]" bg="bg-[#c8f230]/10" />
        <HeaderStat icon={Leaf}         value={totalVisits}            label="Visits"       color="text-[#54a0ff]" bg="bg-[#54a0ff]/10" />
        <HeaderStat icon={ShoppingCart} value={formatKES(totalRevenue)} label="Revenue"     color="text-[#ff9f43]" bg="bg-[#ff9f43]/10" />
      </div>

      {/* ── Staff grid ───────────────────────────────────────────────────── */}
      {filteredStaff.length === 0 ? (
        <div className="py-20 text-center text-[#8b95a1]">
          <Users size={48} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm">No staff match the current filters</p>
          <button onClick={() => setFilters({ status: "", gpsStatus: "", search: "", sort: "name" })}
            className="mt-3 text-xs text-[#c8f230] hover:underline">Clear filters</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredStaff.map(staff => (
            <StaffCard
              key={staff.id}
              staff={staff}
              attendance={attByUser[staff.id]}
              latestLoc={liveLocations?.[staff.id]}
              geoName={locationNames[staff.id]}
              isGeocoding={geocodingIds.has(staff.id)}
              visitCount={visits?.[staff.id] ?? 0}
              orderCount={orders?.[staff.id]?.count ?? 0}
              orderAmount={orders?.[staff.id]?.amount ?? 0}
              dateFrom={dateFrom}
              dateTo={dateTo}
            />
          ))}
        </div>
      )}
    </div>
  );
}