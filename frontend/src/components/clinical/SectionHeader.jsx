export function SectionHeader({ eyebrow, title, description, action }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 h-9 w-1 shrink-0 rounded-full bg-gradient-to-b from-rehab-teal to-rehab-blue" aria-hidden />
        <div>
          {eyebrow ? (
            <p className="text-[11px] font-bold uppercase tracking-kicker text-rehab-teal">{eyebrow}</p>
          ) : null}
          <h2 className="text-lg font-bold tracking-tight text-rehab-ink">{title}</h2>
          {description ? <p className="mt-1 text-sm leading-5 text-rehab-muted">{description}</p> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
