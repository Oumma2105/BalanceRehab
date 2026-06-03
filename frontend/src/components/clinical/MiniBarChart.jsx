export function MiniBarChart({ data, color = "#43AA8B", max = 100 }) {
  return (
    <div className="flex h-40 items-end gap-2">
      {data.map((item) => (
        <div key={item.label} className="flex flex-1 flex-col items-center gap-2">
          <div className="flex h-28 w-full items-end rounded-md bg-slate-100 px-1">
            <div
              className="w-full rounded-md"
              style={{ height: `${Math.max(8, (item.value / max) * 100)}%`, backgroundColor: item.color ?? color }}
              title={`${item.label}: ${item.value}`}
            />
          </div>
          <span className="text-xs font-medium text-rehab-muted">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

