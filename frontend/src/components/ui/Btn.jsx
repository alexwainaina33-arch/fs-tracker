export function Btn({ children, onClick, disabled, variant = "primary", size = "md", className = "", type = "button" }) {
  const base  = "inline-flex items-center justify-center gap-2 font-medium rounded-xl transition-all duration-150 select-none";
  const sizes = { sm: "text-xs px-3 py-1.5", md: "text-sm px-4 py-2.5", lg: "text-sm px-6 py-3.5" };
  const variants = {
    primary: "bg-[#c8f230] text-[#0a0d0f] hover:bg-[#d9ff50] active:scale-95 disabled:opacity-40",
    ghost:   "bg-[#21272f] text-[#c2cad4] hover:bg-[#2a3040] active:scale-95 disabled:opacity-40",
    danger:  "bg-[#ff4d4f]/15 text-[#ff4d4f] border border-[#ff4d4f]/30 hover:bg-[#ff4d4f]/25 active:scale-95 disabled:opacity-40",
    outline: "border border-[#21272f] text-[#8b95a1] hover:border-[#c8f230] hover:text-[#c8f230] active:scale-95 disabled:opacity-40",
    ok:      "bg-[#00c096]/15 text-[#00c096] border border-[#00c096]/30 hover:bg-[#00c096]/25 active:scale-95 disabled:opacity-40",
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
}
