const toneClasses = {
  connected: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  demo: "bg-teal-50 text-teal-700 ring-teal-600/20",
  active: "bg-sky-50 text-sky-700 ring-sky-600/20",
  warning: "bg-amber-50 text-amber-700 ring-amber-600/25",
  danger: "bg-rose-50 text-rose-700 ring-rose-600/25",
  neutral: "bg-slate-100 text-slate-600 ring-slate-500/15",
};

export function StatusBadge({ children, tone = "neutral", dot = true }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${toneClasses[tone]}`}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}
