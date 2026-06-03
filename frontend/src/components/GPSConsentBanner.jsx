// src/components/GPSConsentBanner.jsx
// Shown to field_staff users who haven't yet decided on GPS tracking.
// Privacy-first: explains what is tracked, gives explicit Accept / Decline.

import React from "react";
import { MapPin, Shield, X } from "lucide-react";

export default function GPSConsentBanner({ onGrant, onRevoke }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-[500] p-4 bg-[#0a0d0f] border-t border-[#21272f] shadow-2xl md:max-w-lg md:mx-auto md:mb-4 md:rounded-2xl md:border">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#c8f230]/10 border border-[#c8f230]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
          <MapPin size={18} className="text-[#c8f230]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold text-sm">Enable Location Tracking?</p>
          <p className="text-[#8b95a1] text-xs mt-1 leading-relaxed">
            FieldTrack uses your GPS to log field visits and show your location to your manager during
            working hours. <strong className="text-white">Your location is only shared while the app is open.</strong>
            {" "}You can pause or disable tracking at any time from your profile.
          </p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={onGrant}
              className="flex-1 py-2.5 rounded-xl bg-[#c8f230] text-[#0a0d0f] text-xs font-bold transition-opacity hover:opacity-90"
            >
              ✓ Allow Tracking
            </button>
            <button
              onClick={onRevoke}
              className="flex-1 py-2.5 rounded-xl bg-[#1a1f26] border border-[#21272f] text-[#8b95a1] text-xs font-medium hover:text-white transition-colors"
            >
              Not Now
            </button>
          </div>
          <p className="text-[10px] text-[#4b5563] mt-2 flex items-center gap-1">
            <Shield size={10} /> Location data is used only for work tracking and is never sold.
          </p>
        </div>
      </div>
    </div>
  );
}