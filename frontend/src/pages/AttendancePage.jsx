// src/pages/AttendancePage.jsx
// Offline-safe: clock-in/out queued when no internet, syncs on reconnect

import React, { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { pb, fileUrl } from "../lib/pb";
import { useAuth } from "../store/auth";
import { isOnline, enqueueAttendanceClockIn, enqueueAttendanceClockOut } from "../lib/offlineQueue";
import CameraCapture from "../components/CameraCapture";
import { Badge } from "../components/ui/Badge";
import { Btn } from "../components/ui/Btn";
import { Camera, Clock, MapPin, CheckCircle, ExternalLink, WifiOff } from "lucide-react";
import { format, differenceInMinutes } from "date-fns";
import toast from "react-hot-toast";

function getPositionSafe(timeout = 8000) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      ()     => resolve(null),
      { enableHighAccuracy: true, timeout, maximumAge: 30000 }
    );
  });
}

export default function AttendancePage() {
  const { user } = useAuth();
  const qc      = useQueryClient();
  const isAdmin = ["admin", "manager", "supervisor"].includes(user?.role);
  const today   = format(new Date(), "yyyy-MM-dd");
  const online  = isOnline();

  const [camOpen, setCamOpen] = useState(false);
  const [camMode, setCamMode] = useState("clock-in");

  const cachedPos = useRef(null);
  useEffect(() => {
    getPositionSafe(10000).then((p) => { if (p) cachedPos.current = p; });
  }, []);

  const { data: mine } = useQuery({
    queryKey: ["my-att", today, user.id],
    queryFn:  () =>
      pb.collection("ft_attendance")
        .getFirstListItem(`user = "${user.id}" && date = "${today}"`)
        .catch(() => null),
    refetchInterval: 10000,
  });

  const { data: all } = useQuery({
    queryKey: ["all-att", today],
    queryFn:  () =>
      pb.collection("ft_attendance").getList(1, 200, {
        filter: `date = "${today}"`,
        expand: "user",
        sort:   "-clock_in",
      }),
    enabled:        isAdmin,
    refetchInterval: 15000,
  });

  const clockInMut = useMutation({
    mutationFn: async ({ photo }) => {
      let pos = cachedPos.current;
      if (!pos) pos = await getPositionSafe(5000);

      const now  = new Date();
      const late = now.getHours() > 8 || (now.getHours() === 8 && now.getMinutes() > 15);

      const payload = {
        user:         user.id,
        date:         today,
        clock_in:     now.toISOString().replace("T", " "),
        status:       late ? "late" : "present",
        clock_in_lat: pos ? pos.coords.latitude  : null,
        clock_in_lng: pos ? pos.coords.longitude : null,
      };

      // ── OFFLINE path ──────────────────────────────────────────────────────
      if (!isOnline()) {
        // Queue without photo (binary can't be stored in IndexedDB easily)
        await enqueueAttendanceClockIn(payload);
        return { _offline: true, _localTime: now.toISOString(), _status: payload.status };
      }

      // ── ONLINE path ───────────────────────────────────────────────────────
      const fd = new FormData();
      Object.entries(payload).forEach(([k, v]) => { if (v !== null) fd.append(k, v); });
      if (photo?.blob) fd.append("clock_in_selfie", photo.blob, `selfie-in-${Date.now()}.jpg`);
      return pb.collection("ft_attendance").create(fd);
    },
    onSuccess: (result) => {
      qc.invalidateQueries(["my-att"]);
      qc.invalidateQueries(["all-att"]);
      if (result?._offline) {
        toast("📴 Clock-in saved offline — will sync when connected", {
          icon: "📴", duration: 5000,
          style: { background: "#181c21", color: "#ff9f43", border: "1px solid #ff9f43/30" },
        });
      } else {
        toast.success("Clocked IN ✅");
      }
    },
    onError: (e) => {
      console.error("Clock-in error:", e?.response?.data ?? e);
      toast.error("Clock-in failed: " + e.message);
    },
  });

  const clockOutMut = useMutation({
    mutationFn: async ({ photo }) => {
      let pos = cachedPos.current;
      if (!pos) pos = await getPositionSafe(5000);

      const now   = new Date();
      const hours = mine?.clock_in
        ? +(differenceInMinutes(now, new Date(mine.clock_in)) / 60).toFixed(2)
        : 0;

      const payload = {
        clock_out:     now.toISOString().replace("T", " "),
        total_hours:   hours,
        clock_out_lat: pos ? pos.coords.latitude  : null,
        clock_out_lng: pos ? pos.coords.longitude : null,
      };

      // ── OFFLINE path ──────────────────────────────────────────────────────
      if (!isOnline()) {
        if (!mine?.id) throw new Error("No clock-in record found to update");
        await enqueueAttendanceClockOut(mine.id, payload);
        return { _offline: true };
      }

      // ── ONLINE path ───────────────────────────────────────────────────────
      const fd = new FormData();
      Object.entries(payload).forEach(([k, v]) => { if (v !== null) fd.append(k, v); });
      return pb.collection("ft_attendance").update(mine.id, fd);
    },
    onSuccess: (result) => {
      qc.invalidateQueries(["my-att"]);
      qc.invalidateQueries(["all-att"]);
      getPositionSafe(8000).then((p) => { if (p) cachedPos.current = p; });
      if (result?._offline) {
        toast("📴 Clock-out saved offline — will sync when connected", {
          icon: "📴", duration: 5000,
          style: { background: "#181c21", color: "#ff9f43", border: "1px solid #ff9f43/30" },
        });
      } else {
        toast.success("Clocked OUT 🔴");
      }
    },
    onError: (e) => {
      console.error("Clock-out error:", e?.response?.data ?? e);
      toast.error("Clock-out failed: " + e.message);
    },
  });

  const handlePhoto = (photo) => {
    setCamOpen(false);
    if (camMode === "clock-in") clockInMut.mutate({ photo });
    else                        clockOutMut.mutate({ photo });
  };

  // When offline, skip the camera and clock in directly
  const handleClockAction = (mode) => {
    if (!isOnline()) {
      // No camera when offline — clock in immediately with GPS only
      if (mode === "clock-in") clockInMut.mutate({ photo: null });
      else                     clockOutMut.mutate({ photo: null });
    } else {
      setCamMode(mode);
      setCamOpen(true);
    }
  };

  const isClockedIn  = mine?.clock_in && !mine?.clock_out;
  const isClockedOut = mine?.clock_in &&  mine?.clock_out;

  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const t = setInterval(() => forceUpdate((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const elapsedMin = isClockedIn
    ? differenceInMinutes(new Date(), new Date(mine.clock_in))
    : 0;

  return (
    <div className="p-5 max-w-5xl mx-auto space-y-5 pb-8">

      {/* Offline banner */}
      {!online && (
        <div className="flex items-center gap-2 px-4 py-3 bg-[#ff9f43]/10 border border-[#ff9f43]/20 rounded-xl">
          <WifiOff size={14} className="text-[#ff9f43] flex-shrink-0" />
          <p className="text-sm text-[#ff9f43]">
            You're offline. Clock-in/out will be saved locally and synced automatically when you reconnect.
            Selfie photos will not be captured.
          </p>
        </div>
      )}

      {/* Personal clock-in card */}
      <div className="bg-[#111418] border border-[#21272f] rounded-2xl p-5 sm:p-7">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">

          {/* Selfie avatar */}
          <div className="w-24 h-24 rounded-2xl bg-[#0a0d0f] border border-[#21272f] flex items-center justify-center flex-shrink-0 overflow-hidden">
            {mine?.clock_in_selfie
              ? <img src={fileUrl(mine, mine.clock_in_selfie, "200x200")} alt="selfie" className="w-full h-full object-cover" />
              : <Camera size={28} className="text-[#21272f]" />}
          </div>

          {/* Status info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="font-display font-bold text-xl text-white">{user.name}</h2>
              {mine?.status && (
                <Badge label={mine.status} color={mine.status === "late" ? "warn" : mine.status === "present" ? "ok" : "default"} />
              )}
            </div>
            {mine?.clock_in ? (
              <div className="space-y-0.5">
                <p className="text-[#8b95a1] text-sm flex items-center gap-1 flex-wrap">
                  <span>🟢</span>
                  <span className="font-mono text-white">{format(new Date(mine.clock_in), "HH:mm:ss")}</span>
                  {mine.clock_in_lat ? (
                    <a href={`https://maps.google.com/?q=${mine.clock_in_lat},${mine.clock_in_lng}`}
                      target="_blank" rel="noreferrer"
                      className="ml-1 text-[#c8f230] hover:underline text-xs flex items-center gap-0.5">
                      <MapPin size={11} className="inline" /> GPS
                    </a>
                  ) : (
                    <span className="text-[#3d4550] text-xs">(no GPS)</span>
                  )}
                </p>
                {mine?.clock_out && (
                  <p className="text-[#8b95a1] text-sm">
                    🔴 <span className="font-mono text-white">{format(new Date(mine.clock_out), "HH:mm:ss")}</span>
                  </p>
                )}
                {isClockedIn && (
                  <p className="font-mono text-[#c8f230] text-xl font-bold mt-2">
                    {String(Math.floor(elapsedMin / 60)).padStart(2, "0")}:
                    {String(elapsedMin % 60).padStart(2, "0")}
                    <span className="text-sm font-normal text-[#8b95a1] ml-2">elapsed</span>
                  </p>
                )}
                {isClockedOut && (
                  <p className="text-[#00c096] text-sm font-medium mt-1">✓ {mine.total_hours}h logged today</p>
                )}
              </div>
            ) : (
              <p className="text-[#8b95a1] text-sm">Not clocked in yet today</p>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-2 flex-shrink-0">
            {!mine && (
              <Btn onClick={() => handleClockAction("clock-in")} disabled={clockInMut.isPending} size="lg">
                <Camera size={16} /> {online ? "Clock In" : "Clock In (Offline)"}
              </Btn>
            )}
            {isClockedIn && (
              <Btn onClick={() => handleClockAction("clock-out")} disabled={clockOutMut.isPending} variant="danger" size="lg">
                <Camera size={16} /> {online ? "Clock Out" : "Clock Out (Offline)"}
              </Btn>
            )}
            {isClockedOut && (
              <div className="flex items-center gap-2 text-[#00c096] text-sm font-medium px-4 py-3">
                <CheckCircle size={18} /> Done for today
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Admin team table */}
      {isAdmin && (
        <div className="bg-[#111418] border border-[#21272f] rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#21272f]">
            <h2 className="font-display font-bold text-white">Team — {format(new Date(), "dd MMM yyyy")}</h2>
            <Badge label={`${all?.items.length ?? 0} records`} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#21272f] text-[#8b95a1] text-xs uppercase tracking-wider">
                  {["Staff","Status","In","Out","Hours","GPS","Selfie"].map((h) => (
                    <th key={h} className="px-5 py-3 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#21272f]">
                {all?.items.map((a) => (
                  <tr key={a.id} className="hover:bg-[#181c21] transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-[#c8f230]/10 border border-[#c8f230]/20 flex items-center justify-center text-xs font-bold text-[#c8f230]">
                          {a.expand?.user?.name?.[0]?.toUpperCase() ?? "?"}
                        </div>
                        <span className="text-white font-medium">{a.expand?.user?.name ?? a.user}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <Badge label={a.status} color={a.status === "late" ? "warn" : a.status === "present" ? "ok" : "default"} />
                    </td>
                    <td className="px-5 py-3 font-mono text-[#c2cad4]">{a.clock_in ? format(new Date(a.clock_in), "HH:mm") : "—"}</td>
                    <td className="px-5 py-3 font-mono text-[#c2cad4]">
                      {a.clock_out ? format(new Date(a.clock_out), "HH:mm") : a.clock_in ? <span className="text-[#00c096] animate-pulse">Active</span> : "—"}
                    </td>
                    <td className="px-5 py-3 text-[#c2cad4]">{a.total_hours ? `${a.total_hours}h` : "—"}</td>
                    <td className="px-5 py-3">
                      {a.clock_in_lat ? (
                        <a href={`https://maps.google.com/?q=${a.clock_in_lat},${a.clock_in_lng}`}
                          target="_blank" rel="noreferrer"
                          className="text-[#c8f230] hover:underline flex items-center gap-1">
                          <ExternalLink size={12} /> View
                        </a>
                      ) : <span className="text-[#3d4550]">—</span>}
                    </td>
                    <td className="px-5 py-3">
                      {a.clock_in_selfie ? (
                        <img src={fileUrl(a, a.clock_in_selfie, "100x100")} alt="selfie"
                          className="w-8 h-8 rounded-lg object-cover border border-[#21272f]"
                          onError={(e) => { e.target.style.display = "none"; }} />
                      ) : <span className="text-[#3d4550]">—</span>}
                    </td>
                  </tr>
                ))}
                {!all?.items.length && (
                  <tr><td colSpan={7} className="px-5 py-10 text-center text-[#8b95a1]">No records today</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <CameraCapture open={camOpen} onClose={() => setCamOpen(false)} onCapture={handlePhoto}
        title={camMode === "clock-in" ? "Clock-In Selfie" : "Clock-Out Selfie"} facingMode="user" />
    </div>
  );
}