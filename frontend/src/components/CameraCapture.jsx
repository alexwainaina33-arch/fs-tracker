import React, { useEffect, useState } from "react";
import { Camera, FlipHorizontal, X, Check, RotateCcw, AlertCircle, Loader } from "lucide-react";
import { useCamera } from "../hooks/useCamera";

export default function CameraCapture({
  open,
  onCapture,
  onClose,
  title = "Take Photo",
  facingMode = "environment",
}) {
  const cam = useCamera();
  const [error,    setError]    = useState(null);
  const [loading,  setLoading]  = useState(false);
  // Guard: true only once the video is actually streaming pixels
  const [ready,    setReady]    = useState(false);

  useEffect(() => {
    if (open) {
      setError(null);
      setReady(false);
      setLoading(true);
      const t = setTimeout(() => {
        cam.open(facingMode)
          .then(() => {
            // Poll until the video element reports real dimensions
            const poll = setInterval(() => {
              if (cam.videoRef.current?.videoWidth > 0) {
                clearInterval(poll);
                setReady(true);
                setLoading(false);
              }
            }, 100);
            // Give up after 8 s
            setTimeout(() => { clearInterval(poll); setLoading(false); setReady(true); }, 8000);
          })
          .catch((err) => {
            setError(err.message);
            setLoading(false);
          });
      }, 50);
      return () => clearTimeout(t);
    } else {
      cam.close();
      setError(null);
      setReady(false);
      setLoading(false);
    }
  }, [open]);

  const handleCapture = async () => {
    if (!ready) return;
    await cam.capture();
    // photo state is now set — Accept/Retake bar appears below
  };

  const handleAccept = () => {
    onCapture(cam.photo);
    cam.close();
    onClose();
  };

  const handleClose = () => { cam.close(); onClose(); };

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black flex flex-col"
      style={{ display: open ? "flex" : "none" }}
    >
      {/* ── Top bar ── */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 bg-black/80 backdrop-blur">
        <button
          onClick={handleClose}
          className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white"
        >
          <X size={20} />
        </button>
        <span className="font-bold text-white text-sm">{title}</span>
        <button
          onClick={cam.flip}
          className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white"
        >
          <FlipHorizontal size={18} />
        </button>
      </div>

      {/* ── Viewport ── */}
      <div className="flex-1 relative overflow-hidden bg-black">

        {/* Error */}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-20 px-8 text-center">
            <AlertCircle size={48} className="text-red-500" />
            <p className="text-white font-semibold">Camera unavailable</p>
            <p className="text-gray-400 text-sm">{error}</p>
            <p className="text-gray-500 text-xs">
              Check the 🔒 icon in the address bar and allow camera access.
            </p>
            <button onClick={handleClose} className="mt-4 px-6 py-3 rounded-xl bg-gray-800 text-white text-sm">
              Close
            </button>
          </div>
        )}

        {/* Loading spinner while stream warms up */}
        {loading && !error && !cam.photo && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-20">
            <Loader size={32} className="text-[#c8f230] animate-spin" />
            <p className="text-gray-400 text-sm">Starting camera…</p>
          </div>
        )}

        {/* Captured photo preview */}
        {cam.photo && (
          <img
            src={cam.photo.dataUrl}
            alt="Captured"
            className="absolute inset-0 w-full h-full object-contain bg-black z-10"
          />
        )}

        {/* Live video */}
        <video
          ref={cam.videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
          style={{
            transform: cam.facing === "user" ? "scaleX(-1)" : "none",
            display: cam.photo ? "none" : "block",
          }}
        />

        {/* Viewfinder overlay — only when live & ready */}
        {!cam.photo && ready && !error && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="relative w-64 h-64">
              {/* scan line */}
              <div className="scan-line absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[#c8f230]/70 to-transparent" />
              {/* corner brackets */}
              {[
                "top-0 left-0 border-t-2 border-l-2",
                "top-0 right-0 border-t-2 border-r-2",
                "bottom-0 left-0 border-b-2 border-l-2",
                "bottom-0 right-0 border-b-2 border-r-2",
              ].map((cls, i) => (
                <div key={i} className={`absolute w-8 h-8 border-[#c8f230] ${cls} rounded-sm`} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom action bar — ALWAYS has a solid background so it's visible ── */}
      <div className="flex-shrink-0 bg-[#0a0d0f] border-t border-[#21272f]">

        {!cam.photo ? (
          /* Live view controls */
          <div className="flex items-center justify-center py-6 gap-8">
            {/* placeholder spacer */}
            <div className="w-14" />

            {/* Shutter */}
            <button
              onClick={handleCapture}
              disabled={!ready || !!error}
              className="w-20 h-20 rounded-full bg-white border-4 border-[#c8f230] flex flex-col items-center justify-center gap-1 active:scale-90 transition-transform shadow-2xl disabled:opacity-30"
            >
              <Camera size={28} className="text-black" />
            </button>

            {/* Flip */}
            <button
              onClick={cam.flip}
              className="w-14 h-14 rounded-full bg-[#1a1f26] border border-[#21272f] flex items-center justify-center text-white active:scale-90 transition-transform"
            >
              <FlipHorizontal size={20} />
            </button>
          </div>
        ) : (
          /* Preview controls — lime Accept always visible on dark bar */
          <div className="flex items-stretch gap-0">
            {/* Retake */}
            <button
              onClick={cam.retake}
              className="flex-1 flex flex-col items-center justify-center gap-1.5 py-5 text-white active:bg-white/5 transition-colors border-r border-[#21272f]"
            >
              <RotateCcw size={22} />
              <span className="text-xs text-gray-400">Retake</span>
            </button>

            {/* Accept — bright lime, unmissable */}
            <button
              onClick={handleAccept}
              className="flex-1 flex flex-col items-center justify-center gap-1.5 py-5 bg-[#c8f230] active:bg-[#b0d820] transition-colors"
            >
              <Check size={26} className="text-black font-bold" />
              <span className="text-xs text-black font-bold">Use Photo</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
