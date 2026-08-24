export function SectionHeader({ title, description, actions }) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="font-sans text-lg font-semibold text-park-black">{title}</h2>
        {description ? <p className="mt-1 text-sm text-park-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
