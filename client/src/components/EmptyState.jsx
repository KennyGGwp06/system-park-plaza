import { Inbox } from "lucide-react";

export function EmptyState({ title = "Sin registros", description = "No hay informacion para mostrar." }) {
  return (
    <div className="grid place-items-center rounded-card border border-dashed border-park-border bg-white p-10 text-center">
      <Inbox className="text-park-muted" />
      <h3 className="mt-3 font-sans text-lg font-semibold text-park-black">{title}</h3>
      <p className="mt-1 text-sm text-park-muted">{description}</p>
    </div>
  );
}
