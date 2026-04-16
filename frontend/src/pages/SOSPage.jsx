import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { pb } from "../lib/pb";
import { useAuth } from "../store/auth";
import { getPosition } from "../hooks/useGPS";
import { AlertOctagon, MapPin, Phone, ArrowLeft, CheckCircle, Loader } from "lucide-react";
import toast from "react-hot-toast";

const SOS_TYPES = [
  { id: "medical",   label: "Medical Emergency", emoji: "🏥", },
  { id: "security",  label: "Security Threat",   emoji: "⚠️", },
  { id: "accident",  label: "Vehicle Accident",  emoji: "🚗", },
  { id: "breakdown", label: "Vehicle Breakdown", emoji: "🔧", },
  { id: "robbery",   label: "Robbery / Theft",   emoji: "🔴", },
  { id: "other",     label: "Other Emergency",   emoji: "📢", },
];

const HOLD_DURATION = 3000;

export default function SOSPage() {
  const { user } = useAuth();
  const navigate  = useNavigate();
  const [step,    setStep]    = useState("select");
  const [sosType, setSosType] = useState(null);
  const [pos,     setPos]     = useState(null);
  const [holding, setHolding] = useState(false);
  const [holdPct, setHoldPct] = useState(0);
  const holdStart = useRef(null);
  const animRef   = useRef(null);

  useEffect(() => {
    getPosition().then(p => setPos({ lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy) })).catch(() => {});
  }, []);

  const startHold = () => {
    holdStart.current = Date.now();
    setHolding(true);
    const tick = () => {
      const pct = Math.min(((Date.now() - holdStart.current) / HOLD_DURATION) * 100, 100);
      setHoldPct(pct);
      if (pct < 100) animRef.current = requestAnimationFrame(tick);
      else sendSOS();
    };
    animRef.current = requestAnimationFrame(tick);
  };

  const cancelHold = () => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    setHolding(false);
    setHoldPct(0);
  };

  const sendSOS = async () => {
    cancelHold();
    setStep("sending");
    try {
      await pb.collection("ft_sos_alerts").create({
        user:         user.id,
        alert_type:   sosType.id,
        latitude:     pos?.lat ?? null,
        longitude:    pos?.lng ?? null,
        status:       "active",
        message:      `SOS: ${sosType.label} — ${user.name}`,
        triggered_at: new Date().toISOString(),
      });
      setStep("sent");
      toast.success("SOS sent! Help is on the way.");
    } catch (err) {
      toast.error("SOS failed: " + err.message);
      setStep("confirm");
    }
  };

  const mapsUrl = pos ? `https://maps.google.com/?q=${pos.lat},${pos.lng}` : null;

  return (
    <div className="min-h-full bg-[#0a0d0f] flex flex-col">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-[#21272f]">
        <button onClick={() => navigate(-1)} className="text-[#8b95a1] hover:text-white p-1.5"><ArrowLeft size={20} /></button>
        <h1 className="font-display font-bold text-xl text-white flex items-center gap-2">
          <AlertOctagon size={20} className="text-[#ff4d4f] animate-pulse" /> Emergency SOS
        </h1>
      </div>

      <div className="flex-1 p-5 max-w-md mx-auto w-full space-y-6 pb-8">
        <div className={`rounded-2xl px-4 py-3 flex items-center gap-3 ${pos ? "bg-[#00c096]/10 border border-[#00c096]/20" : "bg-[#21272f]"}`}>
          <MapPin size={16} className={pos ? "text-[#00c096]" : "text-[#8b95a1]"} />
          {pos
            ? <span className="text-sm text-[#00c096] font-mono">{pos.lat.toFixed(4)}, {pos.lng.toFixed(4)} ±{pos.acc}m</span>
            : <span className="text-sm text-[#8b95a1]">Getting location…</span>}
          {pos && mapsUrl && <a href={mapsUrl} target="_blank" rel="noreferrer" className="ml-auto text-xs text-[#c8f230] hover:underline">Map</a>}
        </div>

        {step === "select" && (
          <>
            <p className="text-[#8b95a1] text-sm">Select the type of emergency:</p>
            <div className="grid grid-cols-2 gap-3">
              {SOS_TYPES.map(t => (
                <button key={t.id} onClick={() => { setSosType(t); setStep("confirm"); }}
                  className="bg-[#111418] border border-[#21272f] hover:border-[#ff4d4f]/50 rounded-2xl p-5 text-left transition-all active:scale-95 card-lift">
                  <span className="text-2xl block mb-2">{t.emoji}</span>
                  <span className="text-sm font-semibold text-white">{t.label}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {step === "confirm" && sosType && (
          <div className="flex flex-col items-center gap-8">
            <div className="text-center">
              <span className="text-5xl block mb-3">{sosType.emoji}</span>
              <h2 className="font-display font-bold text-2xl text-white">{sosType.label}</h2>
              <p className="text-[#8b95a1] text-sm mt-1">Hold the button for 3 seconds to send alert</p>
            </div>

            <div className="relative">
              {[1,2,3].map(i => (
                <div key={i} className="absolute inset-0 rounded-full border border-[#ff4d4f]/20 sos-ring" style={{ animationDelay: `${i * 0.4}s` }} />
              ))}
              <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="54" fill="none" stroke="#ff4d4f" strokeWidth="4" strokeOpacity="0.2" />
                <circle cx="60" cy="60" r="54" fill="none" stroke="#ff4d4f" strokeWidth="4"
                  strokeDasharray={`${2 * Math.PI * 54}`}
                  strokeDashoffset={`${2 * Math.PI * 54 * (1 - holdPct / 100)}`} />
              </svg>
              <button
                onMouseDown={startHold} onMouseUp={cancelHold} onMouseLeave={cancelHold}
                onTouchStart={startHold} onTouchEnd={cancelHold}
                className="relative w-36 h-36 rounded-full bg-[#ff4d4f] flex flex-col items-center justify-center gap-1 select-none cursor-pointer active:scale-95 transition-transform shadow-2xl shadow-[#ff4d4f]/40">
                <AlertOctagon size={36} className="text-white" />
                <span className="text-white text-xs font-bold">{holding ? `${Math.round(holdPct)}%` : "HOLD"}</span>
              </button>
            </div>

            <button onClick={() => setStep("select")} className="text-[#8b95a1] text-sm hover:text-white transition-colors">← Change type</button>

            <div className="w-full bg-[#111418] border border-[#21272f] rounded-2xl p-4 space-y-2">
              <p className="text-xs text-[#8b95a1] uppercase tracking-wider font-medium mb-3">Emergency Contacts</p>
              {[
                { label: "Kenya Police",  number: "999" },
                { label: "Ambulance",     number: "0800 720 999" },
                { label: "Fire Brigade",  number: "0800 221 211" },
              ].map(c => (
                <a key={c.label} href={`tel:${c.number}`}
                  className="flex items-center justify-between py-2 border-b border-[#21272f] last:border-0 hover:text-[#c8f230] transition-colors group">
                  <span className="text-sm text-[#c2cad4] group-hover:text-[#c8f230]">{c.label}</span>
                  <span className="font-mono text-sm text-[#c8f230] flex items-center gap-1"><Phone size={12} />{c.number}</span>
                </a>
              ))}
            </div>
          </div>
        )}

        {step === "sending" && (
          <div className="flex flex-col items-center gap-6 py-12">
            <Loader size={48} className="text-[#ff4d4f] animate-spin" />
            <p className="font-display font-bold text-xl text-white">Sending SOS…</p>
          </div>
        )}

        {step === "sent" && (
          <div className="flex flex-col items-center gap-6 py-12">
            <div className="w-24 h-24 rounded-full bg-[#00c096]/15 border border-[#00c096]/30 flex items-center justify-center">
              <CheckCircle size={48} className="text-[#00c096]" />
            </div>
            <div className="text-center">
              <p className="font-display font-bold text-2xl text-white">SOS Sent!</p>
              <p className="text-[#8b95a1] text-sm mt-2">Your supervisors have been notified with your GPS location.</p>
            </div>
            {mapsUrl && (
              <a href={mapsUrl} target="_blank" rel="noreferrer"
                className="px-6 py-3 rounded-xl bg-[#00c096]/15 border border-[#00c096]/30 text-[#00c096] text-sm font-medium">
                View my location on maps
              </a>
            )}
            <button onClick={() => navigate("/dashboard")} className="text-[#8b95a1] text-sm hover:text-white transition-colors">
              Back to Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
