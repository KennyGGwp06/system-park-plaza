import { useState } from "react";
import { ChefHat, Clock, CheckCircle2, Play, AlertCircle } from "lucide-react";
import { useFetch } from "../../hooks/useFetch";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { api } from "../../services/api";

export function RestaurantOrdersPage() {
  const { data: ordersData, loading, error, reload: refresh } = useFetch("/restaurante", {
    initialData: [],
    realtime: true,
    pollInterval: 15000
  });
  const [processing, setProcessing] = useState(null);
  const [actionError, setActionError] = useState(null);

  if (loading && !ordersData) return <div className="p-8 text-center text-gray-500">Cargando pedidos...</div>;
  if (error && !ordersData) return <div className="p-8 text-center text-red-500">Error: {error}</div>;

  const orders = ordersData || [];
  const activeOrders = orders.filter((o) => !["ENTREGADO", "CANCELADO"].includes(o.status));

  const updateStatus = async (orderId, targetStatus) => {
    if (targetStatus === "CANCELADO") {
      if (!window.confirm("¿Estás seguro de cancelar este pedido? No se podrá recuperar.")) {
        return;
      }
    }

    setProcessing(orderId);
    setActionError(null);

    try {
      await api(`/restaurante/${orderId}/status`, {
        method: "PATCH",
        body: { status: targetStatus }
      });
      
      await refresh();
    } catch (err) {
      setActionError(`No se pudo actualizar el pedido #${orderId}: ${err.message}`);
    } finally {
      setProcessing(null);
    }
  };

  const renderOrderButtons = (order) => {
    const isProcessing = processing === order.id;

    if (order.status === "PENDIENTE") {
      return (
        <div className="flex gap-2">
          <Button 
            className="flex-1 bg-[#0f3d2e] hover:bg-[#0f3d2e]/90 text-white" 
            onClick={() => updateStatus(order.id, "EN_COCINA")}
            disabled={isProcessing}
          >
            {isProcessing ? "..." : "Aceptar"}
          </Button>
          <Button 
            variant="outline"
            className="flex-1 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700" 
            onClick={() => updateStatus(order.id, "CANCELADO")}
            disabled={isProcessing}
          >
            Rechazar
          </Button>
        </div>
      );
    }
    if (order.status === "EN_COCINA") {
      return (
        <Button 
          className="w-full bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2" 
          onClick={() => updateStatus(order.id, "PREPARANDO")}
          disabled={isProcessing}
        >
          <Play className="h-4 w-4" />
          {isProcessing ? "Iniciando..." : "Iniciar Preparación"}
        </Button>
      );
    }
    if (order.status === "PREPARANDO") {
      return (
        <Button 
          className="w-full bg-amber-500 hover:bg-amber-600 text-white flex items-center gap-2" 
          onClick={() => updateStatus(order.id, "LISTO")}
          disabled={isProcessing}
        >
          <CheckCircle2 className="h-4 w-4" />
          {isProcessing ? "Marcando..." : "Marcar Listo"}
        </Button>
      );
    }
    if (order.status === "LISTO") {
      return (
        <Button 
          className="w-full bg-green-600 hover:bg-green-700 text-white flex items-center gap-2" 
          onClick={() => updateStatus(order.id, "ENTREGADO")}
          disabled={isProcessing}
        >
          <ChefHat className="h-4 w-4" />
          {isProcessing ? "Entregando y Descontando..." : "Entregar"}
        </Button>
      );
    }
    return null;
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "PENDIENTE": return "bg-gray-100 text-gray-800 border-gray-200";
      case "EN_COCINA": return "bg-blue-50 text-blue-800 border-blue-200";
      case "PREPARANDO": return "bg-amber-50 text-amber-800 border-amber-200";
      case "LISTO": return "bg-green-50 text-green-800 border-green-200";
      default: return "bg-gray-50 text-gray-800 border-gray-200";
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-[#0f3d2e] flex items-center gap-3">
          <ChefHat className="h-8 w-8 text-[#d4af37]" />
          Operación y Pedidos
        </h1>
        <Button variant="outline" onClick={refresh} disabled={!!processing}>
          Actualizar cola
        </Button>
      </div>

      {actionError && (
        <Alert tone="danger" title="Error de Operación">
          <div className="flex items-start gap-2 mt-1">
            <AlertCircle className="h-5 w-5" />
            <span>{actionError}</span>
          </div>
        </Alert>
      )}

      {activeOrders.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-lg border border-dashed">
          <ChefHat className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900">No hay pedidos activos</h3>
          <p className="text-gray-500">Los pedidos entrantes aparecerán aquí.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {activeOrders.map((order) => (
            <div key={order.id} className={`rounded-lg border bg-white shadow-sm overflow-hidden ${getStatusColor(order.status).replace('text-', 'border-').replace('bg-', '')}`}>
              <div className="p-4 bg-gray-50/50 border-b">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-lg text-[#0f3d2e]">{order.code}</h3>
                    <p className="text-sm text-gray-500 mt-1 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(order.createdAt).toLocaleTimeString()}
                    </p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${getStatusColor(order.status)}`}>
                    {order.status}
                  </span>
                </div>
              </div>
              <div className="p-4 space-y-4">
                <div className="space-y-3 min-h-[120px]">
                  {order.items?.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center py-1 border-b border-gray-100 last:border-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[#0f3d2e] bg-[#0f3d2e]/10 px-2 py-0.5 rounded text-sm">
                          {item.quantity}x
                        </span>
                        <span className="font-medium text-gray-800">{item.name}</span>
                      </div>
                    </div>
                  ))}
                </div>
                
                {order.notes && (
                  <div className="bg-yellow-50 p-3 rounded text-sm text-yellow-800 border border-yellow-200">
                    <span className="font-bold">Nota:</span> {order.notes}
                  </div>
                )}
                
                <div className="pt-2">
                  {renderOrderButtons(order)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
