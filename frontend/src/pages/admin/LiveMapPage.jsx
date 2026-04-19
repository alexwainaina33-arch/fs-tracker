// src/pages/admin/LiveMapPage.jsx
// Live tracking map — staff sidebar, geofence overlay, route history playback

import React, { useEffect, useState, useMemo } from "react";
import {
  MapContainer, TileLayer, CircleMarker, Popup,
  Polyline, Circle, Tooltip, useMap,
} from "react-leaflet";
import { useQuery } from "@tanstack/react-query";
import { pb } from "../../lib/pb";
import { Badge } from "../../components/ui/Badge";
import { format, differenceInMinutes, startOfDay, endOfDay } from "date-fns";
import {
  Battery, Navigation, AlertTriangle, Users,
  MapPin, Clock, Zap, History, X, ChevronRight,
  Shield, RefreshCcw,
} from "lucide-react";
import "leaflet/dist/leaflet.css";

const KE_CENTER  = [-1.286389, 36.817223];
const STALE_MIN  = 10;
const COLORS = [
  "#c8f230","#00c096","#ff9f43","#54a0ff","#ff6b9d",
  "#ffd32a","#0be881","#f53b57","#3c40c4","#05c46b",
];

// Assign a stable color per user
const colorMap = {};
let colorIdx = 0;
function userColor(userId) {
  if (!colorMap[userId]) colorMap[userId] = COLORS[colorIdx++ % COLORS.length];
  return colorMap[userId];
}

// ── Auto-fit map to visible positions ─────────────────────────────────────────
function FitBounds({ positions }) {
  const map = useMap();
  useEffect(() => {
    if (!positions?.length) return;
    if (positions.length === 1) {
      map.flyTo([positions[0].latitude, positions[0].longitude], 13, { duration: 1 });
    } else {
      map.flyToBounds(
        positions.map((p) => [p.latitude, p.longitude]),
        { padding: [50, 50], duration: 1 }
      );
    }
  }, [positions?.length]);
  return null;
}

// ── Focus map on a single point ───────────────────────────────────────────────
function FocusOn({ lat, lng }) {
  const map = useMap();
  useEffect(() => {
    if (lat && lng) map.flyTo([lat, lng], 15, { duration: 1 });
  }, [lat, lng]);
  return null;
}

// ── Format minutes nicely ─────────────────────────────────────────────────────
function minsAgo(dateStr) {
  const m = differenceInMinutes(new Date(), new Date(dateStr));
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ${m % 60}m ago`;
}

export default function LiveMapPage() {
  const [focusUser,    setFocusUser]    = useState(null); // userId to focus
  const [historyUser,  setHistoryUser]  = useState(null); // userId for history
  const [historyDate,  setHistoryDate]  = useState(format(new Date(), "yyyy-MM-dd"));
  const [showGeofences, setShowGeofences] = useState(true);

  // ── Live locations (latest per staff, last 4h) ────────────────────────────
  const { data: locs, dataUpdatedAt } = useQuery({
    queryKey: ["map-locs"],
    queryFn: async () => {
      const since = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
      const list  = await pb.collection("ft_locations").getList(1, 500, {
        sort:   "-recorded_at",
        filter: `recorded_at >= "${since}"`,
        expand: "user",
      });
      // Latest ping + trail per user
      const latest = {};
      const trails = {};
      for (const loc of list.items) {
        if (!latest[loc.user]) { latest[loc.user] = loc; trails[loc.user] = []; }
        trails[loc.user].push([loc.latitude, loc.longitude]);
      }
      return { latest: Object.values(latest), trails };
    },
    refetchInterval: 15000,
    staleTime: 0,
  });

  // ── Route history for selected user/date ─────────────────────────────────
  const { data: history, isFetching: histFetching } = useQuery({
    queryKey: ["map-history", historyUser, historyDate],
    queryFn: async () => {
      if (!historyUser) return [];
      const start = startOfDay(new Date(historyDate)).toISOString();
      const end   = endOfDay(new Date(historyDate)).toISOString();
      const list  = await pb.collection("ft_locations").getFullList({
        filter: `user = "${historyUser}" && recorded_at >= "${start}" && recorded_at <= "${end}"`,
        sort:   "recorded_at",
      });
      return list;
    },
    enabled: !!historyUser,
  });

  // ── Geofence zones ────────────────────────────────────────────────────────
  const { data: zones } = useQuery({
    queryKey: ["geofences"],
    queryFn:  () => pb.collection("ft_geofences").getFullList({ filter: "is_active = true" }),
    refetchInterval: 60000,
  });

  // ── All staff (for sidebar even if offline) ───────────────────────────────
  const { data: allStaff } = useQuery({
    queryKey: ["team-list"],
    queryFn:  () => pb.collection("ft_users").getFullList({
      filter: `role = "field_staff"`,
      fields: "id,name,county,status",
      sort:   "name",
    }),
    refetchInterval: 60000,
  });

  const positions  = locs?.latest ?? [];
  const now        = new Date();
  const liveCount  = positions.filter((p) => differenceInMinutes(now, new Date(p.recorded_at)) <= STALE_MIN).length;
  const staleCount = positions.length - liveCount;

  // Map of userId → latest loc for quick lookup
  const locByUser = useMemo(() => {
    const m = {};
    for (const p of positions) m[p.user] = p;
    return m;
  }, [positions]);

  const focusedLoc = focusUser ? locByUser[focusUser] : null;
  const historyStaffName = allStaff?.find((s) => s.id === historyUser)?.name ?? "";

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── LEFT SIDEBAR ─────────────────────────────────────────────────── */}
      <div className="w-64 flex-shrink-0 flex flex-col border-r border-[#21272f] bg-[#0a0d0f] overflow-hidden">

        {/* Sidebar header */}
        <div className="px-4 py-3 border-b border-[#21272f]">
          <div className="flex items-center gap-2 mb-2">
            <Users size={14} className="text-[#c8f230]" />
            <span className="text-xs font-semibold text-white uppercase tracking-wider">Field Staff</span>
          </div>
          <div className="flex gap-3 text-xs">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#00c096]" />{liveCount} live
            </span>
            {staleCount > 0 && (
              <span className="flex items-center gap-1 text-[#ff9f43]">
                <span className="w-2 h-2 rounded-full bg-[#ff9f43]" />{staleCount} stale
              </span>
            )}
            <span className="text-[#4a5568]">{(allStaff?.length ?? 0) - positions.length} offline</span>
          </div>
        </div>

        {/* Staff list */}
        <div className="flex-1 overflow-y-auto py-2">
          {allStaff?.map((staff) => {
            const loc     = locByUser[staff.id];
            const minAgo  = loc ? differenceInMinutes(now, new Date(loc.recorded_at)) : null;
            const isLive  = minAgo !== null && minAgo <= STALE_MIN;
            const isStale = minAgo !== null && minAgo > STALE_MIN;
            const color   = userColor(staff.id);
            const isFocus = focusUser === staff.id;

            return (
              <div key={staff.id}
                onClick={() => setFocusUser(isFocus ? null : staff.id)}
                className={`mx-2 mb-1 px-3 py-2.5 rounded-xl cursor-pointer transition-all border ${
                  isFocus
                    ? "border-[#c8f230]/40 bg-[#c8f230]/5"
                    : "border-transparent hover:bg-[#111418]"
                }`}
              >
                <div className="flex items-center gap-2">
                  {/* Color dot */}
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: loc ? color : "#2a3040" }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white truncate">{staff.name}</p>
                    {loc ? (
                      <p className="text-[10px] text-[#4a5568] font-mono">
                        {isLive ? "🟢" : "🟡"} {minsAgo(loc.recorded_at)}
                      </p>
                    ) : (
                      <p className="text-[10px] text-[#4a5568]">⚫ offline</p>
                    )}
                  </div>
                  {/* History button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); setHistoryUser(staff.id); }}
                    className="text-[#4a5568] hover:text-[#c8f230] p-0.5 transition-colors flex-shrink-0"
                    title="View route history"
                  >
                    <History size={12} />
                  </button>
                </div>

                {/* Mini stats if live */}
                {loc && (
                  <div className="flex gap-3 mt-1 pl-4">
                    {loc.battery_level != null && (
                      <span className="text-[9px] text-[#4a5568] flex items-center gap-0.5">
                        <Battery size={9} />{loc.battery_level}%
                      </span>
                    )}
                    <span className="text-[9px] text-[#4a5568] flex items-center gap-0.5">
                      <Navigation size={9} />{loc.speed_kmh ?? 0}km/h
                    </span>
                    {loc.accuracy_meters && (
                      <span className="text-[9px] text-[#4a5568]">±{Math.round(loc.accuracy_meters)}m</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {!allStaff?.length && (
            <p className="text-xs text-[#4a5568] text-center py-8">No field staff found</p>
          )}
        </div>

        {/* Controls */}
        <div className="px-4 py-3 border-t border-[#21272f] space-y-2">
          <button
            onClick={() => setShowGeofences((v) => !v)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all border ${
              showGeofences
                ? "bg-[#c8f230]/10 border-[#c8f230]/20 text-[#c8f230]"
                : "bg-[#111418] border-[#21272f] text-[#8b95a1]"
            }`}
          >
            <Shield size={12} />
            {showGeofences ? "Hide" : "Show"} Geofences
            <span className="ml-auto text-[10px] opacity-60">{zones?.length ?? 0} zones</span>
          </button>
          <p className="text-[10px] text-[#4a5568] text-center font-mono">
            Updated {format(new Date(dataUpdatedAt || Date.now()), "HH:mm:ss")}
          </p>
        </div>
      </div>

      {/* ── MAP AREA ──────────────────────────────────────────────────────── */}
      <div className="flex-1 relative flex flex-col">

        {/* Top bar */}
        <div className="flex items-center gap-4 px-4 py-2.5 border-b border-[#21272f] bg-[#0a0d0f] flex-shrink-0 flex-wrap gap-y-1">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="w-2 h-2 rounded-full bg-[#00c096] animate-pulse" />
            <span className="text-[#00c096] font-medium">{liveCount} live</span>
          </div>
          {staleCount > 0 && (
            <div className="flex items-center gap-1 text-xs text-[#ff9f43]">
              <AlertTriangle size={11} /> {staleCount} stale
            </div>
          )}
          {focusUser && (
            <div className="flex items-center gap-1.5 text-xs text-[#c8f230]">
              <MapPin size={11} />
              Focused: <span className="font-medium">{allStaff?.find((s) => s.id === focusUser)?.name}</span>
              <button onClick={() => setFocusUser(null)} className="text-[#4a5568] hover:text-white ml-1">
                <X size={11} />
              </button>
            </div>
          )}
          <span className="ml-auto text-[10px] text-[#4a5568] font-mono flex items-center gap-1">
            <RefreshCcw size={10} /> auto-refresh 15s
          </span>
        </div>

        {/* Map */}
        <div className="flex-1 relative">
          <MapContainer center={KE_CENTER} zoom={7} className="h-full w-full">
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org">OpenStreetMap</a>' />

            {/* Auto-fit or focus */}
            {focusedLoc
              ? <FocusOn lat={focusedLoc.latitude} lng={focusedLoc.longitude} />
              : <FitBounds positions={positions} />
            }

            {/* Geofence zones */}
            {showGeofences && zones?.map((z) =>
              z.latitude && z.longitude ? (
                <Circle key={z.id}
                  center={[z.latitude, z.longitude]}
                  radius={z.radius_meters}
                  pathOptions={{ color: "#c8f230", fillColor: "#c8f230", fillOpacity: 0.06, weight: 1.5, dashArray: "4 4" }}
                >
                  <Tooltip permanent direction="center" className="geofence-label">
                    <span style={{ fontSize: 10, color: "#c8f230", background: "transparent", border: "none" }}>
                      {z.name}
                    </span>
                  </Tooltip>
                </Circle>
              ) : null
            )}

            {/* Staff trails + markers */}
            {positions.map((loc) => {
              const minAgo  = differenceInMinutes(now, new Date(loc.recorded_at));
              const stale   = minAgo > STALE_MIN;
              const trail   = locs?.trails?.[loc.user] ?? [];
              const color   = userColor(loc.user);
              const name    = loc.expand?.user?.name ?? "Unknown";
              const focused = focusUser === loc.user;

              return (
                <React.Fragment key={loc.id}>
                  {/* Trail polyline */}
                  {trail.length > 1 && (
                    <Polyline positions={trail}
                      pathOptions={{ color: color + "70", weight: focused ? 3 : 2, dashArray: "5 7" }} />
                  )}
                  {/* Current position marker */}
                  <CircleMarker
                    center={[loc.latitude, loc.longitude]}
                    radius={focused ? 13 : stale ? 8 : 10}
                    pathOptions={{
                      color,
                      fillColor: color,
                      fillOpacity: 0.85,
                      weight: focused ? 3 : 2,
                    }}
                  >
                    <Tooltip permanent direction="top" offset={[0, -10]}>
                      <span style={{ fontSize: 10, fontWeight: 600, color, background: "transparent", border: "none", whiteSpace: "nowrap" }}>
                        {name}
                      </span>
                    </Tooltip>
                    <Popup>
                      <div className="min-w-[200px] space-y-2 p-1">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                          <p className="font-bold text-white text-sm">{name}</p>
                        </div>
                        <p className="text-xs font-mono text-[#8b95a1]">
                          {loc.latitude.toFixed(5)}, {loc.longitude.toFixed(5)}<br />
                          ±{Math.round(loc.accuracy_meters ?? 0)}m accuracy
                        </p>
                        <div className="flex items-center gap-3 text-xs">
                          {loc.battery_level != null && (
                            <span className="flex items-center gap-1 text-[#00c096]">
                              <Battery size={11} />{loc.battery_level}%
                            </span>
                          )}
                          <span className="flex items-center gap-1 text-[#8b95a1]">
                            <Navigation size={11} />{loc.speed_kmh ?? 0} km/h
                          </span>
                          <span className="flex items-center gap-1 text-[#8b95a1]">
                            <Zap size={11} />{loc.activity_type ?? "—"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge label={stale ? "stale" : "live"} color={stale ? "warn" : "ok"} size="xs" />
                          <span className="text-xs text-[#8b95a1]">{minsAgo(loc.recorded_at)}</span>
                        </div>
                        <div className="flex gap-2 pt-1">
                          <a href={`https://maps.google.com/?q=${loc.latitude},${loc.longitude}`}
                            target="_blank" rel="noreferrer"
                            className="flex-1 text-center text-xs text-[#c8f230] hover:underline border border-[#c8f230]/20 rounded px-2 py-1">
                            Google Maps
                          </a>
                          <button
                            onClick={() => { setHistoryUser(loc.user); setFocusUser(null); }}
                            className="flex-1 text-center text-xs text-[#8b95a1] hover:text-white border border-[#21272f] rounded px-2 py-1">
                            History
                          </button>
                        </div>
                      </div>
                    </Popup>
                  </CircleMarker>
                </React.Fragment>
              );
            })}

            {/* Route history overlay */}
            {historyUser && history?.length > 0 && (
              <>
                <Polyline
                  positions={history.map((h) => [h.latitude, h.longitude])}
                  pathOptions={{ color: "#54a0ff", weight: 3, dashArray: "6 4" }}
                />
                {/* Start marker */}
                <CircleMarker center={[history[0].latitude, history[0].longitude]} radius={8}
                  pathOptions={{ color: "#00c096", fillColor: "#00c096", fillOpacity: 1, weight: 2 }}>
                  <Tooltip permanent direction="top" offset={[0, -10]}>
                    <span style={{ fontSize: 10, color: "#00c096" }}>Start</span>
                  </Tooltip>
                </CircleMarker>
                {/* End marker */}
                <CircleMarker
                  center={[history[history.length - 1].latitude, history[history.length - 1].longitude]}
                  radius={8}
                  pathOptions={{ color: "#ff4d4f", fillColor: "#ff4d4f", fillOpacity: 1, weight: 2 }}>
                  <Tooltip permanent direction="top" offset={[0, -10]}>
                    <span style={{ fontSize: 10, color: "#ff4d4f" }}>Last</span>
                  </Tooltip>
                </CircleMarker>
              </>
            )}
          </MapContainer>

          {/* Legend */}
          <div className="absolute bottom-4 left-4 z-[400] bg-[#0a0d0f]/90 border border-[#21272f] rounded-xl px-4 py-3 space-y-1.5">
            <p className="text-[10px] text-[#8b95a1] font-medium uppercase tracking-wider mb-2">Legend</p>
            <div className="flex items-center gap-2 text-xs text-[#c2cad4]">
              <div className="w-3 h-3 rounded-full bg-[#c8f230]" /> Active (&lt;10min)
            </div>
            <div className="flex items-center gap-2 text-xs text-[#c2cad4]">
              <div className="w-3 h-3 rounded-full bg-[#ffab00]" /> Stale (&gt;10min)
            </div>
            <div className="flex items-center gap-2 text-xs text-[#c2cad4]">
              <div className="w-3 h-3 rounded-full bg-[#2a3040]" /> Offline
            </div>
            {showGeofences && (
              <div className="flex items-center gap-2 text-xs text-[#c2cad4]">
                <div className="w-3 h-3 rounded border border-[#c8f230] border-dashed" /> Geofence
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── ROUTE HISTORY PANEL ───────────────────────────────────────────── */}
      {historyUser && (
        <div className="w-64 flex-shrink-0 flex flex-col border-l border-[#21272f] bg-[#0a0d0f] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#21272f]">
            <div>
              <p className="text-xs font-semibold text-white flex items-center gap-1.5">
                <History size={12} className="text-[#c8f230]" /> Route History
              </p>
              <p className="text-[10px] text-[#8b95a1] mt-0.5">{historyStaffName}</p>
            </div>
            <button onClick={() => setHistoryUser(null)} className="text-[#4a5568] hover:text-white">
              <X size={14} />
            </button>
          </div>

          {/* Date picker */}
          <div className="px-4 py-3 border-b border-[#21272f]">
            <label className="text-[10px] text-[#8b95a1] uppercase tracking-wider block mb-1">Date</label>
            <input
              type="date"
              value={historyDate}
              max={format(new Date(), "yyyy-MM-dd")}
              onChange={(e) => setHistoryDate(e.target.value)}
              className="w-full bg-[#111418] border border-[#21272f] rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-[#c8f230]"
            />
          </div>

          {/* Stats */}
          {history && history.length > 0 && (
            <div className="px-4 py-3 border-b border-[#21272f] space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-[#8b95a1]">Pings</span>
                <span className="text-white font-mono">{history.length}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-[#8b95a1]">First seen</span>
                <span className="text-white font-mono">{format(new Date(history[0].recorded_at), "HH:mm")}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-[#8b95a1]">Last seen</span>
                <span className="text-white font-mono">{format(new Date(history[history.length - 1].recorded_at), "HH:mm")}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-[#8b95a1]">Max speed</span>
                <span className="text-white font-mono">
                  {Math.max(...history.map((h) => h.speed_kmh ?? 0))} km/h
                </span>
              </div>
            </div>
          )}

          {/* Ping list */}
          <div className="flex-1 overflow-y-auto py-2">
            {histFetching && (
              <p className="text-xs text-[#4a5568] text-center py-6">Loading…</p>
            )}
            {!histFetching && history?.length === 0 && (
              <p className="text-xs text-[#4a5568] text-center py-6">No data for this date</p>
            )}
            {history?.map((h, i) => (
              <div key={h.id} className="px-4 py-2 border-b border-[#21272f]/50 hover:bg-[#111418] transition-colors">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${i === 0 ? "bg-[#00c096]" : i === history.length - 1 ? "bg-[#ff4d4f]" : "bg-[#21272f]"}`} />
                  <span className="text-[10px] font-mono text-white">{format(new Date(h.recorded_at), "HH:mm:ss")}</span>
                </div>
                <div className="pl-4 mt-0.5 flex gap-3">
                  <span className="text-[9px] text-[#4a5568] font-mono">{h.latitude.toFixed(4)}, {h.longitude.toFixed(4)}</span>
                </div>
                {(h.speed_kmh > 0 || h.battery_level) && (
                  <div className="pl-4 flex gap-2 mt-0.5">
                    {h.speed_kmh > 0 && <span className="text-[9px] text-[#4a5568]">🚗 {h.speed_kmh}km/h</span>}
                    {h.battery_level && <span className="text-[9px] text-[#4a5568]">🔋 {h.battery_level}%</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}