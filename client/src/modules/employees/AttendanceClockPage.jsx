import { useState, useEffect, useRef } from "react";
import { CheckCircle2, XCircle, TreePine, Clock } from "lucide-react";
import { api } from "../../services/api";
import { useNavigate } from "react-router-dom";

export function AttendanceClockPage() {
  const [documentNumber, setDocumentNumber] = useState("");
  const [workerInfo, setWorkerInfo] = useState(null);
  const [status, setStatus] = useState(null); 
  const [lookupLoading, setLookupLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [clockNow, setClockNow] = useState(Date.now());
  const lookupRequest = useRef(0);
  const resultTimeout = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!status?.record?.checkIn || status.record.checkOut) return undefined;
    const interval = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [status?.record?.checkIn, status?.record?.checkOut]);

  useEffect(() => {
    const requestId = ++lookupRequest.current;
    if (documentNumber.length === 8) {
      // Nunca conservar datos de una búsqueda anterior mientras se valida otro DNI.
      setWorkerInfo(null);
      setLookupLoading(true);
      setStatus(null);
      api(`/attendance/lookup/${documentNumber}`)
        .then((data) => {
          if (requestId !== lookupRequest.current) return;
          setWorkerInfo({ ...data, documentNumber });
        })
        .catch((err) => {
          if (requestId !== lookupRequest.current) return;
          setWorkerInfo(null);
          setStatus({ type: 'error', message: err.message || "Trabajador no encontrado" });
        })
        .finally(() => {
          if (requestId === lookupRequest.current) setLookupLoading(false);
        });
    } else {
      setWorkerInfo(null);
      setLookupLoading(false);
      if (status?.type === 'error') setStatus(null);
    }
  }, [documentNumber]);

  function updateDocument(value) {
    if (resultTimeout.current) window.clearTimeout(resultTimeout.current);
    setWorkerInfo(null);
    setStatus(null);
    setDocumentNumber(value.replace(/\D/g, '').slice(0, 8));
  }

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (documentNumber.length !== 8) return;
    if (!workerInfo || workerInfo.documentNumber !== documentNumber) {
      setStatus({ type: 'error', message: 'Espera la validación del DNI antes de registrar la asistencia.' });
      return;
    }

    setSubmitting(true);
    setStatus(null);
    try {
      const res = await api("/attendance/clock", { method: "POST", body: { documentNumber } });
      setStatus({ 
        type: 'success', 
        message: `Hola ${res.user}. Has registrado tu ${res.action === 'CHECK_IN' ? 'ingreso' : 'salida'} con exito.`,
        record: res.record
      });
      setDocumentNumber("");
      setWorkerInfo(null);
      resultTimeout.current = window.setTimeout(() => setStatus(null), 7000);
    } catch (err) {
      setStatus({ type: 'error', message: err.message || "DNI no valido" });
      setDocumentNumber("");
      setWorkerInfo(null);
    } finally {
      setSubmitting(false);
    }
  };

  const renderAvatar = () => {
    if (!workerInfo) return <Clock className="mx-auto text-park-gold opacity-50" size={64} />;
    if (workerInfo.photoUrl) return <img src={workerInfo.photoUrl} alt="Avatar" className="h-full w-full object-cover" />;

    // Mostrar foto de mujer específicamente para el personal de limpieza, sino foto de hombre.
    const isCleaning = workerInfo.position === 'LIMPIEZA' || workerInfo.position?.toLowerCase().includes('limpieza');
    const demoPhoto = isCleaning ? '/images/demo/demo_avatar_female.jpg' : '/images/demo/demo_avatar_male.jpg';

    return <img src={demoPhoto} alt="Avatar" className="h-full w-full object-cover" />;
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
              <p className="text-white/50 text-base mt-4">Esperando DNI...</p>
            )}
          </div>
        </div>

        {/* Input Section */}
        <form onSubmit={handleSubmit} className="rounded-2xl border border-white/20 bg-white/5 p-6 text-white shadow-inner">
          {status && (
            <div className={`mb-4 rounded-lg p-3 font-bold ${status.type === 'success' ? 'bg-emerald-500/90 text-white' : 'bg-red-500/90 text-white'} backdrop-blur-md`}>
              <div className="flex items-center justify-center gap-2">
                {status.type === 'success' ? <CheckCircle2 /> : <XCircle />}
                {status.message}
              </div>
              {status.record ? <AttendanceSummary record={status.record} currentTime={clockNow} /> : null}
            </div>
          )}

          <label className="mb-2 block text-lg drop-shadow-md text-park-gold">DNI (Número de Identificación)</label>
          <input
            type="text"
            value={documentNumber}
            onChange={(e) => updateDocument(e.target.value)}
            placeholder="Ingrese DNI..."
            className="mb-6 w-full rounded-xl border border-park-gold/50 bg-park-dark/40 px-4 py-4 text-white text-lg placeholder-white/40 outline-none backdrop-blur-md focus:border-park-gold focus:bg-park-dark/60 focus:ring-2 focus:ring-park-gold/50 transition-all text-center tracking-widest font-bold"
          />

          <div className="flex justify-center gap-4">
            <button
              type="submit"
              disabled={!workerInfo || lookupLoading || submitting}
              className="rounded-xl bg-park-gold hover:bg-yellow-500 px-10 py-3 text-lg font-semibold text-park-dark shadow-lg backdrop-blur-md transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 border border-yellow-400"
            >
              {lookupLoading ? 'Buscando trabajador...' : submitting ? 'Registrando...' : 'Marcar Asistencia'}
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

function AttendanceSummary({ record, currentTime }) {
  const checkIn = record.checkIn || record.clockIn;
  const checkOut = record.checkOut || record.clockOut;
  return <div className="mt-3 grid grid-cols-3 gap-2 border-t border-white/30 pt-3 text-center text-xs font-semibold sm:text-sm">
    <TimeMetric label="Entrada" value={formatClockTime(checkIn)} />
    <TimeMetric label="Salida" value={checkOut ? formatClockTime(checkOut) : "En turno"} />
    <TimeMetric label="Tiempo" value={formatDuration(checkIn, checkOut, currentTime)} />
  </div>;
}

function TimeMetric({ label, value }) {
  return <div><p className="text-[10px] font-bold uppercase tracking-wide text-white/75">{label}</p><p className="mt-1">{value}</p></div>;
}

function formatClockTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("es-PE", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true, timeZone: "America/Lima" }).format(new Date(value));
}

function formatDuration(start, end, currentTime) {
  if (!start) return "-";
  const milliseconds = Math.max(0, (end ? new Date(end).getTime() : currentTime) - new Date(start).getTime());
  const seconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}
