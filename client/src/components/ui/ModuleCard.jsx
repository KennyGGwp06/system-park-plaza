import { Link } from "react-router-dom";

export function ModuleCard({ title, description, href, icon: Icon, meta }) {
  return (
    <Link className="group rounded-card border border-park-border bg-white p-5 shadow-card transition hover:-translate-y-0.5 hover:border-park-green" to={href}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-sans text-lg font-semibold text-park-black">{title}</h3>
          {description ? <p className="mt-2 text-sm text-park-muted">{description}</p> : null}
        </div>
        {Icon ? <span className="grid h-10 w-10 place-items-center rounded-card bg-park-green-soft text-park-green"><Icon size={20} /></span> : null}
      </div>
      {meta ? <p className="mt-5 text-xs font-bold uppercase text-park-gold">{meta}</p> : null}
    </Link>
  );
}
