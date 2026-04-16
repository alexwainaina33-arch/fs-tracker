export function Input({ label, error, className = "", ...props }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-xs font-medium text-[#8b95a1] uppercase tracking-wider">{label}</label>}
      <input {...props}
        className={`w-full bg-[#0a0d0f] border ${error ? "border-[#ff4d4f]" : "border-[#21272f]"} rounded-xl px-4 py-3 text-sm text-white placeholder:text-[#3d4550] outline-none focus:border-[#c8f230] transition-colors ${className}`} />
      {error && <p className="text-xs text-[#ff4d4f]">{error}</p>}
    </div>
  );
}

export function Select({ label, children, className = "", ...props }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-xs font-medium text-[#8b95a1] uppercase tracking-wider">{label}</label>}
      <select {...props}
        className={`w-full bg-[#0a0d0f] border border-[#21272f] rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#c8f230] transition-colors appearance-none ${className}`}>
        {children}
      </select>
    </div>
  );
}

export function Textarea({ label, className = "", ...props }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-xs font-medium text-[#8b95a1] uppercase tracking-wider">{label}</label>}
      <textarea {...props}
        className={`w-full bg-[#0a0d0f] border border-[#21272f] rounded-xl px-4 py-3 text-sm text-white placeholder:text-[#3d4550] outline-none focus:border-[#c8f230] transition-colors resize-none ${className}`} />
    </div>
  );
}
