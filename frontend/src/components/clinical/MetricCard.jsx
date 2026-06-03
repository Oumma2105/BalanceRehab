export function MetricCard({ label, value, helper, accent = "#43AA8B", trend }) {
  return (
    <article className="rounded-lg border border-rehab-line bg-white p-4 shadow-clinical">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="h-1.5 w-12 rounded-full" style={{ backgroundColor: accent }} />
        {trend ? <span className="text-xs font-semibold text-rehab-teal">{trend}</span> : null}
      </div>
      <p className="text-sm font-medium text-rehab-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-normal text-rehab-ink">{value}</p>
      {helper ? <p className="mt-2 text-xs leading-5 text-rehab-muted">{helper}</p> : null}
    </article>
  );
}

