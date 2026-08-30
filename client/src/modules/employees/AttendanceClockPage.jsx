import { useState } from "react";
import { CheckCircle2, XCircle, TreePine, Clock } from "lucide-react";
import { api } from "../../services/api";
import { useNavigate } from "react-router-dom";

export function AttendanceClockPage() {
  const [documentNumber, setDocumentNumber] = useState("");
  const [pin, setPin] = useState("");
  const [workerInfo, setWorkerInfo] = useState(null);
  const [status, setStatus] = useState(null); 
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (documentNumber.length !== 8 || pin.length !== 4) return;

    setLoading(true);
    setStatus(null);
    try {
      const res = await api("/attendance/clock", { method: "POST", body: { documentNumber, pin } });
      setStatus({ 
        type: 'success', 
        message: `Hola ${res.user}. Has registrado tu ${res.action === 'CHECK_IN' ? 'ingreso' : 'salida'} con exito.`
      });
      setDocumentNumber("");
      setPin("");
      setWorkerInfo(res.worker || null);
      setTimeout(() => setStatus(null), 5000);
    } catch (err) {
      setStatus({ type: 'error', message: err.message || "DNI o PIN incorrecto" });
      setDocumentNumber("");
      setPin("");
      setWorkerInfo(null);
    } finally {
      setLoading(false);
    }
  };

  const renderAvatar = () => {
    if (!workerInfo) return <Clock className="mx-auto text-park-gold opacity-50" size={64} />;
    if (workerInfo.photoUrl) return <img src={workerInfo.photoUrl} alt="Trabajador validado" className="h-full w-full object-cover" />;
    return <span className="text-3xl font-black text-park-gold">{`${workerInfo.firstName || ""}`.slice(0, 1)}</span>;
  };

  return (
    <div
      className="relative flex min-h-screen flex-col items-center justify-center p-4 font-sans bg-park-bg"
      style={{ backgroundImage: "url('/images/demo/hotel_lobby_background.jpg')", backgroundSize: 'cover', backgroundPosition: 'center' }}
    >
      {/* Background Blur Overlay */}
      <div className="absolute inset-0 bg-park-dark/60 backdrop-blur-md"></div>

      {/* Header */}
      <div className="absolute top-0 left-0 w-full flex flex-col sm:flex-row items-center justify-between p-4 z-10 gap-4">
        <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md px-4 py-2 rounded-xl border border-white/20 text-white shadow-lg">
           <TreePine className="text-park-gold" size={32} />
           <div className="flex flex-col leading-tight">
             <span className="font-bold text-sm text-park-gold">Park Plaza</span>
             <span className="font-bold text-sm">Hotel & Suites</span>
           </div>
        </div>
        <div className="absolute left-1/2 top-4 -translate-x-1/2 text-white font-semibold text-lg drop-shadow-md hidden sm:block">
          Registro de Asistencia Inteligente
        </div>
      </div>

      {/* Main Card */}
      <div className="relative z-10 w-full max-w-2xl rounded-3xl border border-park-gold/30 bg-white/10 p-6 shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] backdrop-blur-xl">

        {/* Worker Details Section */}
        <div className="mb-6 rounded-2xl border border-white/20 bg-white/5 p-6 text-center text-white shadow-inner transition-all duration-300">
          <h2 className="mb-4 text-2xl font-medium drop-shadow-md text-park-gold">Detalles del Trabajador</h2>

          <div className="mx-auto mb-4 flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border-4 border-park-gold/50 bg-park-dark/50 shadow-lg">
            {renderAvatar()}
          </div>

          <div className="space-y-1 text-xl drop-shadow-md min-h-[60px]">
            {workerInfo ? (
              <>
                <p className="font-bold text-white">{workerInfo.firstName} {workerInfo.lastName}</p>
                <p className="text-park-gold">{workerInfo.position}</p>
              </>
            ) : (
              <p className="text-white/50 text-base mt-4">Ingresa tu DNI y PIN para marcar asistencia.</p>
            )}
          </div>
        </div>

        {/* Input Section */}
        <form onSubmit={handleSubmit} className="rounded-2xl border border-white/20 bg-white/5 p-6 text-white shadow-inner">
          {status && (
            <div className={`mb-4 flex items-center justify-center gap-2 rounded-lg p-3 font-bold ${status.type === 'success' ? 'bg-emerald-500/90 text-white' : 'bg-red-500/90 text-white'} backdrop-blur-md`}>
              {status.type === 'success' ? <CheckCircle2 /> : <XCircle />}
              {status.message}
            </div>
          )}

          <label className="mb-2 block text-lg drop-shadow-md text-park-gold">DNI</label>
          <input
            type="text"
            value={documentNumber}
            onChange={(e) => { setWorkerInfo(null); setDocumentNumber(e.target.value.replace(/\D/g, '').slice(0, 8)); }}
            placeholder="Ingrese DNI..."
            className="mb-6 w-full rounded-xl border border-park-gold/50 bg-park-dark/40 px-4 py-4 text-white text-lg placeholder-white/40 outline-none backdrop-blur-md focus:border-park-gold focus:bg-park-dark/60 focus:ring-2 focus:ring-park-gold/50 transition-all text-center tracking-widest font-bold"
          />

          <label className="mb-2 block text-lg drop-shadow-md text-park-gold">PIN personal de 4 dígitos</label>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            onChange={(e) => { setWorkerInfo(null); setPin(e.target.value.replace(/\D/g, "").slice(0, 4)); }}
            placeholder="••••"
            className="mb-6 w-full rounded-xl border border-park-gold/50 bg-park-dark/40 px-4 py-4 text-center text-lg font-bold tracking-[0.55em] text-white placeholder-white/40 outline-none backdrop-blur-md transition-all focus:border-park-gold focus:bg-park-dark/60 focus:ring-2 focus:ring-park-gold/50"
          />

          <div className="flex justify-center gap-4">
            <button
              type="submit"
              disabled={documentNumber.length !== 8 || pin.length !== 4 || loading}
              className="rounded-xl bg-park-gold hover:bg-yellow-500 px-10 py-3 text-lg font-semibold text-park-dark shadow-lg backdrop-blur-md transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 border border-yellow-400"
            >
              {loading ? 'Validando...' : 'Marcar Asistencia'}
            </button>
            <button
              type="button"
              onClick={() => navigate("/login")}
              className="rounded-xl bg-white/10 hover:bg-white/20 px-10 py-3 text-lg font-semibold text-white shadow-lg backdrop-blur-md transition-all hover:scale-105 active:scale-95 border border-white/30"
            >
              Cerrar
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
