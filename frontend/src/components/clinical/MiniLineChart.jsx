export function MiniLineChart({ data, color = "#43AA8B" }) {
  const width = 520;
  const height = 170;
  const padding = 18;
  const values = data.map((point) => point.value);
  const min = Math.min(...values) - 4;
  const max = Math.max(...values) + 4;
  const span = Math.max(1, max - min);
  const points = data
    .map((point, index) => {
      const x = padding + (index / Math.max(1, data.length - 1)) * (width - padding * 2);
      const y = height - padding - ((point.value - min) / span) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full" role="img" aria-label="Trend chart">
        <line x1={padding} x2={width - padding} y1={height - padding} y2={height - padding} stroke="#E2E8F0" />
        <line x1={padding} x2={padding} y1={padding} y2={height - padding} stroke="#E2E8F0" />
        <polyline points={points} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {data.map((point, index) => {
          const x = padding + (index / Math.max(1, data.length - 1)) * (width - padding * 2);
          const y = height - padding - ((point.value - min) / span) * (height - padding * 2);
          return <circle key={point.label} cx={x} cy={y} r="5" fill="#FFFFFF" stroke={color} strokeWidth="3" />;
        })}
      </svg>
      <div className="mt-1 flex justify-between text-xs font-medium text-rehab-muted">
        {data.map((point) => (
          <span key={point.label}>{point.label}</span>
        ))}
      </div>
    </div>
  );
}

