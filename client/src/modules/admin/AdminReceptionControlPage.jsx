import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, BedDouble, CalendarCheck, ChefHat, CircleDollarSign, ClipboardCheck, Users, Waves, ShieldCheck, Receipt, Wrench, Boxes } from "lucide-react";
import { Button } from "../../components/ui";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { StatusBadge } from "../../components/StatusBadge";
import { useAuth } from "../../context/AuthContext";
import { useFetch } from "../../hooks/useFetch";

const adminGroups = [
  { 
    title: "1. Centro Admin de recepción", 
    description: "Operación global del hotel.", 
    icon: ShieldCheck, tone: "violet", 
    items: [["Resumen operativo", "/recepcion"], ["Alertas y prioridades", "/incidencias"]] 
  },
  { 
    title: "2. Atención y caja", 
    description: "Responsabilidad directa con el huésped y el efectivo.", 
    icon: BedDouble, tone: "blue", 
    items: [["Reservas y huéspedes", "/reservas"], ["Llegadas y salidas", "/checkin"], ["Clientes", "/clientes"], ["Mi caja y cierre de turno", "/admin-panel/mi-caja"]] 
  },
  { 
    title: "3. Servicios y accesos", 
    description: "Habilitación de servicios pagados.", 
    icon: Waves, tone: "amber", 
    items: [["Validación de pago", "/pagos"], ["Servicios contratados", "/eventos/reservas"], ["Accesos de clientes", "/accesos"]] 
  },
  { 
    title: "4. Coordinación hotelera", 
    description: "Pedidos, limpieza y soporte a infraestructura.", 
    icon: Wrench, tone: "slate", 
    items: [["Pedidos de clientes", "/consumos"], ["Habitaciones y evidencias", "/admin/limpieza/resumen"], ["Incidencias y mantenimiento", "/incidencias"], ["Cochera", "/cochera"]] 
  },
  { 
    title: "5. Coordinación de personal", 
    description: "Vigilar quién está trabajando.", 
    icon: Users, tone: "blue", 
    items: [["Turnos asignados", "/turnos"], ["Personal activo", "/empleados"], ["Solicitudes operativas", "/operaciones"]] 
  },
  { 
    title: "6. Supervisión gastronómica", 
    description: "Solo lectura. Las áreas operan solas, tú supervisas.", 
    icon: ChefHat, tone: "green", 
    items: [["Pedidos de Restaurante", "/admin/restaurante/pedidos"], ["Pedidos de Bar", "/admin/bartender/pedidos"]] 
  }
];

export function AdminReceptionControlPage() {
  const { user } = useAuth();
  
  const { data: dashData, loading: dashLoading, error: dashError } = useFetch("/dashboard", { 
    initialData: { metrics: {}, modules: { orders: [], cleaning: [] }, lowStockProducts: [] }, 
    cacheTime: 15000, 
    realtime: true,
    pollInterval: 15000
  });

  if (dashLoading && !dashData?.metrics) return <LoadingSpinner />;
  
  if (dashError) {
    return <div className="rounded-card border border-red-200 bg-red-50 p-5 text-red-700 font-bold shadow-sm">
      Error crítico: No se pudo conectar al ERP ({dashError.message}).
    </div>;
  }

  const metrics = dashData.metrics || {};
  const orders = dashData.modules?.orders || [];
  const cleaning = dashData.modules?.cleaning || [];
  const alerts = [
    { label: "Pedidos atrasados", value: metrics.delayedOrders || 0, href: "/admin/restaurante/resumen", urgent: metrics.delayedOrders > 0, origin: "Tiempo real" },
    { label: "Pagos pendientes", value: metrics.pendingPayments || 0, href: "/pagos", urgent: metrics.pendingPayments > 0, origin: "Tiempo real" },
    { label: "Incidencias abiertas", value: metrics.incidentsOpen || 0, href: "/incidencias", urgent: metrics.incidentsHighPriority > 0, origin: "Tiempo real" }
  ];

  return (
    <div className="reception-command space-y-6 pb-10">
      <section className="reception-status">
        <strong>Conectado al ERP</strong>
        <span>Clientes, reservas, pagos, accesos y operaciones se actualizan automáticamente.</span>
      </section>
      
      <section className="reception-hero">
        <div>
          <p className="text-park-gold uppercase tracking-wider text-xs font-black">Admin Recepción · Segundo al mando</p>
          <h1 className="text-3xl font-black mt-1 text-white">Centro de operaciones</h1>
          <span className="text-emerald-100 text-sm">Resumen transversal de atención, caja y coordinación. Rinde cuentas al Superadmin.</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button as={Link} to="/recepcion" icon={ClipboardCheck}>Atender recepción</Button>
          <Button as={Link} to="/reservas?nueva=1" variant="gold">Nueva reserva</Button>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Metric label="Disponibles" value={metrics.availableRooms || 0} help="Habitaciones libres" tone="green" icon={BedDouble} />
        <Metric label="Ocupadas" value={metrics.occupiedRooms || 0} help="Ocupación actual" tone="violet" icon={BedDouble} />
        <Metric label="Llegadas" value={metrics.arrivalsToday || 0} help="Reservas confirmadas" tone="blue" icon={CalendarCheck} />
        <Metric label="Ingresos" value={money(metrics.incomeToday)} help="Efectivo de hoy" tone="amber" icon={CircleDollarSign} />
        <Metric label="Pedidos" value={orders.length} help={`${metrics.delayedOrders || 0} fuera de tiempo`} tone="cyan" icon={ChefHat} />
        <Metric label="Alertas" value={(metrics.incidentsOpen || 0) + cleaning.length} help="Soporte y evidencias" tone="slate" icon={AlertTriangle} />
      </section>

      <section className="rounded-card border border-park-border bg-white p-5 shadow-card">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black text-park-dark">Atención prioritaria</h2>
            <p className="text-sm text-park-muted">Interviene donde la operación necesita apoyo.</p>
          </div>
          <AlertTriangle className="text-amber-500" />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {alerts.map((item) => (
            <Link className={`flex relative items-center justify-between rounded-xl border p-4 ${item.urgent ? "border-amber-200 bg-amber-50 hover:bg-amber-100" : "border-park-border bg-park-bg hover:bg-gray-100"}`} to={item.href} key={item.label}>
              <div>
                <span className="absolute top-2 right-2 text-[10px] font-bold text-park-muted uppercase tracking-wider">{item.origin}</span>
                <strong className="block text-2xl text-park-dark">{item.value}</strong>
                <span className="text-sm font-bold text-park-muted">{item.label}</span>
              </div>
              <ArrowRight size={18} className={item.urgent ? "text-amber-600" : "text-park-muted"} />
            </Link>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3">
          <p className="text-xs font-black uppercase tracking-[.16em] text-blue-600">Módulos de responsabilidad</p>
          <h2 className="text-xl font-black text-park-dark">Tu estación de control</h2>
          <p className="text-sm text-park-muted">Dirige la operación diaria. La configuración global y cierres contables son exclusivos del Superadmin.</p>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {adminGroups.map((group) => <ModuleGroup group={group} key={group.title} />)}
        </div>
      </section>
    </div>
  );
}

function ModuleGroup({ group }) { 
  const Icon = group.icon; 
  const tones = {
    blue: "bg-blue-50 text-blue-700 hover:border-blue-300",
    amber: "bg-amber-50 text-amber-700 hover:border-amber-300",
    green: "bg-emerald-50 text-emerald-700 hover:border-emerald-300",
    violet: "bg-violet-50 text-violet-700 hover:border-violet-300",
    slate: "bg-slate-100 text-slate-700 hover:border-slate-300"
  }; 
  
  return (
    <article className="rounded-card border border-park-border bg-white p-5 shadow-card transition-all hover:shadow-md">
      <div className="flex items-start gap-3">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tones[group.tone].split(' ')[0]} ${tones[group.tone].split(' ')[1]}`}>
          <Icon size={22} />
        </span>
        <div>
          <h3 className="font-black text-park-dark">{group.title}</h3>
          <p className="text-sm text-park-muted">{group.description}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {group.items.map(([label, href]) => (
          <Link className="flex items-center justify-between rounded-xl border border-park-border bg-park-bg px-4 py-3 text-sm font-black text-park-dark hover:border-blue-300 hover:bg-blue-50 transition-colors" to={href} key={label}>
            {label}
            <ArrowRight size={16} />
          </Link>
        ))}
      </div>
    </article>
  ); 
}

function Metric({ label, value, help, tone, icon: Icon }) { 
  const colors = {
    blue: "bg-blue-50 text-blue-700",
    green: "bg-emerald-50 text-emerald-700",
    violet: "bg-violet-50 text-violet-700",
    amber: "bg-amber-50 text-amber-700",
    cyan: "bg-cyan-50 text-cyan-700",
    slate: "bg-slate-100 text-slate-700"
  }; 
  return (
    <article className="rounded-card border border-park-border bg-white p-4 shadow-card hover:-translate-y-0.5 transition-transform">
      <span className={`grid h-9 w-9 place-items-center rounded-lg ${colors[tone]}`}>
        <Icon size={18} />
      </span>
      <strong className="mt-3 block text-2xl text-park-dark">{value}</strong>
      <p className="text-sm font-black text-park-dark">{label}</p>
      <small className="text-park-muted">{help}</small>
    </article>
  ); 
}

function money(value) { 
  return `S/ ${Number(value || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; 
}
