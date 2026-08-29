import { Link, useSearchParams } from "react-router-dom";
import { Construction, ArrowLeft } from "lucide-react";
import { Button, PageHeader } from "../../components/ui";

const details = {
  encuestas: "Permitirá enviar encuestas post-estadía y medir lealtad. Aún falta crear sus tablas, API y flujo del cliente.",
  configuracion: "Reunirá los parámetros generales del hotel. Hoy las tarifas comerciales están disponibles en su módulo real; faltan los demás parámetros configurables."
};

export function SuperAdminPendingPage() {
  const [params] = useSearchParams();
  const module = String(params.get("modulo") || "módulo").toLowerCase();
  const title = module.charAt(0).toUpperCase() + module.slice(1);
  return <div className="mx-auto max-w-3xl space-y-5 pb-10">
    <PageHeader eyebrow="Superadmin / prototipo V6" title={title} description="Módulo previsto en la estructura del Superadmin." />
    <section className="rounded-card border border-amber-200 bg-amber-50 p-6 shadow-card">
      <div className="flex gap-4"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700"><Construction size={24} /></span><div><h2 className="font-black text-park-dark">Pendiente de conexión real</h2><p className="mt-2 text-sm leading-6 text-park-muted">{details[module] || "Este módulo será creado cuando se defina su operación y sus datos."}</p><p className="mt-3 text-sm font-semibold text-park-dark">No se simulan datos ni acciones: se integrará con API y PostgreSQL antes de habilitarlo.</p></div></div>
    </section>
    <Button as={Link} to="/superadmin" variant="secondary" icon={ArrowLeft}>Volver al Superadmin</Button>
  </div>;
}
