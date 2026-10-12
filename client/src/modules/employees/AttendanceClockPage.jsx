// Reloj de asistencia (/reloj): terminal compartida donde cada trabajador marca su entrada o salida con DNI y PIN.
// Confirma el registro en la misma pantalla y nunca abre una sesión ni redirige al panel del trabajador.
// Identidad de las estaciones (access.css) con teclado numérico para tablet.
import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Delete, UserRound } from "lucide-react";
import { api } from "../../services/api";
import { LimaClock } from "../../components/LimaClock";

export function AttendanceClockPage() {
  const [documentNumber, setDocumentNumber] = useState("");
  const [pin, setPin] = useState("");
  const [field, setField] = useState("dni");
  const [workerInfo, setWorkerInfo] = useState(null);
  const [status, setStatus] = useState(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [clockNow, setClockNow] = useState(Date.now());
  const lookupRequest = useRef(0);
  const resultTimeout = useRef(null);
  const pinInput = useRef(null);

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
      setField("pin");
      pinInput.current?.focus();
      api(`/attendance/lookup/${documentNumber}`)
        .then((data) => {
          if (requestId !== lookupRequest.current) return;
          setWorkerInfo({ ...data, documentNumber });
        })
        .catch((err) => {
          if (requestId !== lookupRequest.current) return;
          setWorkerInfo(null);
          setStatus({ type: "error", message: err.message || "Trabajador no encontrado" });
        })
        .finally(() => {
          if (requestId === lookupRequest.current) setLookupLoading(false);
        });
    } else {
      setWorkerInfo(null);
      setLookupLoading(false);
      if (status?.type === "error") setStatus(null);
    }
  }, [documentNumber]);

  function updateDocument(value) {
    if (resultTimeout.current) window.clearTimeout(resultTimeout.current);
    setWorkerInfo(null);
    setStatus(null);
    setDocumentNumber(value.replace(/\D/g, "").slice(0, 8));
  }

  function updatePin(value) {
    setPin(value.replace(/\D/g, "").slice(0, 4));
  }

  function reset() {
    setDocumentNumber("");
    setPin("");
    setWorkerInfo(null);
    setField("dni");
  }

  function press(key) {
    const target = field === "pin" && documentNumber.length === 8 ? "pin" : "dni";
    const current = target === "pin" ? pin : documentNumber;
    const next = key === "back" ? current.slice(0, -1) : key === "clear" ? "" : current + key;
    if (target === "pin") {
      if (key === "back" && !pin) { setField("dni"); updateDocument(documentNumber.slice(0, -1)); return; }
      updatePin(next);
    } else updateDocument(next);
  }

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (documentNumber.length !== 8 || pin.length !== 4) return;
    if (!workerInfo || workerInfo.documentNumber !== documentNumber) {
      setStatus({ type: "error", message: "Espera la validación del DNI antes de registrar la asistencia." });
      return;
    }

    setSubmitting(true);
    setStatus(null);
    try {
      const res = await api("/attendance/clock", { method: "POST", body: { documentNumber, pin } });
      setStatus({
        type: "success",
        message: res.action === "CHECK_IN"
          ? `Hola ${res.user}. Tu ingreso fue registrado correctamente.`
          : `Hola ${res.user}. Has registrado tu salida con éxito.`,
        record: res.record
      });
      reset();
      resultTimeout.current = window.setTimeout(() => setStatus(null), 8000);
    } catch (err) {
      setStatus({ type: "error", message: err.message || "DNI o PIN incorrecto" });
      reset();
    } finally {
      setSubmitting(false);
    }
  };

  const ready = workerInfo && documentNumber.length === 8 && pin.length === 4 && !lookupLoading && !submitting;
  const initial = `${workerInfo?.firstName || ""}`.slice(0, 1);

  return (
    <div className="ax ax-clock">
      <header className="ax-clock-top">
        <div className="ax-brand"><img src="/brand/park-plaza-mark.svg" alt="" /><span><b>PARK PLAZA</b><small>Control de asistencia</small></span></div>
        <div className="ax-clock-now"><LimaClock withSeconds /></div>
      </header>

      <div className="ax-clock-body">
        <section className="ax-clock-card">
          <aside className="ax-worker" aria-live="polite">
            <div className="ax-worker-photo">
              {workerInfo?.photoUrl ? <img src={workerInfo.photoUrl} alt="Trabajador validado" /> : workerInfo ? initial : <UserRound />}
            </div>
            <div>
              {workerInfo ? <>
                <strong>{workerInfo.firstName} {workerInfo.lastName}</strong>
                <span>{workerInfo.position}</span>
              </> : <>
                <strong>{lookupLoading ? "Buscando…" : "Sin identificar"}</strong>
                <span>{lookupLoading ? "Validando el DNI" : "Digita tu DNI para empezar"}</span>
              </>}
            </div>
            {workerInfo ? <em>DNI validado</em> : null}
          </aside>

          <form className="ax-clock-form" onSubmit={handleSubmit}>
            <h1>Marcar entrada o salida</h1>
            <p>El sistema detecta si inicias o terminas tu turno.</p>

            {status ? <div className={`ax-alert${status.type === "success" ? " ax-alert--ok" : ""}`} role={status.type === "error" ? "alert" : "status"}>
              {status.type === "success" ? <CheckCircle2 /> : <AlertCircle />}
              <div style={{ flex: 1 }}>
                {status.message}
                {status.record ? <AttendanceSummary record={status.record} currentTime={clockNow} /> : null}
              </div>
            </div> : null}

            <div className="ax-codes">
              <label className="ax-label">DNI
                <input className={`ax-code${field === "dni" ? " is-active" : ""}`} value={documentNumber} onFocus={() => setField("dni")} onChange={(e) => updateDocument(e.target.value)} inputMode="numeric" autoComplete="off" placeholder="8 dígitos" aria-label="DNI" />
              </label>
              <label className="ax-label">PIN
                <input ref={pinInput} className={`ax-code${field === "pin" ? " is-active" : ""}`} type="password" value={pin} onFocus={() => setField("pin")} onChange={(e) => updatePin(e.target.value)} inputMode="numeric" autoComplete="off" placeholder="••••" aria-label="PIN personal de 4 dígitos" />
              </label>
            </div>

            <div className="ax-keypad" role="group" aria-label="Teclado numérico">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((key) => <button key={key} type="button" onClick={() => press(key)}>{key}</button>)}
              <button type="button" onClick={() => press("clear")} style={{ fontSize: 13, fontWeight: 500 }}>Borrar</button>
              <button type="button" onClick={() => press("0")}>0</button>
              <button type="button" onClick={() => press("back")} aria-label="Borrar un dígito"><Delete /></button>
            </div>

            <div className="ax-actions">
              <button className="ax-btn ax-btn--line" type="button" onClick={() => { reset(); setStatus(null); }}>Cancelar</button>
              <button className="ax-btn" type="submit" disabled={!ready}>{lookupLoading ? "Buscando trabajador…" : submitting ? "Registrando…" : "Marcar asistencia"}</button>
            </div>
          </form>
        </section>
      </div>
      <footer className="ax-clock-foot">Si olvidaste tu PIN, pídelo en Recepción o a la administración.</footer>
    </div>
  );
}

function AttendanceSummary({ record, currentTime }) {
  const checkIn = record.checkIn || record.clockIn;
  const checkOut = record.checkOut || record.clockOut;
  return <div className="ax-times">
    <TimeMetric label="Entrada" value={formatClockTime(checkIn)} />
    <TimeMetric label="Salida" value={checkOut ? formatClockTime(checkOut) : "En turno"} />
    <TimeMetric label="Tiempo" value={formatDuration(checkIn, checkOut, currentTime)} />
  </div>;
}

function TimeMetric({ label, value }) {
  return <div><small>{label}</small><b>{value}</b></div>;
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
