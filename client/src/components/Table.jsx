import { EmptyState } from "./EmptyState";

export function Table({ columns, rows, renderRow }) {
  if (!rows?.length) {
    return <EmptyState />;
  }

  return (
    <div className="max-w-full overflow-x-auto rounded-card border border-park-border/50 bg-white shadow-card shadow-sm transition-shadow hover:shadow-md">
      <table className="min-w-full text-left font-body text-sm">
        <thead className="bg-park-bg border-b border-park-border text-xs uppercase text-park-muted tracking-wider">
          <tr>
            {columns.map((column) => (
              <th className="px-4 py-3 font-black text-park-dark" key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-park-border/50 [&>tr]:transition-colors [&>tr]:duration-200 hover:[&>tr]:bg-slate-50/50">
          {rows.map(renderRow)}
        </tbody>
      </table>
    </div>
  );
}

