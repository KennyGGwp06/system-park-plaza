import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, BedDouble, CalendarCheck, ChefHat, CircleDollarSign, LayoutDashboard, ShieldCheck, Users, Waves, Boxes, DollarSign, Sparkles } from "lucide-react";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { useFetch } from "../../hooks/useFetch";

const superAdminGroups = [
  { title: "Centro Superadmin", description: "Resumen integral y métricas en vivo.", icon: LayoutDashboard, tone: "blue", items: [["Alertas", "/incidencias"], ["Pagos pendientes", "/pagos"]] },
  { title: "Experiencia y publicación", description: "Precios, tarifas y accesos para el cliente final.", icon: CircleDollarSign, tone: "amber", items: [["Precios y tarifas", "/admin/comercial"], ["Habitaciones", "/habitaciones"], ["Piscina y mirador", "/piscina/ingresos"], ["Eventos", "/eventos/reservas"]] },
  { title: "Operación hotelera", description: "Lectura transversal de reservas, habitaciones y limpieza.", icon: Sparkles, tone: "blue", items: [["Reservas", "/reservas"], ["Recepción en vivo", "/recepcion"], ["Supervisión limpieza", "/admin/limpieza/resumen"], ["Mantenimiento", "/incidencias"]] },
  { title: "Control gastronómico", description: "Monitor de restaurante vs bar y carta.", icon: ChefHat, tone: "green", items: [["Monitor · Restaurante", "/admin/restaurante/pedidos"], ["Monitor · Bar", "/admin/bartender/pedidos"], ["Carta e Insumos", "/admin/alimentos-bebidas"], ["Transferencias", "/transferencias"]] },
  { title: "Inventario y abastecimiento", description: "Gestión centralizada del stock y producción.", icon: Boxes, tone: "green", items: [["Inventario central", "/admin/inventario"], ["Compras", "/compras"], ["Producción", "/inventario/produccion"], ["Cierres", "/inventario/turnos"]] },
  { title: "Finanzas y control", description: "Control de sesiones de caja y reportes financieros.", icon: DollarSign, tone: "violet", items: [["Caja central", "/admin-panel/caja-central"], ["Personal activo", "/empleados"], ["Turnos de personal", "/turnos"], ["Reportes", "/reportes"]] },
  { title: "Gobierno y seguridad", description: "Usuarios, auditoría e integridad de datos.", icon: ShieldCheck, tone: "violet", items: [["Usuarios y permisos", "/usuarios"], ["Roles y permisos", "/roles"], ["Auditoría y seguridad", "/auditoria"], ["Configuración global", "/configuracion"]] }
];

export function SuperAdminControlPage() {
  const { data, loading, error } = useFetch("/dashboard", { initialData: { metrics: {}, modules: { orders: [], cleaning: [] }, lowStockProducts: [] }, cacheTime: 15000, realtime: true, pollInterval: 15000 });

  if (loading) return <LoadingSpinner/>;
  if (error) {
    return (
      <div className="rounded-card border border-red-200 bg-red-50 p-5 text-red-700">
        No se pudo actualizar el centro de control: {error.message}
      </div>
    );
  }

  const metrics = data.metrics || {}; 
  const stock = data.lowStockProducts || [];
  
  const alerts = [
    { label: "Pedidos atrasados", value: metrics.delayedOrders || 0, href: "/admin/restaurante/resumen", urgent: metrics.delayedOrders > 0, origin: "Actualización automática" },
    { label: "Pagos pendientes", value: metrics.pendingPayments || 0, href: "/pagos", urgent: metrics.pendingPayments > 0, origin: "Actualización automática" },
    { label: "Incidencias abiertas", value: metrics.incidentsOpen || 0, href: "/incidencias", urgent: metrics.incidentsOpen > 0, origin: "Actualización automática" },
    { label: "Stock crítico", value: stock.length, href: "/admin/inventario", urgent: stock.length > 0, origin: "Actualización automática" }
  ];

  return (
    <div className="reception-command space-y-6 pb-10">
      <section className="reception-status">
        <strong>Conectado al ERP</strong>
        <span>Clientes, reservas, pagos, accesos, pedidos, solicitudes, inventario y eventos se actualizan automáticamente.</span>
      </section>
      
      <section className="reception-hero">
        <div>
          <p>SUPERADMIN · CONTROL TOTAL</p>
          <h1>Centro Superadmin</h1>
          <span>Vista ejecutiva transversal de todos los módulos, dependencias y gobierno del sistema.</span>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Disponibles" value={metrics.availableRooms || 0} help="Habitaciones libres" tone="green" icon={BedDouble}/>
        <Metric label="Ocupadas" value={metrics.occupiedRooms || 0} help="Ocupación actual" tone="violet" icon={BedDouble}/>
        <Metric label="Llegadas" value={metrics.arrivalsToday || 0} help="Llegadas de hoy" tone="blue" icon={CalendarCheck}/>
        <Metric label="Ingresos Efectivo" value={money(metrics.cashToday)} help="Ingreso diario" tone="amber" icon={CircleDollarSign}/>
        <Metric label="Alertas" value={(metrics.incidentsOpen || 0)} help="Mantenimiento" tone="slate" icon={AlertTriangle}/>
      </section>

      <section className="rounded-card border border-park-border bg-white p-5 shadow-card">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black text-park-dark">Alertas críticas</h2>
            <p className="text-sm text-park-muted">Requieren intervención de los responsables de área.</p>
          </div>
          <AlertTriangle className="text-amber-500"/>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {alerts.map((item)=>(
            <Link className={`flex items-center justify-between rounded-xl border p-4 ${item.urgent ? "border-amber-200 bg-amber-50" : "border-park-border bg-park-bg"}`} to={item.href} key={item.label}>
              <div>
                <strong className="block text-2xl text-park-dark">{item.value}</strong>
                <span className="text-sm font-bold text-park-muted">{item.label}</span>
                <span className="text-xs text-park-muted/70 block mt-1">{item.origin}</span>
              </div>
              <ArrowRight size={18} className={item.urgent ? "text-amber-600" : "text-park-muted"}/>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3">
          <p className="text-xs font-black uppercase tracking-[.16em] text-blue-600">Gobierno del Sistema</p>
          <h2 className="text-xl font-black text-park-dark">Módulos de administración</h2>
          <p className="text-sm text-park-muted">Control completo sobre operaciones y parámetros del hotel.</p>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {superAdminGroups.map((group) => <ModuleGroup group={group} key={group.title}/>)}
        </div>
      </section>
    </div>
  );
}

function ModuleGroup({ group }) { 
  const Icon = group.icon; 
  const tones = {
    blue:"bg-blue-50 text-blue-700",
    amber:"bg-amber-50 text-amber-700",
    green:"bg-emerald-50 text-emerald-700",
    violet:"bg-violet-50 text-violet-700"
  }; 
  return (
    <article className="rounded-card border border-park-border bg-white p-5 shadow-card flex flex-col">
      <div className="flex items-start gap-3">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tones[group.tone]}`}>
          <Icon size={22}/>
        </span>
        <div>
          <h3 className="font-black text-park-dark">{group.title}</h3>
          <p className="text-sm text-park-muted">{group.description}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 grow content-start">
        {group.items.map(([label, href]) => (
          <Link className="flex items-center justify-between rounded-xl border border-park-border bg-park-bg px-4 py-3 text-sm font-black text-park-dark hover:border-blue-300 hover:bg-blue-50 transition-colors" to={href} key={href}>
            {label}
            <ArrowRight size={16}/>
          </Link>
        ))}
      </div>
    </article>
  ); 
}

function Metric({ label, value, help, tone, icon: Icon }) { 
  const colors = {
    blue:"bg-blue-50 text-blue-700",
    green:"bg-emerald-50 text-emerald-700",
    violet:"bg-violet-50 text-violet-700",
    amber:"bg-amber-50 text-amber-700",
    cyan:"bg-cyan-50 text-cyan-700",
    slate:"bg-slate-100 text-slate-700"
  }; 
  return (
    <article className="rounded-card border border-park-border bg-white p-4 shadow-card">
      <span className={`grid h-9 w-9 place-items-center rounded-lg ${colors[tone]}`}>
        <Icon size={18}/>
      </span>
      <strong className="mt-3 block text-2xl text-park-dark">{value}</strong>
      <p className="text-sm font-black text-park-dark">{label}</p>
      <small className="text-park-muted leading-tight block mt-1">{help}</small>
    </article>
  ); 
}

function money(value) { 
  return `S/ ${Number(value || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; 
}
