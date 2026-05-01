// src/pages/GalleryPage.jsx
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { pb, API } from "../lib/pb";
import { useAuth } from "../store/auth";
import { useTheme } from "../store/theme";
import {
  Images, X, ChevronLeft, ChevronRight,
  Sprout, CheckSquare, Clock, Filter,
  Download, Calendar, User, ZoomIn,
} from "lucide-react";
import { format } from "date-fns";

// ── Source type config ────────────────────────────────────────────────────────
const SOURCES = {
  visits: {
    label:      "Farm Visits",
    icon:       Sprout,
    collection: "ft_farmer_visits",
    photoField: "photos",
    color:      "#c8f230",
    metaLabel:  (r) => r.farmer_name,
    metaSub:    (r) => r.county,
  },
  tasks: {
    label:      "Tasks",
    icon:       CheckSquare,
    collection: "ft_tasks",
    photoField: "completion_photos",
    color:      "#3b82f6",
    metaLabel:  (r) => r.title,
    metaSub:    (r) => r.category,
  },
  attendance: {
    label:      "Attendance",
    icon:       Clock,
    collection: "ft_attendance",
    photoField: "clock_in_selfie",
    color:      "#00c096",
    metaLabel:  (r) => r.expand?.user?.name ?? "Staff",
    metaSub:    (r) => r.date ? format(new Date(r.date), "dd MMM yyyy") : "",
  },
};

// ── Build photo items from records ───────────────────────────────────────────
function buildItems(records, sourceKey, collection) {
  const src = SOURCES[sourceKey];
  const items = [];
  for (const record of records) {
    const raw = record[src.photoField];
    if (!raw) continue;
    const files = Array.isArray(raw) ? raw : [raw];
    for (const filename of files) {
      if (!filename) continue;
      items.push({
        id:         `${record.id}-${filename}`,
        recordId:   record.id,
        collection: src.collection,
        filename,
        source:     sourceKey,
        color:      src.color,
        label:      src.metaLabel(record),
        sub:        src.metaSub(record),
        created:    record.created,
        record,
      });
    }
  }
  return items;
}

function photoUrl(item, thumb = "") {
  const base = `${API}/api/files/${item.collection}/${item.recordId}/${item.filename}`;
  return thumb ? `${base}?thumb=${thumb}` : base;
}

// ── Lightbox ─────────────────────────────────────────────────────────────────
function Lightbox({ items, index, onClose, onPrev, onNext }) {
  const item = items[index];

  useEffect(() => {
    const h = (e) => {
      if (e.key === "ArrowLeft")  onPrev();
      if (e.key === "ArrowRight") onNext();
      if (e.key === "Escape")     onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onPrev, onNext, onClose]);

  // Touch swipe
  const touchX = useRef(null);
  const onTouchStart = (e) => { touchX.current = e.touches[0].clientX; };
  const onTouchEnd   = (e) => {
    if (touchX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (dx > 50)  onPrev();
    if (dx < -50) onNext();
    touchX.current = null;
  };

  const SrcIcon = SOURCES[item.source].icon;

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black flex flex-col"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Top bar */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 to-transparent absolute top-0 left-0 right-0 z-10">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: item.color + "25" }}>
            <SrcIcon size={13} style={{ color: item.color }} />
          </div>
          <div>
            <p className="text-white text-xs font-semibold leading-tight">{item.label}</p>
            {item.sub && <p className="text-white/50 text-[10px] leading-tight capitalize">{item.sub}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-white/50 text-xs font-mono">{index + 1}/{items.length}</span>
          <a
            href={photoUrl(item)}
            download
            onClick={e => e.stopPropagation()}
            className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
          >
            <Download size={16} />
          </a>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Main image */}
      <div className="flex-1 flex items-center justify-center relative">
        <img
          key={item.id}
          src={photoUrl(item)}
          alt={item.label}
          className="max-w-full max-h-full object-contain"
          style={{ userSelect: "none" }}
        />

        {index > 0 && (
          <button
            onClick={onPrev}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 border border-white/10 flex items-center justify-center text-white"
          >
            <ChevronLeft size={20} />
          </button>
        )}
        {index < items.length - 1 && (
          <button
            onClick={onNext}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 border border-white/10 flex items-center justify-center text-white"
          >
            <ChevronRight size={20} />
          </button>
        )}
      </div>

      {/* Thumbnail strip */}
      <div className="flex-shrink-0 pb-safe">
        <div className="flex gap-1.5 px-3 py-3 overflow-x-auto">
          {items.map((it, i) => (
            <button
              key={it.id}
              onClick={() => { /* handled by parent */ }}
              className={`w-12 h-12 flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all ${
                i === index ? "border-[#c8f230] scale-110" : "border-transparent opacity-40"
              }`}
            >
              <img
                src={photoUrl(it, "80x80")}
                alt=""
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function GalleryPage() {
  const { user }  = useAuth();
  const { theme } = useTheme();
  const isLight   = theme === "light";
  const isAdmin   = ["admin", "manager", "supervisor"].includes(user?.role);

  const [activeSource, setActiveSource] = useState("all");
  const [dateFrom,     setDateFrom]     = useState("");
  const [dateTo,       setDateTo]       = useState("");
  const [staffFilter,  setStaffFilter]  = useState("");
  const [showFilters,  setShowFilters]  = useState(false);
  const [lightboxIdx,  setLightboxIdx]  = useState(null);

  // ── Staff list for admin filter ───────────────────────────────────────────
  const { data: staffList } = useQuery({
    queryKey: ["staff-list"],
    queryFn:  () => pb.collection("ft_users").getList(1, 200, { sort: "name" }),
    enabled:  isAdmin,
  });

  // ── Build PB filter string ────────────────────────────────────────────────
  const buildFilter = useCallback((collection) => {
    const parts = [];
    if (!isAdmin) {
      if (collection === "ft_attendance") parts.push(`user = "${user.id}"`);
      else                                parts.push(`staff = "${user.id}"`);
    } else if (staffFilter) {
      if (collection === "ft_attendance") parts.push(`user = "${staffFilter}"`);
      else                                parts.push(`staff = "${staffFilter}"`);
    }
    if (dateFrom) parts.push(`created >= "${dateFrom} 00:00:00"`);
    if (dateTo)   parts.push(`created <= "${dateTo} 23:59:59"`);
    return parts.join(" && ");
  }, [isAdmin, user.id, staffFilter, dateFrom, dateTo]);

  // ── Queries per collection ────────────────────────────────────────────────
  const visitsQ = useQuery({
    queryKey: ["gallery-visits", buildFilter("ft_farmer_visits")],
    queryFn:  () => pb.collection("ft_farmer_visits").getList(1, 500, {
      filter: buildFilter("ft_farmer_visits"),
      sort:   "-created",
      fields: "id,created,photos,farmer_name,county,staff",
    }),
    enabled: true,
  });

  const tasksQ = useQuery({
    queryKey: ["gallery-tasks", buildFilter("ft_tasks")],
    queryFn:  () => pb.collection("ft_tasks").getList(1, 500, {
      filter: buildFilter("ft_tasks"),
      sort:   "-created",
      fields: "id,created,completion_photos,title,category,assigned_to",
    }),
    enabled: true,
  });

  const attendQ = useQuery({
    queryKey: ["gallery-attendance", buildFilter("ft_attendance")],
    queryFn:  () => pb.collection("ft_attendance").getList(1, 500, {
      filter: buildFilter("ft_attendance"),
      sort:   "-created",
      expand: "user",
      fields: "id,created,clock_in_selfie,date,user,expand",
    }),
    enabled: true,
  });

  // ── Combine all items ─────────────────────────────────────────────────────
  const allItems = React.useMemo(() => {
    const items = [];
    if (activeSource === "all" || activeSource === "visits")
      if (visitsQ.data?.items)  items.push(...buildItems(visitsQ.data.items,  "visits",     "ft_farmer_visits"));
    if (activeSource === "all" || activeSource === "tasks")
      if (tasksQ.data?.items)   items.push(...buildItems(tasksQ.data.items,   "tasks",      "ft_tasks"));
    if (activeSource === "all" || activeSource === "attendance")
      if (attendQ.data?.items)  items.push(...buildItems(attendQ.data.items,  "attendance", "ft_attendance"));
    return items.sort((a, b) => new Date(b.created) - new Date(a.created));
  }, [visitsQ.data, tasksQ.data, attendQ.data, activeSource]);

  const isLoading = visitsQ.isLoading || tasksQ.isLoading || attendQ.isLoading;

  // ── Theme ─────────────────────────────────────────────────────────────────
  const pageBg   = isLight ? "bg-[#f4f4f5]" : "bg-[#0a0d0f]";
  const cardBg   = isLight ? "bg-white border-[#e4e4e7]" : "bg-[#111418] border-[#21272f]";
  const textMain = isLight ? "text-[#18181b]" : "text-white";
  const textSub  = isLight ? "text-[#71717a]" : "text-[#8b95a1]";
  const inputCls = isLight
    ? "bg-white border-[#e4e4e7] text-[#18181b] focus:border-[#c8f230]"
    : "bg-[#0a0d0f] border-[#21272f] text-white focus:border-[#c8f230]";

  const activeFilters = [dateFrom, dateTo, staffFilter].filter(Boolean).length;

  return (
    <div className={`min-h-full ${pageBg} pb-10`}>

      {/* ── Header ── */}
      <div className="px-4 pt-5 pb-3">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className={`font-display font-bold text-2xl flex items-center gap-2 ${textMain}`}>
              <Images size={22} className="text-[#c8f230]" /> Gallery
            </h1>
            <p className={`text-sm mt-0.5 ${textSub}`}>
              {isLoading ? "Loading…" : `${allItems.length} photo${allItems.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <button
            onClick={() => setShowFilters(v => !v)}
            className={`relative flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-colors ${
              showFilters || activeFilters > 0
                ? "bg-[#c8f230] border-[#c8f230] text-[#0a0d0f]"
                : isLight
                  ? "bg-white border-[#e4e4e7] text-[#52525b]"
                  : "bg-[#111418] border-[#21272f] text-[#8b95a1]"
            }`}
          >
            <Filter size={13} />
            Filters
            {activeFilters > 0 && (
              <span className="w-4 h-4 rounded-full bg-[#0a0d0f] text-[#c8f230] text-[9px] font-bold flex items-center justify-center">
                {activeFilters}
              </span>
            )}
          </button>
        </div>

        {/* ── Source tabs ── */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[{ key: "all", label: "All", icon: Images, color: "#c8f230" }, ...Object.entries(SOURCES).map(([key, s]) => ({ key, label: s.label, icon: s.icon, color: s.color }))].map(({ key, label, icon: Icon, color }) => (
            <button
              key={key}
              onClick={() => setActiveSource(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium flex-shrink-0 transition-all border ${
                activeSource === key
                  ? "text-[#0a0d0f] border-transparent"
                  : isLight
                    ? "bg-white border-[#e4e4e7] text-[#52525b]"
                    : "bg-[#111418] border-[#21272f] text-[#8b95a1]"
              }`}
              style={activeSource === key ? { background: color, borderColor: color } : {}}
            >
              <Icon size={12} />
              {label}
            </button>
          ))}
        </div>

        {/* ── Filter panel ── */}
        {showFilters && (
          <div className={`mt-3 rounded-2xl border p-4 space-y-3 ${cardBg}`}>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={`text-[10px] font-medium uppercase tracking-wider block mb-1 ${textSub}`}>From</label>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                  className={`w-full rounded-xl border px-3 py-2 text-xs outline-none transition-colors [color-scheme:dark] ${inputCls}`} />
              </div>
              <div>
                <label className={`text-[10px] font-medium uppercase tracking-wider block mb-1 ${textSub}`}>To</label>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                  className={`w-full rounded-xl border px-3 py-2 text-xs outline-none transition-colors [color-scheme:dark] ${inputCls}`} />
              </div>
            </div>

            {isAdmin && (
              <div>
                <label className={`text-[10px] font-medium uppercase tracking-wider block mb-1 ${textSub}`}>
                  <User size={10} className="inline mr-1" />Staff Member
                </label>
                <select value={staffFilter} onChange={e => setStaffFilter(e.target.value)}
                  className={`w-full rounded-xl border px-3 py-2 text-xs outline-none transition-colors ${inputCls}`}>
                  <option value="">All Staff</option>
                  {staffList?.items.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}

            {activeFilters > 0 && (
              <button
                onClick={() => { setDateFrom(""); setDateTo(""); setStaffFilter(""); }}
                className="w-full text-xs py-2 rounded-xl border border-[#ff4d4f]/30 text-[#ff4d4f] hover:bg-[#ff4d4f]/10 transition-colors"
              >
                Clear Filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Grid ── */}
      <div className="px-3">
        {isLoading && (
          <div className="grid grid-cols-2 gap-1.5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className={`aspect-square rounded-2xl animate-pulse ${isLight ? "bg-[#e4e4e7]" : "bg-[#21272f]"}`} />
            ))}
          </div>
        )}

        {!isLoading && allItems.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Images size={48} className="opacity-20" style={{ color: isLight ? "#52525b" : "#8b95a1" }} />
            <p className={`text-sm ${textSub}`}>No photos found</p>
            {activeFilters > 0 && (
              <button onClick={() => { setDateFrom(""); setDateTo(""); setStaffFilter(""); }}
                className="text-xs text-[#c8f230] underline">Clear filters</button>
            )}
          </div>
        )}

        {!isLoading && allItems.length > 0 && (
          <div className="grid grid-cols-2 gap-1.5">
            {allItems.map((item, i) => {
              const SrcIcon = SOURCES[item.source].icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setLightboxIdx(i)}
                  className="relative aspect-square rounded-2xl overflow-hidden group"
                  style={{ animationDelay: `${(i % 10) * 30}ms` }}
                >
                  <img
                    src={photoUrl(item, "400x400")}
                    alt={item.label}
                    className="w-full h-full object-cover transition-transform duration-300 group-active:scale-95"
                    loading="lazy"
                    onError={(e) => { e.target.parentElement.style.display = "none"; }}
                  />

                  {/* Source badge */}
                  <div className="absolute top-2 left-2">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center backdrop-blur-sm"
                      style={{ background: item.color + "30", border: `1px solid ${item.color}40` }}>
                      <SrcIcon size={11} style={{ color: item.color }} />
                    </div>
                  </div>

                  {/* Zoom icon */}
                  <div className="absolute inset-0 bg-black/0 group-active:bg-black/20 transition-colors flex items-center justify-center">
                    <ZoomIn size={24} className="text-white opacity-0 group-active:opacity-100 transition-opacity" />
                  </div>

                  {/* Bottom gradient with label — always visible */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-2 py-2">
                    <p className="text-white text-[10px] font-semibold truncate leading-tight drop-shadow-sm">{item.label}</p>
                    {item.sub && <p className="text-[10px] truncate capitalize font-medium drop-shadow-sm" style={{ color: item.color }}>{item.sub}</p>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Lightbox ── */}
      {lightboxIdx !== null && (
        <Lightbox
          items={allItems}
          index={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
          onPrev={() => setLightboxIdx(i => Math.max(0, i - 1))}
          onNext={() => setLightboxIdx(i => Math.min(allItems.length - 1, i + 1))}
        />
      )}
    </div>
  );
}