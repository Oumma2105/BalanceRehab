export function ClinicalTable({ columns, rows, renderRow }) {
  return (
    <div className="overflow-hidden rounded-lg border border-rehab-line">
      <table className="min-w-full divide-y divide-rehab-line text-sm">
        <thead className="bg-slate-50">
          <tr>
            {columns.map((column) => (
              <th
                key={column}
                scope="col"
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-rehab-muted"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-rehab-line bg-white">{rows.map(renderRow)}</tbody>
      </table>
    </div>
  );
}

