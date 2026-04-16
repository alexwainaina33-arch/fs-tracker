import { useState, useRef, useCallback } from "react";

export function useCamera() {
  const videoRef  = useRef(null);
  const streamRef = useRef(null);
  const [ready,  setReady]  = useState(false);
  const [photo,  setPhoto]  = useState(null);
  const [facing, setFacing] = useState("environment");

  const open = useCallback(async (facingMode = "environment") => {
    setFacing(facingMode);
    try {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());

      let stream;
      try {
        // First: try the requested facing mode (e.g. "environment" / rear)
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (firstErr) {
        // Fallback: laptop has no rear camera — just get any available camera
        console.warn(`Camera facingMode "${facingMode}" not available, falling back to any camera:`, firstErr.message);
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        // If we fell back, we're effectively using the front/only camera
        setFacing("user");
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setReady(true);
      setPhoto(null);
    } catch (err) {
      // Even the fallback failed — camera truly unavailable or permission denied
      console.error("Camera open failed:", err);
      throw new Error("Cannot open camera: " + err.message);
    }
  }, []);

  const capture = useCallback(async () => {
    if (!videoRef.current) return null;
    const video  = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");

    // Mirror the image if using front-facing camera
    if (facing === "user") { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, 0, 0);
    if (facing === "user") ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Burn timestamp into bottom-left of photo
    const ts    = new Date();
    const tsStr = ts.toLocaleString("en-KE", { hour12: false }) + " EAT";
    ctx.font      = "bold 18px monospace";
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(8, canvas.height - 48, ctx.measureText(tsStr).width + 20, 36);
    ctx.fillStyle = "#c8f230";
    ctx.fillText(tsStr, 18, canvas.height - 22);

    // Try to get GPS and burn into bottom-right (gracefully skipped if unavailable)
    let lat = null, lng = null;
    try {
      const p = await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 5000 })
      );
      lat = p.coords.latitude;
      lng = p.coords.longitude;
      const gpsStr = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      const gpsW   = ctx.measureText(gpsStr).width + 20;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(canvas.width - gpsW - 8, canvas.height - 48, gpsW, 36);
      ctx.fillStyle = "#00c096";
      ctx.fillText(gpsStr, canvas.width - gpsW + 2, canvas.height - 22);
    } catch {
      // GPS unavailable on this device/browser — skip silently
    }

    const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
    const blob    = await (await fetch(dataUrl)).blob();
    const result  = { dataUrl, blob, timestamp: ts.toISOString(), lat, lng };
    setPhoto(result);
    return result;
  }, [facing]);

  const flip = useCallback(() => {
    open(facing === "environment" ? "user" : "environment");
  }, [facing, open]);

  const close = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setReady(false);
    setPhoto(null);
  }, []);

  const retake = useCallback(() => setPhoto(null), []);

  return { videoRef, ready, photo, facing, open, capture, flip, close, retake };
}
