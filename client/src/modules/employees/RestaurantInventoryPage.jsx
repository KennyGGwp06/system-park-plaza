import { useState, useEffect } from "react";
import { Boxes, Trash2, ClipboardList, AlertCircle, Save, CheckCircle2 } from "lucide-react";
import { useFetch } from "../../hooks/useFetch";
import { useAuth } from "../../context/AuthContext";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { api } from "../../services/api";

export function RestaurantInventoryPage() {
  const { user } = useAuth();
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [sessionStatus, setSessionStatus] = useState(null);
  const [explanations, setExplanations] = useState({});
  
  // Phase 1: Find active session
  const { data: sessions, loading: loadingSessions, error: errorSessions } = useFetch("/operational-inventory/sessions", { initialData: [], realtime: true, pollInterval: 15000 });
  
  useEffect(() => {
    if (sessions && sessions.length > 0) {
      const activeStates = ["PENDING", "OPEN", "OPERATING", "COUNTING", "REOPENED"];
      const active = sessions.find((s) => activeStates.includes(s.status));
      if (active) {
        setActiveSessionId(active.id);
        setSessionStatus(active.status);
      }
    }
  }, [sessions]);

  // Phase 2: Get session details
  const { data: sessionDetail, loading: loadingDetail, error: errorDetail, reload: refreshDetail } = useFetch(
    activeSessionId ? `/operational-inventory/sessions/${activeSessionId}` : null,
    { initialData: {}, enabled: Boolean(activeSessionId), realtime: true, pollInterval: 15000 }
  );

  const [activeTab, setActiveTab] = useState("stock");
  const [wasteForm, setWasteForm] = useState({ category: "PREPARATION_ERROR", quantity: "", reason: "", selectedKey: "" });
  const [counts, setCounts] = useState({});
  const [processing, setProcessing] = useState(false);
  const [actionError, setActionError] = useState(null);

  if (loadingSessions || (activeSessionId && loadingDetail && !sessionDetail)) {
    return <div className="p-8 text-center text-gray-500">Cargando datos de inventario...</div>;
  }

  if (errorSessions || errorDetail) {
    return <div className="p-8 text-center text-red-500">Error al cargar: {errorSessions || errorDetail}</div>;
  }

  if (!activeSessionId) {
    return (
      <div className="p-8 max-w-2xl mx-auto mt-12">
        <Alert tone="danger" title="Sin turno activo">
          <div className="flex items-start gap-2 mt-1">
            <AlertCircle className="h-5 w-5" />
            <span>No hay turno asignado. Solicita apertura al Superadmin.</span>
          </div>
        </Alert>
      </div>
    );
  }

  const stockLines = sessionDetail?.lines || [];
  const isCounting = ["COUNTING", "REOPENED"].includes(sessionStatus);
  const isSubmitted = ["SUBMITTED", "OBSERVED"].includes(sessionStatus);
  const isOpen = sessionStatus === "OPEN";

  const handleStartCount = async () => {
    setProcessing(true);
    setActionError(null);
    try {
      await api(`/api/operational-inventory/sessions/${activeSessionId}/start-count`, { method: "POST" });
      setSessionStatus("COUNTING");
      await refreshDetail();
      setActiveTab("cierre");
    } catch (err) {
      setActionError(`No se pudo iniciar el conteo: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleSubmitCount = async () => {
    // Validate all items are counted and not negative
    const missing = stockLines.find(line => counts[`${line.productId}-${line.lotId || ''}`] === undefined || counts[`${line.productId}-${line.lotId || ''}`] === "");
    const negative = Object.values(counts).find(v => Number(v) < 0);
    
    if (missing) {
      setActionError("Faltan productos por contar.");
      return;
    }
    if (negative) {
      setActionError("No se permiten cantidades negativas.");
      return;
    }

    const payloadCounts = [];
    const payloadExplanations = [];
    
    for (const line of stockLines) {
      const key = `${line.productId}-${line.lotId || ''}`;
      const qty = Number(counts[key]);
      payloadCounts.push({
        productId: line.productId,
        lotId: line.lotId || null,
        quantity: qty
      });

      const expected = line.expectedQuantity;
      const diff = Math.abs(qty - expected);
      const tol = (line.tolerancePercent / 100) * expected;
      
      if (diff > tol) {
        if (!explanations[key]) {
          setActionError(`Falta justificar diferencia en: ${line.productName}.`);
          return;
        }
        payloadExplanations.push({
          productId: line.productId,
          lotId: line.lotId || null,
          reason: explanations[key]
        });
      }
    }

    const payload = {
      counts: payloadCounts,
      explanations: payloadExplanations,
      notes: "Cierre de turno desde Restaurante nativo"
    };

    setProcessing(true);
    setActionError(null);
    try {
      await api(`/api/operational-inventory/sessions/${activeSessionId}/submit`, {
        method: "POST",
        body: payload
      });
      
      setSessionStatus("SUBMITTED");
      await refreshDetail();
    } catch (err) {
      setActionError(`No se pudo enviar la rendición: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleSubmitWaste = async (e) => {
    e.preventDefault();
    if (!wasteForm.selectedKey || !wasteForm.quantity || !wasteForm.reason) {
      setActionError("Por favor, completa todos los campos de merma.");
      return;
    }
    
    // Parse composite key
    const [pIdStr, lIdStr] = wasteForm.selectedKey.split("|");
    const pId = Number(pIdStr);
    const lId = lIdStr ? Number(lIdStr) : null;
    
    // Find the product/lot info to include correct payload
    const line = stockLines.find(l => l.productId === pId && (l.lotId || null) === lId);
    if (!line) {
      setActionError("Error: No se encontró el insumo seleccionado en el turno.");
      return;
    }

    setProcessing(true);
    setActionError(null);
    try {
      await api(`/api/operational-inventory/sessions/${activeSessionId}/waste`, {
        method: "POST",
        body: {
          productId: line.productId,
          lotId: line.lotId || null,
          quantity: Number(wasteForm.quantity),
          category: wasteForm.category,
          observation: wasteForm.reason
        }
      });

      setWasteForm({ category: "PREPARATION_ERROR", quantity: "", reason: "", selectedKey: "" });
      alert("Merma registrada exitosamente");
      await refreshDetail();
    } catch (err) {
      setActionError(`No se pudo registrar la merma: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-[#0f3d2e] flex items-center gap-3">
          <Boxes className="h-8 w-8 text-[#d4af37]" />
          Inventario de Turno
        </h1>
        <div className="text-sm font-medium px-3 py-1 bg-gray-100 rounded-md text-gray-700">
          Turno: {sessionDetail?.shiftCode || activeSessionId} • Estado: {sessionStatus}
        </div>
      </div>

      {actionError && (
        <Alert tone="danger" title="Error">
          <div className="flex items-start gap-2 mt-1">
            <AlertCircle className="h-5 w-5" />
            <span>{actionError}</span>
          </div>
        </Alert>
      )}

      <div className="flex border-b border-gray-200 mb-6">
        <button 
          onClick={() => setActiveTab("stock")} 
          className={`pb-4 px-6 font-medium text-sm border-b-2 transition-colors ${activeTab === "stock" ? "border-[#0f3d2e] text-[#0f3d2e]" : "border-transparent text-gray-500 hover:text-gray-700"}`}
        >
          <div className="flex items-center gap-2"><Boxes className="h-4 w-4" /> Stock Asignado</div>
        </button>
        <button 
          onClick={() => setActiveTab("merma")} 
          className={`pb-4 px-6 font-medium text-sm border-b-2 transition-colors ${activeTab === "merma" ? "border-red-600 text-red-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
        >
          <div className="flex items-center gap-2"><Trash2 className="h-4 w-4" /> Registrar Merma</div>
        </button>
        <button 
          onClick={() => setActiveTab("cierre")} 
          className={`pb-4 px-6 font-medium text-sm border-b-2 transition-colors ${activeTab === "cierre" ? "border-amber-600 text-amber-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
        >
          <div className="flex items-center gap-2"><ClipboardList className="h-4 w-4" /> Cerrar y Cuadrar</div>
        </button>
      </div>

      {activeTab === "stock" && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="p-4 bg-gray-50/50 border-b">
            <h3 className="font-semibold text-[#0f3d2e] text-lg">Insumos y Lotes Actuales</h3>
          </div>
          <div className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Insumo</th>
                    <th className="px-6 py-4 font-semibold">Lote</th>
                    <th className="px-6 py-4 font-semibold text-right">Inicial</th>
                    <th className="px-6 py-4 font-semibold text-right">Consumos</th>
                    <th className="px-6 py-4 font-semibold text-right">Mermas</th>
                    <th className="px-6 py-4 font-semibold text-right text-[#0f3d2e]">Disponible</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {stockLines.map((line, idx) => (
                    <tr key={idx} className="hover:bg-gray-50/50">
                      <td className="px-6 py-4 font-medium text-gray-900">{line.productName}</td>
                      <td className="px-6 py-4 text-gray-600">{line.lotCode || '-'}</td>
                      <td className="px-6 py-4 text-right">{line.openingQuantity} {line.unitSymbol}</td>
                      <td className="px-6 py-4 text-right text-orange-600">{line.theoreticalConsumption} {line.unitSymbol}</td>
                      <td className="px-6 py-4 text-right text-red-600">{line.wasteQuantity} {line.unitSymbol}</td>
                      <td className="px-6 py-4 text-right font-bold text-[#0f3d2e]">{line.expectedQuantity} {line.unitSymbol}</td>
                    </tr>
                  ))}
                  {stockLines.length === 0 && (
                    <tr>
                      <td colSpan="6" className="px-6 py-8 text-center text-gray-500">No hay insumos asignados al turno.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === "merma" && (
        <div className="bg-white rounded-lg border border-red-100 shadow-sm max-w-2xl mx-auto">
          <div className="p-4 bg-red-50/50 border-b border-red-100">
            <h3 className="font-semibold text-red-800 text-lg flex items-center gap-2">
              <Trash2 className="h-5 w-5" /> Registrar Merma Operativa
            </h3>
          </div>
          <div className="p-6">
            {!isOpen && !isCounting ? (
              <Alert tone="info">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5" />
                  <span>Solo puedes registrar mermas en turnos abiertos o en conteo.</span>
                </div>
              </Alert>
            ) : (
              <form onSubmit={handleSubmitWaste} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700">Producto y Lote afectado</label>
                  <select 
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={wasteForm.selectedKey}
                    onChange={(e) => setWasteForm({...wasteForm, selectedKey: e.target.value})}
                    required
                  >
                    <option value="">Selecciona un insumo...</option>
                    {stockLines.map(line => (
                      <option key={`${line.productId}-${line.lotId || ''}`} value={`${line.productId}|${line.lotId || ''}`}>
                        {line.productName} {line.lotCode ? `(Lote: ${line.lotCode})` : ''} - Disp: {line.expectedQuantity} {line.unitSymbol}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700">Categoría</label>
                    <select 
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={wasteForm.category}
                      onChange={(e) => setWasteForm({...wasteForm, category: e.target.value})}
                      required
                    >
                      <option value="PREPARATION_ERROR">Error de preparación</option>
                      <option value="SPILL">Derrame</option>
                      <option value="EXPIRY">Vencimiento</option>
                      <option value="DAMAGED">Producto dañado</option>
                      <option value="INTERNAL_CONSUMPTION">Consumo interno</option>
                      <option value="OTHER">Otra</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700">Cantidad Perdida</label>
                    <Input 
                      type="number" 
                      step="0.01" 
                      min="0.01"
                      placeholder="Ej. 1.5"
                      value={wasteForm.quantity}
                      onChange={(e) => setWasteForm({...wasteForm, quantity: e.target.value})}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700">Motivo detallado</label>
                  <Input 
                    type="text" 
                    placeholder="Describe exactamente qué pasó..."
                    value={wasteForm.reason}
                    onChange={(e) => setWasteForm({...wasteForm, reason: e.target.value})}
                    required
                  />
                </div>

                <Button type="submit" disabled={processing} className="w-full bg-red-600 hover:bg-red-700 text-white mt-4">
                  {processing ? "Registrando..." : "Registrar Merma"}
                </Button>
              </form>
            )}
          </div>
        </div>
      )}

      {activeTab === "cierre" && (
        <div className="bg-white rounded-lg border border-amber-200 shadow-sm">
          <div className="p-4 bg-amber-50/50 border-b border-amber-100 flex items-center justify-between">
            <h3 className="font-semibold text-amber-800 text-lg flex items-center gap-2">
              <ClipboardList className="h-5 w-5" /> Conteo y Cuadre Físico
            </h3>
            {isSubmitted && (
              <span className="bg-green-100 text-green-800 text-sm px-3 py-1 rounded-full font-medium flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4" /> Rendición Enviada
              </span>
            )}
          </div>
          <div className="p-6">
            {isSubmitted ? (
              <div className="text-center py-12">
                <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-[#0f3d2e] mb-2">Rendición enviada a revisión</h3>
                <p className="text-gray-500">Tu conteo físico ha sido enviado a la administración para su validación final.<br/>Ya no puedes modificar esta rendición.</p>
              </div>
            ) : isOpen ? (
              <div className="text-center py-12">
                <ClipboardList className="h-16 w-16 text-amber-300 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-[#0f3d2e] mb-2">Inicia el Conteo Físico</h3>
                <p className="text-gray-500 mb-6 max-w-md mx-auto">Al iniciar el conteo, el turno pasará a modo de cuadre y no se podrán procesar más pedidos ni descuentos automáticos.</p>
                <Button onClick={handleStartCount} disabled={processing} className="bg-amber-600 hover:bg-amber-700 text-white text-lg px-8 py-6 h-auto">
                  {processing ? "Iniciando..." : "Comenzar Conteo de Cierre"}
                </Button>
              </div>
            ) : isCounting ? (
              <div className="space-y-6">
                <Alert tone="info">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 mt-0.5" />
                    <span>Ingresa el conteo físico real (lo que tienes a la mano) para cada insumo.</span>
                  </div>
                </Alert>
                
                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-4 py-3 font-semibold text-gray-700">Producto</th>
                        <th className="px-4 py-3 font-semibold text-gray-700 text-right">Físico a la vista</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {stockLines.map((line) => {
                        const key = `${line.productId}-${line.lotId || ''}`;
                        return (
                          <tr key={key} className="hover:bg-gray-50/50">
                            <td className="px-4 py-4">
                              <p className="font-medium text-gray-900">{line.productName}</p>
                              <p className="text-xs text-gray-500 mt-1">Lote: {line.lotCode || 'N/A'}</p>
                            </td>
                            <td className="px-4 py-4 text-right">
                              <div className="flex flex-col gap-2 items-end">
                                <div className="flex items-center justify-end gap-2">
                                  <Input 
                                    type="number" 
                                    step="0.01" 
                                    min="0"
                                    className={`w-28 text-right font-medium ${counts[key] === undefined ? 'border-amber-300 bg-amber-50' : 'border-gray-300'}`}
                                    value={counts[key] !== undefined ? counts[key] : ""}
                                    onChange={(e) => setCounts({...counts, [key]: e.target.value})}
                                    placeholder="0.00"
                                  />
                                  <span className="text-gray-500 font-medium w-12 text-left">{line.unitSymbol}</span>
                                </div>
                                {counts[key] !== undefined && Math.abs(Number(counts[key]) - line.expectedQuantity) > (line.tolerancePercent / 100) * line.expectedQuantity && (
                                  <Input 
                                    type="text"
                                    placeholder="Motivo de la diferencia..."
                                    className="w-full mt-1 border-red-300 bg-red-50 text-sm"
                                    value={explanations[key] || ""}
                                    onChange={(e) => setExplanations({...explanations, [key]: e.target.value})}
                                    required
                                  />
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end pt-4 border-t border-gray-100">
                  <Button 
                    onClick={handleSubmitCount} 
                    disabled={processing} 
                    className="bg-[#0f3d2e] hover:bg-[#0f3d2e]/90 text-white flex items-center gap-2"
                  >
                    <Save className="h-4 w-4" />
                    {processing ? "Enviando..." : "Enviar Rendición Definitiva"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                Estado del turno no compatible con cierre en este momento.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
