export function MetricCard({ label, value, hint, icon: Icon, tone = "green" }) {
  const toneClass = tone === "gold" ? "bg-park-gold-soft text-park-gold" : tone === "red" ? "bg-park-danger-soft text-park-danger" : "bg-park-green-soft text-park-green";
  return (
    <article className="rounded-card border border-park-border bg-white p-5 shadow-card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-body text-sm font-medium text-park-muted">{label}</p>
          <strong className="mt-3 block font-display text-[28px] font-semibold text-park-dark">{value}</strong>
          <span className="mt-1 block text-xs font-semibold text-park-muted">{hint}</span>
        </div>
        {Icon ? (
          <div className={`grid h-12 w-12 place-items-center rounded-full ${toneClass}`}>
            <Icon size={22} />
          </div>
        ) : null}
      </div>
    </article>
  );
}
