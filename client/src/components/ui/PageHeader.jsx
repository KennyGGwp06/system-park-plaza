export function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        {eyebrow ? <p className="text-xs font-bold uppercase tracking-wide text-park-gold">{eyebrow}</p> : null}
        <h1 className="font-display text-[28px] font-semibold leading-tight text-park-dark">{title}</h1>
        {description ? <p className="mt-2 max-w-3xl text-sm text-park-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
