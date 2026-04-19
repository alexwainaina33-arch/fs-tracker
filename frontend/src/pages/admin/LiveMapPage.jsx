// src/pages/admin/LiveMapPage.jsx
// Live tracking map — mobile-responsive, attendance-bounded trail, stop detection, distance

import React, { useEffect, useState, useMemo } from "react";
import {
  MapContainer, TileLayer, CircleMarker, Popup,
  Polyline, Circle, Tooltip, useMap,
} from "react-leaflet";
import { useQuery } from "@tanstack/react-query";
import { pb } from "../../lib/pb";
import { Badge } from "../../components/ui/Badge";
import { haversineDistance } from "../../lib/geofence";
import { format, differenceInMinutes, startOfDay, endOfDay } from "date-fns";
import {
  Battery, Navigation, AlertTriangle, Users,
  MapPin, Clock, Zap, History, X, ChevronRight,
  Shield, RefreshCcw, Menu, Footprints, Timer,
} from "lucide-react";
import "leaflet/dist/leaflet.css";

const KE_CENTER  = [-1.286389, 36.817223];
const STALE_MIN  = 10;
const COLORS = [
  "#c8f230","#00c096","#ff9f43","#54a0ff","#ff6b9d",
  "#ffd32a","#0be881","#f53b57","#3c40c4","#05c46b",
];

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
    const valid = positions.filter(p => p.latitude && p.longitude && !(p.latitude === 0 && p.longitude === 0));
    if (!valid.length) return;
    if (valid.length === 1) {
      map.flyTo([valid[0].latitude, valid[0].longitude], 13, { duration: 1 });
    } else {
      map.flyToBounds(
        valid.map(p => [p.latitude, p.longitude]),
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
    if (lat && lng && !(lat === 0 && lng === 0)) map.flyTo([lat, lng], 15, { duration: 1 });
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

// ── Format duration ───────────────────────────────────────────────────────────
function fmtDuration(minutes) {
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

// ── Detect stops ──────────────────────────────────────────────────────────────
function detectStops(pings, radiusM = 100, minMinutes = 10) {
  if (pings.length < 2) return [];
  const stops = [];
  let groupStart = 0;

  for (let i = 1; i <= pings.length; i++) {
    const isLast = i === pings.length;
    const movedFar = !isLast && haversineDistance(
      pings[groupStart].latitude, pings[groupStart].longitude,
      pings[i].latitude,          pings[i].longitude,
    ) > radiusM;

    if (movedFar || isLast) {
      const groupEnd = i - 1;
      const startTime = new Date(pings[groupStart].recorded_at);
      const endTime   = new Date(pings[groupEnd].recorded_at);
      const durationMin = differenceInMinutes(endTime, startTime);

      if (durationMin >= minMinutes) {
        stops.push({
          lat:         pings[groupStart].latitude,
          lng:         pings[groupStart].longitude,
          startTime,
          endTime,
          durationMin,
          pingCount:   groupEnd - groupStart + 1,
        });
      }
      groupStart = i;
    }
  }
  return stops;
}

// ── Sum haversine distance across pings → km ──────────────────────────────────
function calcTotalDistanceKm(pings) {
  let total = 0;
  for (let i = 1; i < pings.length; i++) {
    total += haversineDistance(
      pings[i - 1].latitude, pings[i - 1].longitude,
      pings[i].latitude,     pings[i].longitude,
    );
  }
  return (total / 1000).toFixed(1);
}

// ─────────────────────────────────────────────────────────────────────────────

export default function LiveMapPage() {
  const [sidebarOpen,   setSidebarOpen]   = useState(false);
  const [focusUser,     setFocusUser]     = useState(null);
  const [historyUser,   setHistoryUser]   = useState(null);
  const [historyDate,   setHistoryDate]   = useState(format(new Date(), "yyyy-MM-dd"));
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
      const latest = {};
      const trails = {};
      for (const loc of list.items) {
        if (loc.latitude === 0 && loc.longitude === 0) continue;
        if (!latest[loc.user]) { latest[loc.user] = loc; trails[loc.user] = []; }
        trails[loc.user].push([loc.latitude, loc.longitude]);
      }
      return { latest: Object.values(latest), trails };
    },
    refetchInterval: 15000,
    staleTime: 0,
  });

  // ── All staff ─────────────────────────────────────────────────────────────
  const { data: allStaff } = useQuery({
    queryKey: ["team-list"],
    queryFn:  () => pb.collection("ft_users").getFullList({
      filter: `role = "field_staff"`,
      fields: "id,name,county,status",
      sort:   "name",
    }),
    refetchInterval: 60000,
  });

  // ── Geofence zones ────────────────────────────────────────────────────────
  const { data: zones } = useQuery({
    queryKey: ["geofences"],
    queryFn:  () => pb.collection("ft_geofences").getFullList({ filter: "is_active = true" }),
    refetchInterval: 60000,
  });

  // ── Attendance for history user+date ──────────────────────────────────────
  const { data: histAttendance } = useQuery({
    queryKey: ["map-hist-att", historyUser, historyDate],
    queryFn: async () => {
      if (!historyUser) return null;
      return pb.collection("ft_attendance")
        .getFirstListItem(`user = "${historyUser}" && date = "${historyDate}"`)
        .catch(() => null);
    },
    enabled: !!historyUser,
  });

  // ── Route history — bounded by clock-in / clock-out ───────────────────────
  const { data: history, isFetching: histFetching } = useQuery({
    queryKey: ["map-history", historyUser, historyDate, histAttendance?.id],
    queryFn: async () => {
      if (!historyUser) return [];

      let start, end;
      if (histAttendance?.clock_in) {
        start = histAttendance.clock_in;
        end   = histAttendance.clock_out
          ? histAttendance.clock_out
          : new Date().toISOString().replace("T", " ");
      } else {
        start = startOfDay(new Date(historyDate)).toISOString().replace("T", " ");
        end   = endOfDay(new Date(historyDate)).toISOString().replace("T", " ");
      }

      const list = await pb.collection("ft_locations").getFullList({
        filter: `user = "${historyUser}" && recorded_at >= "${start}" && recorded_at <= "${end}"`,
        sort:   "recorded_at",
      });
      return list.filter(p => !(p.latitude === 0 && p.longitude === 0));
    },
    enabled: !!historyUser,
  });

  // ── Derived ───────────────────────────────────────────────────────────────
  const stops        = useMemo(() => history?.length ? detectStops(history) : [], [history]);
  const totalDistKm  = useMemo(() => history?.length ? calcTotalDistanceKm(history) : "0.0", [history]);

  const positions  = locs?.latest ?? [];
  const now        = new Date();
  const liveCount  = positions.filter(p => differenceInMinutes(now, new Date(p.recorded_at)) <= STALE_MIN).length;
  const staleCount = positions.length - liveCount;

  const locByUser = useMemo(() => {
    const m = {};
    for (const p of positions) m[p.user] = p;
    return m;
  }, [positions]);

  const focusedLoc       = focusUser ? locByUser[focusUser] : null;
  const historyStaffName = allStaff?.find(s => s.id === historyUser)?.name ?? "";
  const stillOnField     = histAttendance?.clock_in && !histAttendance?.clock_out;

  // ── Helpers ───────────────────────────────────────────────────────────────
  const openHistory = (userId) => {
    setHistoryUser(userId);
    setSidebarOpen(false);  // always close staff sidebar when opening history
  };

  const openSidebar = () => {
    setHistoryUser(null);   // close history panel when opening staff list
    setSidebarOpen(true);
  };

  return (
    <div className="flex h-full overflow-hidden relative">

      {/* ── MOBILE TOGGLE (staff list) ─────────────────────────────────────── */}
      {!historyUser && (
        <button
          onClick={() => setSidebarOpen(v => !v)}
          className="md:hidden absolute top-4 left-3 z-[500] w-10 h-10 bg-[#111418] border border-[#21272f] rounded-xl flex items-center justify-center text-[#8b95a1] hover:text-white shadow-lg"
          title="Toggle staff list"
        >
          {sidebarOpen ? <X size={16} /> : <Menu size={16} />}
        </button>
      )}

      {/* ── MOBILE BACKDROP (staff sidebar) ───────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── LEFT SIDEBAR — STAFF LIST ──────────────────────────────────────── */}
      <div className={`
        absolute inset-y-0 left-0 z-50 w-72 flex-shrink-0 flex flex-col
        border-r border-[#21272f] bg-[#0a0d0f] overflow-hidden
        transition-transform duration-300 ease-in-out
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        md:relative md:translate-x-0 md:w-64
      `}>

        {/* Header */}
        <div className="px-4 py-3 border-b border-[#21272f]">
          <div className="flex items-center gap-2 mb-2">
            <Users size={14} className="text-[#c8f230]" />
            <span className="text-xs font-semibold text-white uppercase tracking-wider">Field Staff</span>
            <button
              onClick={() => setSidebarOpen(false)}
              className="md:hidden ml-auto text-[#4a5568] hover:text-white p-1"
            >
              <X size={14} />
            </button>
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
          {allStaff?.map(staff => {
            const loc     = locByUser[staff.id];
            const minAgo  = loc ? differenceInMinutes(now, new Date(loc.recorded_at)) : null;
            const isLive  = minAgo !== null && minAgo <= STALE_MIN;
            const color   = userColor(staff.id);
            const isFocus = focusUser === staff.id;

            return (
              <div key={staff.id}
                onClick={() => { setFocusUser(isFocus ? null : staff.id); setSidebarOpen(false); }}
                className={`mx-2 mb-1 px-3 py-2.5 rounded-xl cursor-pointer transition-all border ${
                  isFocus
                    ? "border-[#c8f230]/40 bg-[#c8f230]/5"
                    : "border-transparent hover:bg-[#111418]"
                }`}
              >
                <div className="flex items-center gap-2">
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
                  <button
                    onClick={e => { e.stopPropagation(); openHistory(staff.id); }}
                    className="text-[#4a5568] hover:text-[#c8f230] p-1 transition-colors flex-shrink-0"
                    title="View route history"
                  >
                    <History size={12} />
                  </button>
                </div>

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
            onClick={() => setShowGeofences(v => !v)}
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
      <div className="flex-1 relative flex flex-col min-w-0">

        {/* Top bar */}
        <div className="flex items-center gap-3 px-3 py-2 border-b border-[#21272f] bg-[#0a0d0f] flex-shrink-0 flex-wrap gap-y-1 pl-14 md:pl-4 min-h-[44px]">
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
              <span className="font-medium truncate max-w-[120px]">{allStaff?.find(s => s.id === focusUser)?.name}</span>
              <button onClick={() => setFocusUser(null)} className="text-[#4a5568] hover:text-white ml-1 flex-shrink-0">
                <X size={11} />
              </button>
            </div>
          )}
          <span className="ml-auto text-[10px] text-[#4a5568] font-mono flex items-center gap-1 flex-shrink-0">
            <RefreshCcw size={10} /> 15s
          </span>
        </div>

        {/* Map */}
        <div className="flex-1 relative">
          <MapContainer center={KE_CENTER} zoom={7} className="h-full w-full">
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org">OpenStreetMap</a>'
            />

            {focusedLoc
              ? <FocusOn lat={focusedLoc.latitude} lng={focusedLoc.longitude} />
              : <FitBounds positions={positions} />
            }

            {/* Geofence zones */}
            {showGeofences && zones?.map(z =>
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

            {/* Live staff trails + markers */}
            {positions.map(loc => {
              const minAgo  = differenceInMinutes(now, new Date(loc.recorded_at));
              const stale   = minAgo > STALE_MIN;
              const trail   = locs?.trails?.[loc.user] ?? [];
              const color   = userColor(loc.user);
              const name    = loc.expand?.user?.name ?? "Unknown";
              const focused = focusUser === loc.user;

              return (
                <React.Fragment key={loc.id}>
                  {trail.length > 1 && (
                    <Polyline positions={trail}
                      pathOptions={{ color: color + "70", weight: focused ? 3 : 2, dashArray: "5 7" }} />
                  )}
                  <CircleMarker
                    center={[loc.latitude, loc.longitude]}
                    radius={focused ? 13 : stale ? 8 : 10}
                    pathOptions={{ color, fillColor: color, fillOpacity: 0.85, weight: focused ? 3 : 2 }}
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
                            onClick={() => { openHistory(loc.user); setFocusUser(null); }}
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

            {/* ── HISTORY OVERLAY ────────────────────────────────────────── */}
            {historyUser && history?.length > 0 && (
              <>
                <Polyline
                  positions={history.map(h => [h.latitude, h.longitude])}
                  pathOptions={{ color: "#54a0ff", weight: 3, dashArray: "6 4" }}
                />
                <CircleMarker center={[history[0].latitude, history[0].longitude]} radius={9}
                  pathOptions={{ color: "#00c096", fillColor: "#00c096", fillOpacity: 1, weight: 2 }}>
                  <Tooltip permanent direction="top" offset={[0, -10]}>
                    <span style={{ fontSize: 10, color: "#00c096" }}>
                      Clock-in {format(new Date(history[0].recorded_at), "HH:mm")}
                    </span>
                  </Tooltip>
                </CircleMarker>
                {history.length > 1 && (
                  <CircleMarker
                    center={[history[history.length - 1].latitude, history[history.length - 1].longitude]}
                    radius={9}
                    pathOptions={{ color: "#ff4d4f", fillColor: "#ff4d4f", fillOpacity: 1, weight: 2 }}>
                    <Tooltip permanent direction="top" offset={[0, -10]}>
                      <span style={{ fontSize: 10, color: "#ff4d4f" }}>
                        {histAttendance?.clock_out
                          ? `Clock-out ${format(new Date(histAttendance.clock_out), "HH:mm")}`
                          : "Last ping"}
                      </span>
                    </Tooltip>
                  </CircleMarker>
                )}
                {stops.map((stop, i) => (
                  <CircleMarker key={i}
                    center={[stop.lat, stop.lng]}
                    radius={6}
                    pathOptions={{ color: "#ff9f43", fillColor: "#ff9f43", fillOpacity: 0.9, weight: 2 }}>
                    <Tooltip direction="top" offset={[0, -8]}>
                      <span style={{ fontSize: 10, color: "#ff9f43" }}>
                        Stop #{i + 1} · {fmtDuration(stop.durationMin)}<br />
                        {format(stop.startTime, "HH:mm")} – {format(stop.endTime, "HH:mm")}
                      </span>
                    </Tooltip>
                  </CircleMarker>
                ))}
              </>
            )}
          </MapContainer>

          {/* Legend — desktop only */}
          <div className="hidden md:block absolute bottom-4 left-4 z-[400] bg-[#0a0d0f]/90 border border-[#21272f] rounded-xl px-4 py-3 space-y-1.5">
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
            {historyUser && (
              <>
                <div className="flex items-center gap-2 text-xs text-[#c2cad4]">
                  <div className="w-3 h-3 rounded-full bg-[#00c096]" /> Clock-in
                </div>
                <div className="flex items-center gap-2 text-xs text-[#c2cad4]">
                  <div className="w-3 h-3 rounded-full bg-[#ff4d4f]" /> Clock-out
                </div>
                <div className="flex items-center gap-2 text-xs text-[#c2cad4]">
                  <div className="w-3 h-3 rounded-full bg-[#ff9f43]" /> Stop (10m+)
                </div>
              </>
            )}
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
        <>
          {/* Mobile backdrop for history panel */}
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={() => setHistoryUser(null)}
          />

          <div className={`
            fixed inset-x-0 bottom-0 z-50
            flex flex-col
            border-t border-[#21272f] bg-[#0a0d0f] overflow-hidden
            rounded-t-2xl shadow-2xl
            h-[75vh]
            md:relative md:inset-auto md:h-full md:w-64 md:flex-shrink-0
            md:border-t-0 md:border-l md:rounded-none md:shadow-none
          `}>

            {/* Mobile drag handle */}
            <div className="flex justify-center pt-2.5 pb-1 md:hidden flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-[#2d3748]" />
            </div>

            {/* Panel header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#21272f] flex-shrink-0">
              <div>
                <p className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <History size={12} className="text-[#c8f230]" /> Route History
                </p>
                <p className="text-[10px] text-[#8b95a1] mt-0.5 truncate max-w-[160px]">{historyStaffName}</p>
              </div>
              <button
                onClick={() => setHistoryUser(null)}
                className="text-[#4a5568] hover:text-white p-1 rounded-lg hover:bg-[#21272f] transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            {/* Date picker */}
            <div className="px-4 py-3 border-b border-[#21272f] flex-shrink-0">
              <label className="text-[10px] text-[#8b95a1] uppercase tracking-wider block mb-1">Date</label>
              <input
                type="date"
                value={historyDate}
                max={format(new Date(), "yyyy-MM-dd")}
                onChange={e => setHistoryDate(e.target.value)}
                className="w-full bg-[#111418] border border-[#21272f] rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-[#c8f230]"
              />
            </div>

            {/* Attendance status */}
            <div className="px-4 py-2 border-b border-[#21272f] flex-shrink-0">
              {histAttendance ? (
                <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-xl ${
                  stillOnField
                    ? "bg-[#00c096]/10 text-[#00c096] border border-[#00c096]/20"
                    : "bg-[#21272f] text-[#8b95a1]"
                }`}>
                  <Clock size={11} className="flex-shrink-0" />
                  <span className="truncate">
                    {format(new Date(histAttendance.clock_in), "HH:mm")}
                    {histAttendance.clock_out
                      ? ` → ${format(new Date(histAttendance.clock_out), "HH:mm")}`
                      : " → now (active)"}
                  </span>
                  <Badge
                    label={histAttendance.status}
                    color={histAttendance.status === "late" ? "warn" : "ok"}
                    size="xs"
                  />
                </div>
              ) : histFetching ? (
                <p className="text-[10px] text-[#4a5568]">Checking attendance…</p>
              ) : (
                <p className="text-[10px] text-[#ff9f43] flex items-center gap-1">
                  <AlertTriangle size={10} /> No clock-in record — showing full day
                </p>
              )}
            </div>

            {/* Stats grid */}
            {history && history.length > 0 && (
              <div className="px-4 py-3 border-b border-[#21272f] grid grid-cols-4 md:grid-cols-2 gap-2 flex-shrink-0">
                <div className="bg-[#111418] rounded-xl p-2 text-center">
                  <p className="text-[9px] text-[#8b95a1]">Distance</p>
                  <p className="text-xs font-bold text-[#c8f230]">{totalDistKm}km</p>
                </div>
                <div className="bg-[#111418] rounded-xl p-2 text-center">
                  <p className="text-[9px] text-[#8b95a1]">Stops</p>
                  <p className="text-xs font-bold text-[#ff9f43]">{stops.length}</p>
                </div>
                <div className="bg-[#111418] rounded-xl p-2 text-center">
                  <p className="text-[9px] text-[#8b95a1]">Pings</p>
                  <p className="text-xs font-bold text-white font-mono">{history.length}</p>
                </div>
                <div className="bg-[#111418] rounded-xl p-2 text-center">
                  <p className="text-[9px] text-[#8b95a1]">Max spd</p>
                  <p className="text-xs font-bold text-white font-mono">
                    {Math.max(...history.map(h => h.speed_kmh ?? 0))}km/h
                  </p>
                </div>
              </div>
            )}

            {/* Stops summary */}
            {stops.length > 0 && (
              <div className="px-4 py-2 border-b border-[#21272f] flex-shrink-0">
                <p className="text-[10px] text-[#ff9f43] font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Timer size={10} /> Stops detected
                </p>
                <div className="space-y-0.5">
                  {stops.map((stop, i) => (
                    <div key={i} className="flex items-center justify-between py-0.5 text-[10px]">
                      <span className="text-[#8b95a1]">
                        #{i + 1} · {format(stop.startTime, "HH:mm")}–{format(stop.endTime, "HH:mm")}
                      </span>
                      <span className="text-[#ff9f43] font-mono font-semibold">{fmtDuration(stop.durationMin)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Ping timeline */}
            <div className="flex-1 overflow-y-auto py-2 min-h-0">
              {histFetching && (
                <p className="text-xs text-[#4a5568] text-center py-6">Loading…</p>
              )}
              {!histFetching && history?.length === 0 && (
                <p className="text-xs text-[#4a5568] text-center py-6">No GPS data for this date</p>
              )}
              {history?.map((h, i) => {
                const isStop = stops.some(s =>
                  Math.abs(differenceInMinutes(new Date(h.recorded_at), s.startTime)) < 2
                );
                return (
                  <div key={h.id}
                    className={`px-4 py-2 border-b border-[#21272f]/50 hover:bg-[#111418] transition-colors ${isStop ? "bg-[#ff9f43]/5" : ""}`}>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        i === 0               ? "bg-[#00c096]"
                        : i === history.length - 1 ? "bg-[#ff4d4f]"
                        : isStop              ? "bg-[#ff9f43]"
                        : "bg-[#21272f]"
                      }`} />
                      <span className="text-[10px] font-mono text-white">
                        {format(new Date(h.recorded_at), "HH:mm:ss")}
                      </span>
                      {isStop && <span className="text-[9px] text-[#ff9f43]">stop</span>}
                    </div>
                    <div className="pl-4 mt-0.5 flex gap-3">
                      <span className="text-[9px] text-[#4a5568] font-mono">
                        {h.latitude.toFixed(4)}, {h.longitude.toFixed(4)}
                      </span>
                    </div>
                    {(h.speed_kmh > 0 || h.battery_level) && (
                      <div className="pl-4 flex gap-2 mt-0.5">
                        {h.speed_kmh > 0 && <span className="text-[9px] text-[#4a5568]">🚗 {h.speed_kmh}km/h</span>}
                        {h.battery_level && <span className="text-[9px] text-[#4a5568]">🔋 {h.battery_level}%</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}