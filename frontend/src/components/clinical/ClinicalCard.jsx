export function ClinicalCard({ children, className = "", tone = "default" }) {
  const tones = {
    default: "border-rehab-line bg-white",
    soft: "border-slate-200 bg-slate-50",
    attention: "border-amber-200 bg-amber-50",
    success: "border-emerald-200 bg-emerald-50",
  };

  return (
    <section className={`rounded-lg border ${tones[tone]} shadow-clinical ${className}`}>
      {children}
    </section>
  );
}

