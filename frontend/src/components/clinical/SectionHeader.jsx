export function SectionHeader({ eyebrow, title, description, action }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-wide text-rehab-teal">{eyebrow}</p>
        ) : null}
        <h2 className="text-lg font-semibold text-rehab-ink">{title}</h2>
        {description ? <p className="mt-1 text-sm text-rehab-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

