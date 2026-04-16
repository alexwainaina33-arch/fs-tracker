import { useEffect } from "react";
import { X } from "lucide-react";

export function Modal({ open, onClose, title, children, width = "max-w-lg" }) {
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div onClick={onClose} className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" />
      <div className={`relative w-full ${width} bg-[#111418] border border-[#21272f] rounded-t-2xl sm:rounded-2xl shadow-2xl animate-slide-up max-h-[95vh] flex flex-col`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#21272f] flex-shrink-0">
          <h2 className="font-display font-bold text-lg text-white">{title}</h2>
          <button onClick={onClose} className="text-[#8b95a1] hover:text-white transition-colors p-1">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
