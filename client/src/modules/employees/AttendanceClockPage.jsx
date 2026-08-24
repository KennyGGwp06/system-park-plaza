import { useState } from "react";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { api } from "../../services/api";
import { Button } from "../../components/ui";
import { useNavigate } from "react-router-dom";

export function AttendanceClockPage() {
  const [pin, setPin] = useState("");
  const [status, setStatus] = useState(null); 
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleKeyPress = (num) => {
    if (pin.length < 4) setPin(p => p + num);
  };

  const handleDelete = () => setPin(p => p.slice(0, -1));

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (pin.length !== 4) return;
    
    setLoading(true);
    setStatus(null);
    try {
      const res = await api("/attendance/clock", { method: "POST", body: { pin } });
      setStatus({ 
        type: 'success', 
        message: `¡Hola ${res.user}! Has registrado tu ${res.action === 'CHECK_IN' ? 'ingreso' : 'salida'} con éxito.` 
      });
      setPin("");
      setTimeout(() => setStatus(null), 5000);
    } catch (err) {
      setStatus({ type: 'error', message: err.message || "PIN incorrecto" });
      setPin("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-park-bg p-4">
      <div className="w-full max-w-md rounded-2xl border border-park-border bg-white p-8 shadow-card text-center">
        <Clock className="mx-auto mb-4 text-park-gold" size={48} />
        <h1 className="font-display text-3xl font-black text-park-dark">Reloj de Asistencia</h1>
        <p className="mt-2 text-park-muted mb-8">Ingresa tu PIN de 4 dígitos para marcar tu ingreso o salida.</p>

        {status && (
          <div className={`mb-6 flex items-center justify-center gap-2 rounded-lg p-4 font-bold ${status.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
            {status.type === 'success' ? <CheckCircle2 /> : <XCircle />}
            {status.message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mb-6">
          <div className="mb-8 flex justify-center gap-4">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className={`flex h-16 w-14 items-center justify-center rounded-xl border-2 text-3xl font-black ${pin[i] ? 'border-park-gold text-park-dark' : 'border-gray-200 text-transparent'}`}>
                {pin[i] ? '•' : ''}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-4 mb-6">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
              <button 
                key={num} 
                type="button"
                onClick={() => handleKeyPress(num.toString())}
                className="flex h-16 items-center justify-center rounded-xl bg-gray-50 text-2xl font-bold hover:bg-gray-100 active:bg-gray-200"
              >
                {num}
              </button>
            ))}
            <button 
              type="button" 
              onClick={() => navigate("/login")}
              className="flex h-16 items-center justify-center rounded-xl text-sm font-bold text-park-muted hover:bg-gray-50"
            >
              Cerrar
            </button>
            <button 
              type="button"
              onClick={() => handleKeyPress('0')}
              className="flex h-16 items-center justify-center rounded-xl bg-gray-50 text-2xl font-bold hover:bg-gray-100 active:bg-gray-200"
            >
              0
            </button>
            <button 
              type="button"
              onClick={handleDelete}
              className="flex h-16 items-center justify-center rounded-xl text-sm font-bold text-red-500 hover:bg-red-50"
            >
              Borrar
            </button>
          </div>

          <Button 
            className="w-full text-lg py-4" 
            disabled={pin.length !== 4 || loading}
          >
            {loading ? 'Procesando...' : 'Marcar Asistencia'}
          </Button>
        </form>
      </div>
    </div>
  );
}
