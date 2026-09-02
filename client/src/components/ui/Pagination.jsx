import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./Button";

export function Pagination({ page, pageCount, total, onPageChange, itemLabel = "resultados" }) {
  if (pageCount <= 1) return null;
  return (
    <nav className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-park-border bg-white p-3" aria-label={`Paginación de ${itemLabel}`}>
      <p className="text-sm text-park-muted"><span className="font-black tabular-nums text-park-dark">{total}</span> {itemLabel} · página <span className="tabular-nums">{page} de {pageCount}</span></p>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" icon={ChevronLeft} disabled={page === 1} onClick={() => onPageChange(page - 1)}>Anterior</Button>
        <Button size="sm" variant="secondary" disabled={page === pageCount} onClick={() => onPageChange(page + 1)}>Siguiente<ChevronRight size={16} aria-hidden="true" /></Button>
      </div>
    </nav>
  );
}
