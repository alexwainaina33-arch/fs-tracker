export function StatCard({ icon: Icon, label, value, sub, accent = "lime", onClick }) {
  const accents = {
    lime:   "text-[#5a6e00] bg-[#c8f230]/30 border-[#c8f230]/50",
    ok:     "text-[#007a60] bg-[#00c096]/25 border-[#00c096]/50",
    warn:   "text-[#8a5a00] bg-[#ffab00]/25 border-[#ffab00]/50",
    danger: "text-[#c00002] bg-[#ff4d4f]/25 border-[#ff4d4f]/50",
    blue:   "text-[#1d4ed8] bg-[#3b82f6]/25 border-[#3b82f6]/50",
  };

  // Dark mode icon colors
  const accentsDark = {
    lime:   "dark:text-[#c8f230] dark:bg-[#c8f230]/20 dark:border-[#c8f230]/40",
    ok:     "dark:text-[#00c096] dark:bg-[#00c096]/20 dark:border-[#00c096]/40",
    warn:   "dark:text-[#ffab00] dark:bg-[#ffab00]/20 dark:border-[#ffab00]/40",
    danger: "dark:text-[#ff4d4f] dark:bg-[#ff4d4f]/20 dark:border-[#ff4d4f]/40",
    blue:   "dark:text-[#3b82f6] dark:bg-[#3b82f6]/20 dark:border-[#3b82f6]/40",
  };

  return (
    <div onClick={onClick}
      className={`bg-[#111418] border border-[#21272f] rounded-2xl p-5 card-lift ${onClick ? "cursor-pointer" : ""}`}>
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-medium text-[#8b95a1] uppercase tracking-wider">{label}</p>
        <div className={`w-9 h-9 rounded-xl border flex items-center justify-center flex-shrink-0 ${accents[accent]} ${accentsDark[accent]}`}>
          <Icon size={17} />
        </div>
      </div>
      <p className="font-display font-bold text-3xl text-white leading-none">{value ?? "—"}</p>
      {sub && <p className="text-xs text-[#8b95a1] mt-1.5">{sub}</p>}
    </div>
  );
}