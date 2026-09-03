import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { LayoutDashboard, AlertCircle, Clock, CheckCircle2, ChefHat, BookOpen, Boxes, ArrowRight, PackagePlus } from "lucide-react";
import { useFetch } from "../../hooks/useFetch";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { AttendanceClockModal } from "../../components/AttendanceClockModal";
import { statusLabel } from "../../components/StatusBadge";
import { useAuth } from "../../context/AuthContext";

export function RestaurantDashboard() {
  const { user } = useAuth();
  const { data: sessions, loading, error, reload: reloadSessions } = useFetch("/operational-inventory/sessions", {
    initialData: [],
    realtime: true,
    pollInterval: 15000
  });
  const { data: orders = [], error: ordersError } = useFetch("/restaurante", {
    initialData: [],
    realtime: true,
    pollInterval: 15000
  });
  const { data: attendance, reload: reloadAttendance } = useFetch("/attendance/current", { initialData: { active: false }, realtime: true, pollInterval: 5000 });
  const [activeSession, setActiveSession] = useState(null);
  const [clockOpen, setClockOpen] = useState(false);
  const shiftActive = Boolean(attendance?.active);

  useEffect(() => {
    const activeStates = ["PENDING", "OPEN", "OPERATING", "COUNTING", "REOPENED"];
    const active = (sessions || []).find((s) => activeStates.includes(s.status));
    setActiveSession(active || null);
  }, [sessions]);

  if (loading) return <div className="p-8 text-center text-gray-500">Cargando turno...</div>;
  if (error || ordersError) return <div className="p-8 text-center text-red-500">Error al cargar la estación: {(error || ordersError).message || String(error || ordersError)}</div>;

  const pendingOrders = orders.filter((item) => ["PENDIENTE", "EN_COCINA"].includes(item.status)).length;
  const preparingOrders = orders.filter((item) => item.status === "PREPARANDO").length;
  const readyOrders = orders.filter((item) => item.status === "LISTO").length;

  if (!shiftActive) {
    return <main className="reception-command space-y-6 py-5"><section className="reception-hero"><div><p>RESTAURANTE · ASISTENCIA</p><h1>Marca tu turno antes de operar</h1><span>Tu DNI y PIN registran quién inicia la jornada de cocina.</span></div><Button icon={Clock} variant="gold" onClick={() => setClockOpen(true)}>Iniciar turno con DNI y PIN</Button></section><Alert tone="warning" title="Operación bloqueada">No podrás preparar pedidos ni registrar movimientos de cocina hasta marcar tu ingreso.</Alert>{clockOpen ? <AttendanceClockModal active={false} user={user} onClose={() => setClockOpen(false)} onRegistered={async () => { await Promise.all([reloadAttendance(), reloadSessions()]); }} /> : null}</main>;
  }

  if (!activeSession) {
    return (
      <main className="reception-command space-y-6 py-5">
        <section className="reception-hero">
          <div><p>RESTAURANTE · OPERACIÓN INDEPENDIENTE</p><h1>Centro de Restaurante</h1><span>Pedidos, preparación, recetas e inventario de cocina en una sola estación.</span></div><Button icon={Clock} variant="gold" onClick={() => setClockOpen(true)}>{shiftActive ? "Cerrar turno con DNI y PIN" : "Iniciar turno con DNI y PIN"}</Button>
        </section>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[["Turno", "Sin apertura"], ["Pedidos por aceptar", pendingOrders], ["En preparación", preparingOrders], ["Listos para entregar", readyOrders]].map(([label, value]) => <article className="rounded-card border border-park-border bg-white p-5 shadow-card" key={label}><p className="text-xs font-black uppercase text-park-muted">{label}</p><strong className="mt-3 block text-2xl text-park-dark">{value}</strong></article>)}
        </section>
        <Alert tone="warning" title={shiftActive ? "Inventario pendiente de apertura" : "Asistencia pendiente"}>{shiftActive ? "Tu asistencia ya está registrada. El Superadmin debe abrir y asignar el inventario de Restaurante." : "Primero marca tu ingreso con DNI y PIN. Luego el Superadmin abre y asigna el inventario del área."}</Alert>
        {clockOpen ? <AttendanceClockModal active={shiftActive} user={user} onClose={() => setClockOpen(false)} onRegistered={async () => { await Promise.all([reloadAttendance(), reloadSessions()]); }} /> : null}
      </main>
    );
  }

  const isOperating = ["OPEN", "OPERATING"].includes(activeSession.status);
  const isCounting = ["COUNTING", "REOPENED"].includes(activeSession.status);

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold text-[#0f3d2e] flex items-center gap-3">
          <LayoutDashboard className="h-8 w-8 text-[#d4af37]" />
          Mi turno: {activeSession.shiftCode || activeSession.id}
        </h1>
        <div className="flex items-center gap-2"><Button icon={Clock} variant={shiftActive ? "secondary" : "gold"} onClick={() => setClockOpen(true)}>{shiftActive ? "Cerrar turno" : "Iniciar turno"}</Button><div className={`px-4 py-2 rounded-full font-bold text-sm flex items-center gap-2 ${isOperating ? 'bg-green-100 text-green-800' : isCounting ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>
          {isOperating ? <CheckCircle2 className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
          {statusLabel(activeSession.status)}
        </div></div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[["Pedidos por aceptar", pendingOrders], ["En preparación", preparingOrders], ["Listos para entregar", readyOrders], ["Inventario", isCounting ? "Conteo físico" : "Operativo"]].map(([label, value]) => <article className="rounded-card border border-park-border bg-white p-5 shadow-card" key={label}><p className="text-xs font-black uppercase text-park-muted">{label}</p><strong className="mt-3 block text-2xl text-park-dark">{value}</strong></article>)}
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" aria-label="Acciones principales de cocina">
        <DashboardAction to="/restaurante/pedidos" icon={ChefHat} title="Preparar pedidos" detail={`${pendingOrders + preparingOrders + readyOrders} requieren seguimiento`} />
        <DashboardAction to="/restaurante/inventario/recetas" icon={BookOpen} title="Consultar recetas" detail="Medidas y preparación estándar" />
        <DashboardAction to="/restaurante/inventario/insumos" icon={Boxes} title="Revisar mi stock" detail={isCounting ? "Conteo físico en curso" : "Insumos asignados al turno"} />
        <DashboardAction to="/restaurante/inventario/solicitudes" icon={PackagePlus} title="Solicitar insumos" detail="Pedir reposición a Super Admin" />
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border border-[#0f3d2e]/10 shadow-sm">
          <div className="p-4 bg-gray-50/50 border-b">
            <h3 className="font-semibold text-[#0f3d2e] text-lg">Detalles del Turno</h3>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <p className="text-sm text-gray-500 font-medium">Área</p>
              <p className="text-lg font-semibold">{activeSession.area || "RESTAURANTE"}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">Responsable</p>
              <p className="text-lg">{activeSession.assignedToName || "Usuario asignado"}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">Abierto desde</p>
              <p className="text-lg">{activeSession.startedAt ? new Date(activeSession.startedAt).toLocaleString() : "-"}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-[#0f3d2e]/10 shadow-sm">
          <div className="p-4 bg-gray-50/50 border-b">
            <h3 className="font-semibold text-[#0f3d2e] text-lg flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              Alertas Operativas
            </h3>
          </div>
          <div className="p-6 space-y-4">
            {isCounting && (
              <Alert tone="warning">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5" />
                  <span>El turno se encuentra en estado de conteo físico. Ve a "Cerrar y cuadrar" para enviar tu rendición.</span>
                </div>
              </Alert>
            )}
            {!isCounting && (
              <p className="text-gray-500 text-sm">No hay alertas críticas en este momento. La operación fluye con normalidad.</p>
            )}
          </div>
        </div>
      </div>
      {clockOpen ? <AttendanceClockModal active={shiftActive} user={user} onClose={() => setClockOpen(false)} onRegistered={async () => { await Promise.all([reloadAttendance(), reloadSessions()]); }} /> : null}
    </div>
  );
}

function DashboardAction({ to, icon: Icon, title, detail }) {
  return <Link className="group flex items-center gap-4 rounded-card border border-park-border bg-white p-4 shadow-sm transition-shadow hover:shadow-card" to={to}>
    <span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-park-green-soft text-park-green"><Icon size={21} /></span>
    <span className="min-w-0"><strong className="block text-park-dark">{title}</strong><small className="text-park-muted">{detail}</small></span>
    <ArrowRight className="ml-auto flex-none text-park-gold" size={18} />
  </Link>;
}
