import React, { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { pb, fileUrl } from "../lib/pb";
import { useAuth } from "../store/auth";
import CameraCapture from "../components/CameraCapture";
import { Badge } from "../components/ui/Badge";
import { Btn } from "../components/ui/Btn";
import { Camera, Clock, MapPin, CheckCircle, ExternalLink } from "lucide-react";
import { format, differenceInMinutes } from "date-fns";
import toast from "react-hot-toast";

// Resolves with position or null — never rejects, so the app never crashes.
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

  const [camOpen, setCamOpen] = useState(false);
  const [camMode, setCamMode] = useState("clock-in");

  // ✅ GPS is fetched ONCE when the page loads and cached here.
  // This avoids the race condition where the mutation fires before GPS responds.
  const cachedPos = useRef(null);
  useEffect(() => {
    getPositionSafe(10000).then((p) => {
      if (p) cachedPos.current = p;
    });
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
    enabled: isAdmin,
    refetchInterval: 15000,
  });

  const clockInMut = useMutation({
    mutationFn: async ({ photo }) => {
      // ✅ Use cached GPS first; if not ready yet, try once more with short timeout
      let pos = cachedPos.current;
      if (!pos) pos = await getPositionSafe(5000);

      const now  = new Date();
      const late = now.getHours() > 8 || (now.getHours() === 8 && now.getMinutes() > 15);
      const fd   = new FormData();
      fd.append("user",     user.id);
      fd.append("date",     today);
      fd.append("clock_in", now.toISOString().replace("T", " "));
      fd.append("status",   late ? "late" : "present");
      if (pos) {
        fd.append("clock_in_lat", pos.coords.latitude);
        fd.append("clock_in_lng", pos.coords.longitude);
      }
      if (photo?.blob) fd.append("clock_in_selfie", photo.blob, `selfie-in-${Date.now()}.jpg`);
      return pb.collection("ft_attendance").create(fd);
    },
    onSuccess: () => {
      qc.invalidateQueries(["my-att"]);
      qc.invalidateQueries(["all-att"]);
      toast.success("Clocked IN ✅");
    },
    onError: (e) => {
      console.error("Clock-in error:", e?.response?.data ?? e);
      toast.error("Clock-in failed: " + e.message);
    },
  });

  const clockOutMut = useMutation({
    mutationFn: async ({ photo }) => {
      // ✅ Same GPS caching approach
      let pos = cachedPos.current;
      if (!pos) pos = await getPositionSafe(5000);

      const now   = new Date();
      const hours = +(differenceInMinutes(now, new Date(mine.clock_in)) / 60).toFixed(2);
      const fd    = new FormData();
      fd.append("clock_out",   now.toISOString().replace("T", " "));
      fd.append("total_hours", hours);
      if (pos) {
        fd.append("clock_out_lat", pos.coords.latitude);
        fd.append("clock_out_lng", pos.coords.longitude);
      }
      // Note: clock_out_selfie is not in the PB schema; only clock_in_selfie is.
      // So we skip attaching the clock-out photo to avoid a PB error.
      return pb.collection("ft_attendance").update(mine.id, fd);
    },
    onSuccess: () => {
      qc.invalidateQueries(["my-att"]);
      qc.invalidateQueries(["all-att"]);
      toast.success("Clocked OUT 🔴");
      // Refresh cached GPS for any future actions
      getPositionSafe(8000).then((p) => { if (p) cachedPos.current = p; });
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

  const isClockedIn  = mine?.clock_in && !mine?.clock_out;
  const isClockedOut = mine?.clock_in &&  mine?.clock_out;

  // Live elapsed-time ticker
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

      {/* ── Personal clock-in card ── */}
      <div className="bg-[#111418] border border-[#21272f] rounded-2xl p-5 sm:p-7">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">

          {/* Selfie avatar */}
          <div className="w-24 h-24 rounded-2xl bg-[#0a0d0f] border border-[#21272f] flex items-center justify-center flex-shrink-0 overflow-hidden">
            {mine?.clock_in_selfie
              ? <img
                  src={fileUrl(mine, mine.clock_in_selfie, "200x200")}
                  alt="selfie"
                  className="w-full h-full object-cover"
                />
              : <Camera size={28} className="text-[#21272f]" />}
          </div>

          {/* Status info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="font-display font-bold text-xl text-white">{user.name}</h2>
              {mine?.status && (
                <Badge
                  label={mine.status}
                  color={mine.status === "late" ? "warn" : mine.status === "present" ? "ok" : "default"}
                />
              )}
            </div>

            {mine?.clock_in ? (
              <div className="space-y-0.5">
                <p className="text-[#8b95a1] text-sm flex items-center gap-1 flex-wrap">
                  <span>🟢</span>
                  <span className="font-mono text-white">
                    {format(new Date(mine.clock_in), "HH:mm:ss")}
                  </span>
                  {/* ✅ GPS link — only shows when coordinates were captured */}
                  {mine.clock_in_lat ? (
                    <a
                      href={`https://maps.google.com/?q=${mine.clock_in_lat},${mine.clock_in_lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-1 text-[#c8f230] hover:underline text-xs flex items-center gap-0.5"
                    >
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
                  <p className="text-[#00c096] text-sm font-medium mt-1">
                    ✓ {mine.total_hours}h logged today
                  </p>
                )}
              </div>
            ) : (
              <p className="text-[#8b95a1] text-sm">Not clocked in yet today</p>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-2 flex-shrink-0">
            {!mine && (
              <Btn
                onClick={() => { setCamMode("clock-in"); setCamOpen(true); }}
                disabled={clockInMut.isPending}
                size="lg"
              >
                <Camera size={16} /> Clock In
              </Btn>
            )}
            {isClockedIn && (
              <Btn
                onClick={() => { setCamMode("clock-out"); setCamOpen(true); }}
                disabled={clockOutMut.isPending}
                variant="danger"
                size="lg"
              >
                <Camera size={16} /> Clock Out
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

      {/* ── Admin team table ── */}
      {isAdmin && (
        <div className="bg-[#111418] border border-[#21272f] rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#21272f]">
            <h2 className="font-display font-bold text-white">
              Team — {format(new Date(), "dd MMM yyyy")}
            </h2>
            <Badge label={`${all?.items.length ?? 0} records`} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#21272f] text-[#8b95a1] text-xs uppercase tracking-wider">
                  {["Staff", "Status", "In", "Out", "Hours", "GPS", "Selfie"].map((h) => (
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
                        <span className="text-white font-medium">
                          {a.expand?.user?.name ?? a.user}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <Badge
                        label={a.status}
                        color={a.status === "late" ? "warn" : a.status === "present" ? "ok" : "default"}
                      />
                    </td>
                    <td className="px-5 py-3 font-mono text-[#c2cad4]">
                      {a.clock_in ? format(new Date(a.clock_in), "HH:mm") : "—"}
                    </td>
                    <td className="px-5 py-3 font-mono text-[#c2cad4]">
                      {a.clock_out
                        ? format(new Date(a.clock_out), "HH:mm")
                        : a.clock_in
                          ? <span className="text-[#00c096] animate-pulse">Active</span>
                          : "—"}
                    </td>
                    <td className="px-5 py-3 text-[#c2cad4]">
                      {a.total_hours ? `${a.total_hours}h` : "—"}
                    </td>
                    {/* ✅ GPS link for admin */}
                    <td className="px-5 py-3">
                      {a.clock_in_lat ? (
                        <a
                          href={`https://maps.google.com/?q=${a.clock_in_lat},${a.clock_in_lng}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#c8f230] hover:underline flex items-center gap-1"
                        >
                          <ExternalLink size={12} /> View
                        </a>
                      ) : (
                        <span className="text-[#3d4550]">—</span>
                      )}
                    </td>
                    {/* ✅ Selfie thumbnail for admin */}
                    <td className="px-5 py-3">
                      {a.clock_in_selfie ? (
                        <img
                          src={fileUrl(a, a.clock_in_selfie, "100x100")}
                          alt="selfie"
                          className="w-8 h-8 rounded-lg object-cover border border-[#21272f]"
                          onError={(e) => { e.target.style.display = "none"; }}
                        />
                      ) : (
                        <span className="text-[#3d4550]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {!all?.items.length && (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-[#8b95a1]">
                      No records today
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <CameraCapture
        open={camOpen}
        onClose={() => setCamOpen(false)}
        onCapture={handlePhoto}
        title={camMode === "clock-in" ? "Clock-In Selfie" : "Clock-Out Selfie"}
        facingMode="user"
      />
    </div>
  );
}
