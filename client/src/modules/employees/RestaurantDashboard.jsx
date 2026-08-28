import { useState, useEffect } from "react";
import { LayoutDashboard, AlertCircle, Clock, CheckCircle2 } from "lucide-react";
import { useFetch } from "../../hooks/useFetch";
import { Alert } from "../../components/ui/Alert";

export function RestaurantDashboard() {
  const { data: sessions, loading, error } = useFetch("/operational-inventory/sessions", {
    initialData: [],
    realtime: true,
    pollInterval: 15000
  });
  const [activeSession, setActiveSession] = useState(null);

  useEffect(() => {
    if (sessions && sessions.length > 0) {
      const activeStates = ["PENDING", "OPEN", "OPERATING", "COUNTING", "REOPENED"];
      const active = sessions.find((s) => activeStates.includes(s.status));
      setActiveSession(active || null);
    }
  }, [sessions]);

  if (loading) return <div className="p-8 text-center text-gray-500">Cargando turno...</div>;
  if (error) return <div className="p-8 text-center text-red-500">Error al cargar el turno: {error}</div>;

  if (!activeSession) {
    return (
      <main className="reception-command space-y-6 py-5">
        <section className="reception-hero">
          <div><p>RESTAURANTE · OPERACIÓN INDEPENDIENTE</p><h1>Centro de Restaurante</h1><span>Pedidos, preparación, recetas e inventario de cocina en una sola estación.</span></div>
        </section>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[['Turno', 'Sin apertura'], ['Pedidos activos', '0'], ['Preparaciones', '0'], ['Stock asignado', 'Pendiente']].map(([label, value]) => <article className="rounded-card border border-park-border bg-white p-5 shadow-card" key={label}><p className="text-xs font-black uppercase text-park-muted">{label}</p><strong className="mt-3 block text-2xl text-park-dark">{value}</strong></article>)}
        </section>
        <Alert tone="warning" title="Turno pendiente de apertura">
          El Superadmin debe abrir el turno y asignar el inventario de Restaurante. La estación permanecerá en solo lectura hasta entonces.
        </Alert>
      </main>
    );
  }

  const isOperating = ["OPEN", "OPERATING"].includes(activeSession.status);
  const isCounting = ["COUNTING", "REOPENED"].includes(activeSession.status);

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-[#0f3d2e] flex items-center gap-3">
          <LayoutDashboard className="h-8 w-8 text-[#d4af37]" />
          Mi turno: {activeSession.shiftCode || activeSession.id}
        </h1>
        <div className={`px-4 py-2 rounded-full font-bold text-sm flex items-center gap-2 ${isOperating ? 'bg-green-100 text-green-800' : isCounting ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>
          {isOperating ? <CheckCircle2 className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
          {activeSession.status}
        </div>
      </div>

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
    </div>
  );
}
