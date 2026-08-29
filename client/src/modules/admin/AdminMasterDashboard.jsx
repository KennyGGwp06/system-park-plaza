import { Link } from "react-router-dom";
import { 
  PackageSearch, ShoppingCart, ChefHat, Menu, ArrowRightLeft, 
  Activity, Wine, Waves, Trash2, LockKeyhole, AlertTriangle, TriangleAlert,
  Users, ShieldCheck, LayoutDashboard, Wallet, CalendarDays, 
  UserCheck, Receipt, DollarSign, Bed, CalendarCheck, Clock, 
  CheckSquare
} from "lucide-react";
import { PageHeader } from "../../components/ui";
import { useFetch } from "../../hooks/useFetch";

const MODULES = [
  {
    title: "Recepción y Reservas",
    subtitle: "Flujo de huéspedes y espacios",
    color: "from-blue-600/20 to-cyan-600/10",
    border: "border-blue-500/30",
    icon: <Bed className="text-blue-400 mb-2" size={28} />,
    items: [
      { name: "Check-In / Out", desc: "Ingreso de huéspedes", icon: UserCheck, href: "/recepcion" },
      { name: "Calendario", desc: "Ocupación y reservas", icon: CalendarDays, href: "/habitaciones" },
      { name: "Eventos", desc: "Espacios sociales", icon: CalendarCheck, href: "/eventos/calendario" },
      { name: "Base de Clientes", desc: "Historial de huéspedes", icon: Users, href: "/clientes" }
    ]
  },
  {
    title: "Alimentos y Bebidas",
    subtitle: "Restaurante y Bar",
    color: "from-orange-600/20 to-amber-600/10",
    border: "border-orange-500/30",
    icon: <ChefHat className="text-orange-400 mb-2" size={28} />,
    items: [
      { name: "Monitor Restaurante", desc: "Pedidos en tiempo real", icon: Activity, href: "/control-gastronomico/restaurante" },
      { name: "Monitor Bar", desc: "Cola de bebidas", icon: Wine, href: "/control-gastronomico/bar" },
      { name: "Terminal POS", desc: "Venta directa", icon: ShoppingCart, href: "/consumos" },
      { name: "Recetas", desc: "Fichas técnicas", icon: Menu, href: "/inventario/recetas" }
    ]
  },
  {
    title: "Logística e Inventario",
    subtitle: "Almacenes y existencias",
    color: "from-emerald-600/20 to-green-600/10",
    border: "border-emerald-500/30",
    icon: <PackageSearch className="text-emerald-400 mb-2" size={28} />,
    items: [
      { name: "Catálogo Maestro", desc: "Productos base", icon: PackageSearch, href: "/inventario/catalogo" },
      { name: "Transferencias", desc: "Movimiento de almacén", icon: ArrowRightLeft, href: "/transferencias" },
      { name: "Mermas", desc: "Desperdicios diarios", icon: Trash2, href: "/restaurante/inventario/mermas" },
      { name: "Dashboard Inventario", desc: "Alertas de stock", icon: AlertTriangle, href: "/admin/inventario" },
      { name: "Integridad de datos", desc: "Saneamiento seguro", icon: TriangleAlert, href: "/admin/integridad" }
    ]
  },
  {
    title: "Recursos Humanos",
    subtitle: "Personal y Tareas",
    color: "from-purple-600/20 to-fuchsia-600/10",
    border: "border-purple-500/30",
    icon: <Users className="text-purple-400 mb-2" size={28} />,
    items: [
      { name: "Asistencia y Turnos", desc: "Control de reloj", icon: Clock, href: "/empleados" },
      { name: "Tareas y Conserjería", desc: "Limpieza y soporte", icon: CheckSquare, href: "/admin/limpieza/resumen" },
      { name: "Gestión de Roles", desc: "Accesos del personal", icon: ShieldCheck, href: "/roles" },
      { name: "Directorio", desc: "Usuarios del sistema", icon: Users, href: "/usuarios" }
    ]
  },
  {
    title: "Finanzas y Reportes",
    subtitle: "Caja, pagos y analítica",
    color: "from-emerald-500/20 to-teal-700/10",
    border: "border-teal-500/30",
    icon: <Wallet className="text-teal-400 mb-2" size={28} />,
    items: [
      { name: "Caja Centralizada", desc: "Monitor de ingresos", icon: DollarSign, href: "/admin-panel/caja-central" },
      { name: "Facturación", desc: "Emisión de boletas", icon: Receipt, href: "/pagos" },
      { name: "Cierres de Turno", desc: "Cuadre y auditoría", icon: LockKeyhole, href: "/restaurante/inventario/cierre" },
      { name: "Dashboard Global", desc: "Métricas del hotel", icon: LayoutDashboard, href: "/dashboard" }
    ]
  }
];

export function AdminMasterDashboard() {
  const { data: dashboard = { modules: { orders: [], cleaning: [] }, lowStockProducts: [], metrics: {} } } = useFetch("/dashboard", { initialData: { modules: { orders: [], cleaning: [] }, lowStockProducts: [], metrics: {} }, cacheTime: 30000, realtime: true });
  const activeOrders = dashboard.modules?.orders || [];
  return (
    <div className="space-y-8 pb-12">
      <div className="bg-gradient-to-r from-park-dark to-slate-900 rounded-2xl p-8 shadow-2xl border border-white/5 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <LayoutDashboard size={120} />
        </div>
        <div className="relative z-10">
          <h1 className="text-3xl font-black text-white mb-2 tracking-tight">Omni-Admin Dashboard</h1>
          <p className="text-slate-300 max-w-xl">
            Centro de control unificado. Monitorea y gestiona todos los pilares del hotel desde una interfaz centralizada y estructurada.
          </p>
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <AdminMetric label="Pedidos activos" value={activeOrders.length} help={`${activeOrders.filter((item) => item.status === "LISTO").length} listos para entregar`} tone="blue"/>
        <AdminMetric label="Huéspedes alojados" value={dashboard.metrics?.hostedGuests || 0} help="Con estancia activa" tone="green"/>
        <AdminMetric label="Alertas abiertas" value={dashboard.metrics?.incidentsOpen || 0} help="Incidencias por atender" tone={dashboard.metrics?.incidentsOpen ? "amber" : "green"}/>
        <AdminMetric label="Limpiezas activas" value={(dashboard.modules?.cleaning || []).length} help="Habitaciones aún no liberadas" tone="violet"/>
        <AdminMetric label="Stock crítico" value={(dashboard.lowStockProducts || []).length} help="Productos bajo mínimo" tone={(dashboard.lowStockProducts || []).length ? "red" : "green"}/>
      </section>
      
      <div className="grid gap-6 xl:grid-cols-2">
        {MODULES.map((module, idx) => (
          <section key={idx} className={`relative overflow-hidden rounded-2xl border ${module.border} bg-gradient-to-br ${module.color} p-6 shadow-lg backdrop-blur-sm transition-all hover:shadow-xl`}>
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-10 -mt-10 blur-2xl pointer-events-none"></div>
            
            <div className="flex items-center gap-4 mb-6 border-b border-white/10 pb-4">
              <div className="p-3 bg-slate-900/50 rounded-xl border border-white/5 shadow-inner">
                {module.icon}
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-100">{module.title}</h2>
                <p className="text-sm text-slate-400">{module.subtitle}</p>
              </div>
            </div>
            
            <div className="grid gap-4 sm:grid-cols-2">
              {module.items.map((item, i) => {
                const Icon = item.icon;
                return (
                  <Link 
                    key={i} 
                    to={item.href} 
                    className="group flex flex-col justify-between rounded-xl border border-white/10 bg-slate-900/40 p-4 shadow-sm transition-all hover:-translate-y-1 hover:border-park-gold/50 hover:bg-slate-800/60"
                  >
                    <div className="flex items-start justify-between">
                      <div className="rounded-lg bg-slate-800/50 p-2.5 text-slate-300 group-hover:bg-park-gold/20 group-hover:text-park-gold transition-colors">
                        <Icon size={22} strokeWidth={2.5} />
                      </div>
                    </div>
                    <div className="mt-4">
                      <h3 className="font-bold text-slate-200 group-hover:text-white transition-colors">{item.name}</h3>
                      <p className="text-xs text-slate-400 mt-1">{item.desc}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function AdminMetric({ label, value, help, tone }) {
  const colors={blue:"border-blue-200 bg-blue-50 text-blue-700",green:"border-emerald-200 bg-emerald-50 text-emerald-700",amber:"border-amber-200 bg-amber-50 text-amber-700",violet:"border-violet-200 bg-violet-50 text-violet-700",red:"border-red-200 bg-red-50 text-red-700"};
  return <article className={`rounded-2xl border p-4 shadow-sm ${colors[tone]||colors.blue}`}><p className="text-3xl font-black">{value}</p><h2 className="mt-1 text-sm font-black">{label}</h2><p className="mt-1 text-xs opacity-75">{help}</p></article>;
}
