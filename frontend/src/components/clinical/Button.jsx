export function Button({ children, variant = "primary", className = "", ...props }) {
  const variants = {
    primary:
      "bg-gradient-to-b from-[#4cb798] to-[#3a9c7e] text-white shadow-sm shadow-teal-900/20 hover:from-[#43aa8b] hover:to-[#33906f] active:translate-y-px",
    secondary: "border border-rehab-line bg-white text-rehab-ink shadow-sm hover:border-slate-300 hover:bg-slate-50",
    subtle: "bg-slate-100 text-slate-700 hover:bg-slate-200",
    danger:
      "bg-gradient-to-b from-[#fa5457] to-[#e63b3e] text-white shadow-sm shadow-rose-900/20 hover:from-[#f94144] hover:to-[#d9383b] active:translate-y-px",
  };

  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
