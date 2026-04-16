export function Badge({ label, color = "default", size = "sm" }) {
  const map = {
    default:  "bg-[#e4e4e7] text-[#52525b] dark:bg-[#21272f] dark:text-[#8b95a1]",
    lime:     "bg-[#c8f230]/25 text-[#5a6e00] border border-[#c8f230]/50",
    ok:       "bg-[#00c096]/20 text-[#007a60] border border-[#00c096]/40",
    warn:     "bg-[#ffab00]/20 text-[#8a5a00] border border-[#ffab00]/40",
    danger:   "bg-[#ff4d4f]/20 text-[#c00002] border border-[#ff4d4f]/40",
    blue:     "bg-[#3b82f6]/20 text-[#1d4ed8] border border-[#3b82f6]/40",
    purple:   "bg-purple-500/20 text-purple-700 border border-purple-500/40",
    pending:  "bg-[#ffab00]/20 text-[#8a5a00] border border-[#ffab00]/40",
  };

  // Auto-map common status strings to the right color
  const autoColor = (raw) => {
    const s = String(raw).toLowerCase();
    if (s === "pending")     return "pending";
    if (s === "completed")   return "ok";
    if (s === "in_progress") return "blue";
    if (s === "overdue")     return "danger";
    if (s === "cancelled")   return "default";
    return color;
  };

  const resolvedColor = autoColor(label);
  const sz = size === "xs" ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-0.5";

  return (
    <span className={`inline-flex items-center rounded-full font-medium capitalize ${sz} ${map[resolvedColor] ?? map.default}`}>
      {String(label).replace(/_/g, " ")}
    </span>
  );
}