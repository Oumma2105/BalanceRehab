import { useEffect } from "react";
import { CheckCircle2, X } from "lucide-react";

export function Toast({ message, onDismiss }) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onDismiss, 3500);
    return () => clearTimeout(timer);
    // onDismiss intentionally excluded — re-renders rotate the reference every 250ms
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message]);

  if (!message) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl border border-emerald-200 bg-white px-4 py-3 shadow-clinical transition-all duration-200">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-100 text-emerald-700">
        <CheckCircle2 size={16} />
      </span>
      <p className="text-sm font-semibold text-rehab-ink">{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="ml-1 rounded-md p-1 text-rehab-muted transition hover:bg-slate-50 hover:text-rehab-ink"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}
