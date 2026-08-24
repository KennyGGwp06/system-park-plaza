export function LoadingSpinner({ label = "Cargando datos..." }) {
  return (
    <div className="grid min-h-40 place-items-center rounded-panel border border-slate-200 bg-white p-8 text-sm font-semibold text-park-muted">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-100 border-t-park-green" />
      <span className="mt-3">{label}</span>
    </div>
  );
}
