export function Button({ children, variant = "primary", className = "", ...props }) {
  const variants = {
    primary: "bg-rehab-teal text-white hover:bg-[#378f76]",
    secondary: "border border-rehab-line bg-white text-rehab-ink hover:bg-slate-50",
    subtle: "bg-slate-100 text-slate-700 hover:bg-slate-200",
    danger: "bg-rehab-red text-white hover:bg-[#d9383b]",
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

