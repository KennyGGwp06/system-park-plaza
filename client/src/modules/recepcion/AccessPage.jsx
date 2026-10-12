// Accesos › Control de accesos. Une "Validar pases QR" e "Ingreso a piscina" (antes dos módulos):
//  · Validar pase: consulta el QR (cámara o código), muestra titular y servicios, y confirma el ingreso
//    (POST /api/access/preview y /api/access/validate; Hospedaje se confirma con el check-in).
//  · Ingreso sin reserva a Piscina: registro manual de huéspedes o visitantes (POST /api/pool, PATCH /api/pool/:id/finish).
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, Keyboard, LogOut, QrCode, ScanLine, Search, ShieldAlert, Waves } from "lucide-react";
import { api } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { Alert, Empty, PageHead, Tag, dateShort, serviceOf, timeOf, todayKey, useShift, useToast } from "./rxkit";

const READY = ["LISTO_INGRESO", "ACTIVO"];
const ENTRY_TYPES = [["HUESPED", "Huésped"], ["CLIENTE_EXTERNO", "Visitante"], ["EVENTO", "Invitado de evento"]];

export function AccessPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("vista") === "piscina" ? "piscina" : "qr";
  const { active, openClock } = useShift();
  return <>
    <PageHead title="Control de accesos" tools={<div className="rx-seg" role="tablist">
      <button type="button" role="tab" aria-selected={tab === "qr"} className={tab === "qr" ? "is-on" : ""} onClick={() => setParams({})}><QrCode size={15} />Validar pase</button>
      <button type="button" role="tab" aria-selected={tab === "piscina"} className={tab === "piscina" ? "is-on" : ""} onClick={() => setParams({ vista: "piscina" })}><Waves size={15} />Ingreso sin reserva · Piscina</button>
    </div>}>{tab === "qr" ? "Lee el pase del cliente, revisa qué compró y confirma solo el ingreso que usará ahora." : "Registra a quien entra a la piscina sin pase (huésped o visitante) y su salida."}</PageHead>
    {!active ? <div style={{ marginBottom: 14 }}><Alert tone="warn"><b>Inicia tu turno para validar ingresos.</b> <button className="rx-btn rx-btn--dark rx-btn--sm" type="button" onClick={openClock} style={{ marginLeft: 6 }}>Iniciar turno</button></Alert></div> : null}
    {tab === "qr" ? <PassValidation /> : <PoolDesk />}
  </>;
}

function PassValidation() {
  const show = useToast();
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState(null);
  const [selected, setSelected] = useState(null);
  const [people, setPeople] = useState(1);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState(false);
  const videoRef = useRef(null); const streamRef = useRef(null); const frameRef = useRef(null);
  const logs = useFetch("/access/logs", { initialData: [], realtime: true, pollInterval: 20000 });
  const today = todayKey();
  const todayLogs = (logs.data || []).filter((row) => String(row.validatedAt || "").slice(0, 10) === today || new Date(row.validatedAt).toLocaleDateString("en-CA", { timeZone: "America/Lima" }) === today).slice(-12).reverse();
  useEffect(() => () => stopCamera(), []);
  const services = useMemo(() => (preview?.entitlements || []).filter((item) => !["FINALIZADO"].includes(item.status)), [preview]);

  async function lookup(raw = code) {
    const clean = String(raw || "").trim();
    if (!clean) { setError("Escanea o escribe el código del pase."); return; }
    setBusy(true); setError(""); setResult(null); setPreview(null); setSelected(null);
    try {
      const data = await api("/access/preview", { method: "POST", body: { code: clean } });
      setCode(clean); setPreview(data);
      const first = data.entitlements?.find((item) => READY.includes(item.status) && item.serviceCode !== "HOSPEDAJE") || null;
      setSelected(first); setPeople(Math.max(1, Number(first?.people || 1)));
    } catch (cause) { setError(cause.message || "No se pudo consultar el pase."); } finally { setBusy(false); }
  }
  async function startCamera() {
    if (!("BarcodeDetector" in window)) { setError("Este navegador no lee QR con la cámara. Escribe el código del pase."); return; }
    try {
      setError(""); streamRef.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      videoRef.current.srcObject = streamRef.current; await videoRef.current.play(); setCamera(true); scan();
    } catch { setError("No se pudo abrir la cámara. Revisa el permiso del navegador."); }
  }
  async function scan() {
    if (!streamRef.current || !videoRef.current) return;
    try { const found = await new window.BarcodeDetector({ formats: ["qr_code"] }).detect(videoRef.current); if (found[0]?.rawValue) { stopCamera(); lookup(found[0].rawValue); return; } } catch { /* siguiente cuadro */ }
    frameRef.current = requestAnimationFrame(scan);
  }
  function stopCamera() { if (frameRef.current) cancelAnimationFrame(frameRef.current); streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null; setCamera(false); }
  async function validate() {
    setBusy(true); setError("");
    try {
      const value = await api("/access/validate", { method: "POST", body: { code: code.trim(), serviceCode: selected.serviceCode, people: Number(people) } });
      setResult(value); setPreview(null); logs.reload();
      show(`Ingreso confirmado: ${value.client.firstName} ${value.client.lastName} · ${serviceOf(value.entitlement.serviceCode).name}.`);
    } catch (cause) { setError(cause.message || "No se pudo confirmar el ingreso."); } finally { setBusy(false); }
  }
  const reset = () => { setCode(""); setPreview(null); setResult(null); setSelected(null); setError(""); };

  return <div className="rx-grid rx-g-2">
    <div className="rx-stack">
      <section className="rx-card">
        <div className="rx-card-h"><div><h2>1. Leer el pase</h2><p>Con la cámara del equipo o escribiendo el código impreso bajo el QR</p></div></div>
        <div className="rx-card-b" style={{ display: "grid", gap: 12 }}>
          <div style={{ position: "relative", height: 220, borderRadius: 8, border: "1px dashed var(--blue-line)", background: "var(--blue-soft)", display: "grid", placeItems: "center", overflow: "hidden" }}>
            <video ref={videoRef} muted playsInline style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: camera ? "block" : "none" }} />
            {!camera ? <div style={{ textAlign: "center", color: "var(--deep)" }}><ScanLine size={34} /><p style={{ margin: "6px 0 10px", fontSize: 13 }}>Coloca el QR frente a la cámara</p><button className="rx-btn rx-btn--dark rx-btn--sm" type="button" onClick={startCamera}><ScanLine />Activar cámara</button></div> : <button className="rx-btn rx-btn--sm" type="button" onClick={stopCamera} style={{ position: "absolute", bottom: 10 }}>Detener cámara</button>}
          </div>
          <form style={{ display: "flex", gap: 8 }} onSubmit={(event) => { event.preventDefault(); lookup(); }}>
            <div className="rx-search" style={{ margin: 0, width: "auto", flex: 1 }}><label style={{ background: "#fff" }}><Keyboard size={15} /><input value={code} onChange={(event) => setCode(event.target.value)} placeholder="Código del pase, ej. PP-ABC123" aria-label="Código del pase" /></label></div>
            <button className="rx-btn rx-btn--primary" type="submit" disabled={busy}><Search />Consultar</button>
          </form>
          {error ? <Alert tone="crit">{error}</Alert> : null}
        </div>
      </section>
      <section className="rx-card">
        <div className="rx-card-h"><div><h2>Ingresos validados hoy</h2><p>{todayLogs.length} registro(s)</p></div></div>
        {todayLogs.length ? <ul className="rx-list">{todayLogs.map((row) => { const Icon = serviceOf(row.serviceCode).icon; return <li key={row.id}><span className="rx-ico"><Icon /></span><div className="grow"><b>{serviceOf(row.serviceCode).name} · {row.people} persona(s)</b><small>Pase #{row.passId} · {timeOf(row.validatedAt)}</small></div><Tag tone="ok">Ingresó</Tag></li>; })}</ul> : <Empty icon={QrCode} title="Aún no hay ingresos validados hoy" />}
      </section>
    </div>

    <section className="rx-card">
      <div className="rx-card-h"><div><h2>2. Revisar y confirmar</h2><p>Titular, servicio comprado, pago y cantidad de personas</p></div></div>
      <div className="rx-card-b" style={{ display: "grid", gap: 12 }}>
        {result ? <>
          <Alert tone="ok"><b>Ingreso confirmado.</b> {result.client.firstName} {result.client.lastName} · {serviceOf(result.entitlement.serviceCode).name} · {result.entitlement.people} persona(s) · {timeOf(result.log?.validatedAt)}</Alert>
          <button className="rx-btn" type="button" onClick={reset} style={{ justifySelf: "start" }}>Validar otro pase</button>
        </> : preview ? <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
            <div><span className="rx-eyebrow">Pase {preview.pass.code}</span><h3 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>{preview.client.firstName} {preview.client.lastName}</h3><small style={{ color: "var(--muted)" }}>DNI {preview.client.documentNumber}</small></div>
            <Tag tone={preview.pass.status === "REVOCADO" ? "crit" : "ok"}>{preview.pass.status === "REVOCADO" ? "Anulado" : "Vigente"}</Tag>
          </div>
          <div className="rx-checks">{services.map((item) => {
            const ready = READY.includes(item.status) && !item.usedAt;
            const lodging = item.serviceCode === "HOSPEDAJE";
            const Icon = serviceOf(item.serviceCode).icon;
            return <button key={item.id} type="button" onClick={() => !lodging && ready && (setSelected(item), setPeople(Math.max(1, Number(item.people || 1))))} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: 0, borderBottom: "1px solid var(--line-2)", background: selected?.id === item.id ? "var(--blue-soft)" : "#fff", textAlign: "left", cursor: !lodging && ready ? "pointer" : "default", font: "inherit", color: "inherit" }}>
              <Icon size={17} color="#0F4C9E" /><span className="grow" style={{ flex: 1 }}><b style={{ fontWeight: 600 }}>{serviceOf(item.serviceCode).name}</b><small style={{ display: "block", color: "var(--muted)" }}>{item.date ? dateShort(item.date) : ""}{item.slot ? ` · ${item.slot}` : ""} · {item.people} persona(s){lodging ? " · se confirma con el check-in" : ""}</small></span>
              <Tag tone={item.usedAt ? "off" : ready ? "ok" : "warn"}>{item.usedAt ? `Usado ${timeOf(item.usedAt)}` : ready ? "Listo" : item.status === "PENDIENTE" ? "Falta pago" : String(item.status).replaceAll("_", " ").toLowerCase()}</Tag>
            </button>;
          })}</div>
          {selected ? <div style={{ display: "flex", gap: 10, alignItems: "end" }}>
            <label className="rx-field" style={{ width: 140 }}><span>Personas que entran</span><input className="rx-input" type="number" min="1" max={selected.people} value={people} onChange={(event) => setPeople(event.target.value)} /></label>
            <button className="rx-btn rx-btn--primary" type="button" onClick={validate} disabled={busy}><CheckCircle2 />Confirmar ingreso a {serviceOf(selected.serviceCode).name}</button>
          </div> : <Alert tone="warn">Este pase no tiene un servicio listo para ingresar ahora. Si falta el pago, cóbralo en Cobros pendientes.</Alert>}
        </> : <Empty icon={ShieldAlert} title="Esperando un pase">Al leer el QR aparecerán el titular, los servicios comprados y el botón para confirmar.</Empty>}
      </div>
    </section>
  </div>;
}

function PoolDesk() {
  const show = useToast();
  const { data, reload } = useFetch("/pool", { initialData: [], realtime: true, pollInterval: 20000 });
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState([]);
  const [form, setForm] = useState({ clientId: "", clientLabel: "", type: "HUESPED", people: 1 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!query.trim() || query === form.clientLabel) { setOptions([]); return undefined; }
    const timer = window.setTimeout(async () => setOptions((await api(`/pool/client-search?q=${encodeURIComponent(query.trim())}`).catch(() => [])).slice(0, 6)), 250);
    return () => window.clearTimeout(timer);
  }, [query, form.clientLabel]);
  const rows = data || [];
  const inside = rows.filter((row) => row.status === "ACTIVO");
  const todayRows = rows.filter((row) => String(row.enteredAt || "").slice(0, 10) === todayKey() && row.status !== "ACTIVO").slice(0, 10);

  async function register() {
    if (!form.clientId) { setError("Busca y elige al cliente (si es nuevo, regístralo en Clientes)."); return; }
    setBusy(true); setError("");
    try { await api("/pool", { method: "POST", body: { clientId: form.clientId, type: form.type, people: Number(form.people) } }); show(`Ingreso a piscina registrado: ${form.clientLabel}.`); setForm({ clientId: "", clientLabel: "", type: "HUESPED", people: 1 }); setQuery(""); reload(); }
    catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }
  async function finish(row) {
    try { await api(`/pool/${row.id}/finish`, { method: "PATCH" }); show("Salida de piscina registrada."); reload(); } catch (cause) { setError(cause.message); }
  }
  const nameOf = (row) => row.client ? `${row.client.firstName} ${row.client.lastName}` : "Visitante";
  const typeLabel = (value) => (ENTRY_TYPES.find(([key]) => key === value) || [null, value])[1];

  return <div className="rx-grid rx-g-2">
    <section className="rx-card">
      <div className="rx-card-h"><div><h2>Dentro de la piscina ahora</h2><p>{inside.length} registro(s) · {inside.reduce((sum, row) => sum + Number(row.people || 0), 0)} persona(s)</p></div></div>
      {inside.length ? <div className="rx-table-wrap"><table className="rx-table">
        <thead><tr><th>Cliente</th><th>Tipo</th><th className="n">Pers.</th><th>Entró</th><th /></tr></thead>
        <tbody>{inside.map((row) => <tr key={row.id}><td><div className="rx-who"><b>{nameOf(row)}</b><small>{row.qrCode}</small></div></td><td>{typeLabel(row.type)}</td><td className="n">{row.people}</td><td className="mut">{timeOf(row.enteredAt)}</td><td className="n"><button className="rx-btn rx-btn--sm" type="button" onClick={() => finish(row)}><LogOut />Registrar salida</button></td></tr>)}</tbody>
      </table></div> : <Empty icon={Waves} title="Nadie registrado dentro de la piscina" />}
      {todayRows.length ? <><div className="rx-card-h" style={{ borderTop: "1px solid var(--line-2)" }}><div><h2>Salieron hoy</h2></div></div><ul className="rx-list">{todayRows.map((row) => <li key={row.id}><div className="grow"><b>{nameOf(row)}</b><small>{typeLabel(row.type)} · {row.people} pers. · {timeOf(row.enteredAt)} a {timeOf(row.finishedAt)}</small></div></li>)}</ul></> : null}
    </section>
    <section className="rx-card">
      <div className="rx-card-h"><div><h2>Registrar ingreso</h2><p>Para quien entra sin pase QR. Con pase, usa "Validar pase".</p></div></div>
      <div className="rx-card-b" style={{ display: "grid", gap: 10 }}>
        <div style={{ position: "relative" }}>
          <label className="rx-field"><span>Cliente</span><input className="rx-input" value={query} onChange={(event) => { setQuery(event.target.value); setForm({ ...form, clientId: "", clientLabel: "" }); }} placeholder="DNI o nombre" /></label>
          {options.length ? <div className="rx-search-pop" style={{ top: 60 }}>{options.map((client) => <button key={client.id} type="button" onClick={() => { const label = `${client.firstName} ${client.lastName}`; setForm({ ...form, clientId: client.id, clientLabel: label }); setQuery(label); setOptions([]); }}><span><b>{client.firstName} {client.lastName}</b><small>DNI {client.documentNumber}</small></span></button>)}</div> : null}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 10 }}>
          <label className="rx-field"><span>Tipo de ingreso</span><select className="rx-select" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>{ENTRY_TYPES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label className="rx-field"><span>Personas</span><input className="rx-input" type="number" min="1" value={form.people} onChange={(event) => setForm({ ...form, people: event.target.value })} /></label>
        </div>
        <button className="rx-btn rx-btn--primary" type="button" onClick={register} disabled={busy} style={{ justifySelf: "start" }}>Registrar ingreso</button>
        {error ? <Alert tone="crit">{error}</Alert> : null}
      </div>
    </section>
  </div>;
}
