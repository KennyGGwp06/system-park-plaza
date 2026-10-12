// Recepción › Clientes. Buscar a una persona, registrarla (una sola ficha por documento), ver sus reservas y estado,
// bloquear o reactivar su cuenta, finalizar servicios que quedaron abiertos y eliminar una ficha de prueba (confirmando
// el documento). El historial completo con consumos lo ve el dueño en su Perfil 360°.
// Rutas: GET/POST /api/clients, PATCH /api/clients/:id/status, POST /:id/end-services, DELETE /api/clients/:id.
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Ban, ContactRound, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { api } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Alert, Drawer, Empty, Kpi, PageHead, Tag, money, useToast } from "./rxkit";

const SERVICE = { HOSPEDAJE: "Hospedaje", PISCINA: "Piscina", MIRADOR: "Mirador", TERRAZA: "Terraza", EVENTOS: "Eventos" };
const ACTIVE = ["RESERVADA", "CONFIRMADA", "CHECKED_IN", "EN_SERVICIO", "PENDIENTE_PAGO"];
const nameOf = (row) => `${row.firstName || ""} ${row.lastName || ""}`.trim() || "Sin nombre";

export function ClientsDeskPage() {
  const clients = useFetch("/clients", { initialData: [], realtime: true, pollInterval: 60000 });
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState("");
  const [creating, setCreating] = useState(false);
  const rows = Array.isArray(clients.data) ? clients.data : [];
  const shown = useMemo(() => rows.filter((row) => !text.trim() || `${nameOf(row)} ${row.documentNumber} ${row.phone} ${row.email}`.toLowerCase().includes(text.trim().toLowerCase())).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))), [rows, text]);
  const withActive = rows.filter((row) => (row.reservations || []).some((r) => ACTIVE.includes(r.status)));
  const selected = rows.find((row) => String(row.id) === params.get("cliente")) || null;
  if (clients.loading && !rows.length) return <LoadingSpinner label="Cargando clientes…" />;
  return <>
    <PageHead title="Clientes" tools={<button className="rx-btn rx-btn--primary" type="button" onClick={() => setCreating(true)}><Plus />Registrar cliente</button>}>Cada persona tiene una sola ficha por documento. Búscala antes de registrarla para no duplicarla.</PageHead>
    <div className="rx-grid rx-g-4" style={{ marginBottom: 14 }}>
      <Kpi icon={ContactRound} label="Clientes" value={rows.length} detail="Registrados" />
      <Kpi label="Con reservas activas" value={withActive.length} detail="Hoy o próximas" />
      <Kpi label="Bloqueados" value={rows.filter((row) => row.status === "BLOQUEADO").length} detail="No pueden reservar" />
      <Kpi label="Con saldo" value={rows.filter((row) => (row.reservations || []).some((r) => Number(r.balance) > 0 && ACTIVE.includes(r.status))).length} detail="Tienen algo por pagar" />
    </div>
    <section className="rx-card">
      <div className="rx-filters"><div className="rx-search" style={{ margin: 0, width: 340 }}><label style={{ background: "#fff" }}><Search size={15} /><input value={text} onChange={(event) => setText(event.target.value)} placeholder="Nombre, DNI, celular o correo" aria-label="Buscar cliente" /></label></div></div>
      {shown.length ? <div className="rx-table-wrap"><table className="rx-table"><thead><tr><th>Cliente</th><th>Documento</th><th>Celular</th><th>Reservas activas</th><th>Estado</th></tr></thead>
        <tbody>{shown.slice(0, 200).map((row) => { const active = (row.reservations || []).filter((r) => ACTIVE.includes(r.status)); return <tr key={row.id} className="is-click" onClick={() => setParams({ cliente: String(row.id) })}>
          <td><b style={{ fontWeight: 600 }}>{nameOf(row)}</b><small className="mut" style={{ display: "block" }}>{row.email || "Sin correo"}</small></td><td className="rx-mono mut">{row.documentType} {row.documentNumber || "—"}</td><td className="mut">{row.phone || "—"}</td>
          <td>{active.length ? active.map((r) => <Tag key={r.id} tone="info">{SERVICE[r.serviceCode] || r.serviceCode}</Tag>) : <span className="mut">—</span>}</td>
          <td><Tag tone={row.status === "BLOQUEADO" ? "crit" : row.status === "ACTIVO" ? "ok" : "off"}>{row.status === "BLOQUEADO" ? "Bloqueado" : row.status === "ACTIVO" ? "Activo" : String(row.status || "").toLowerCase()}</Tag></td>
        </tr>; })}</tbody></table></div> : <Empty icon={ContactRound} title={text ? "Nadie coincide con la búsqueda" : "Sin clientes"}>{text ? "Puedes registrarlo con el botón de arriba." : null}</Empty>}
    </section>
    {selected ? <ClientDrawer client={selected} onClose={() => setParams({})} onDone={() => clients.reload()} /> : null}
    {creating ? <NewClient initialQuery={text} onClose={() => setCreating(false)} onSaved={(row) => { setCreating(false); clients.reload(); setParams({ cliente: String(row.id) }); }} /> : null}
  </>;
}

function ClientDrawer({ client, onClose, onDone }) {
  const show = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState("");
  const act = async (work, message, after) => { setBusy(true); setError(""); try { await work(); show(message); onDone(); after?.(); } catch (cause) { setError(cause.message); } finally { setBusy(false); } };
  const reservations = (client.reservations || []).slice().sort((a, b) => String(b.date || b.checkIn).localeCompare(String(a.date || a.checkIn)));
  const blocked = client.status === "BLOQUEADO";
  return <Drawer open onClose={onClose} busy={busy} eyebrow={`${client.documentType} ${client.documentNumber || ""}`} title={nameOf(client)} subtitle={[client.phone, client.email].filter(Boolean).join(" · ") || "Sin contacto"}
    footer={<>{blocked ? <button className="rx-btn" type="button" disabled={busy} onClick={() => act(() => api(`/clients/${client.id}/status`, { method: "PATCH", body: { status: "ACTIVO", reason: "Cuenta reactivada" } }), "Cuenta reactivada.")}><RotateCcw />Reactivar</button> : <button className="rx-btn rx-btn--danger" type="button" disabled={busy} onClick={() => act(() => api(`/clients/${client.id}/status`, { method: "PATCH", body: { status: "BLOQUEADO", reason: "Cuenta deshabilitada desde Recepción" } }), "Cuenta bloqueada.")}><Ban />Bloquear</button>}<button className="rx-btn" type="button" disabled={busy} onClick={() => act(() => api(`/clients/${client.id}/end-services`, { method: "POST", body: { reason: "Finalizado manualmente desde Recepción" } }), "Servicios finalizados.")}>Finalizar servicios</button></>}>
    <div style={{ display: "flex", gap: 6 }}><Tag tone={blocked ? "crit" : "ok"}>{blocked ? "Bloqueado" : "Activo"}</Tag></div>
    <section className="rx-sec"><h3>Reservas ({reservations.length})</h3>{reservations.length ? <ul className="rx-list">{reservations.slice(0, 12).map((r) => <li key={r.id}><div className="grow"><b>{r.code} · {SERVICE[r.serviceCode] || r.serviceCode}</b><small>{r.checkIn || r.date}{r.checkOut ? ` → ${r.checkOut}` : ""}{r.room ? ` · hab. ${r.room.number}` : ""} · {money(r.total)}{Number(r.balance) > 0 ? ` · saldo ${money(r.balance)}` : ""}</small></div><Tag tone={ACTIVE.includes(r.status) ? "info" : "off"}>{String(r.status || "").replaceAll("_", " ").toLowerCase()}</Tag></li>)}</ul> : <p className="mut" style={{ margin: 0 }}>Sin reservas.</p>}</section>
    <section className="rx-sec"><h3>Eliminar ficha</h3><p style={{ margin: "0 0 6px", fontSize: 13 }}>Solo para fichas de prueba o duplicadas sin movimientos. Escribe el documento para confirmar.</p><div style={{ display: "flex", gap: 8 }}><input className="rx-input rx-mono" value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder={client.documentNumber || "Documento"} /><button className="rx-btn rx-btn--danger" type="button" disabled={busy || confirm !== client.documentNumber} onClick={() => act(() => api(`/clients/${client.id}`, { method: "DELETE", body: { confirmDocument: confirm } }), "Ficha eliminada.", onClose)}><Trash2 />Eliminar</button></div></section>
    {error ? <Alert tone="crit">{error}</Alert> : null}
  </Drawer>;
}

function NewClient({ initialQuery, onClose, onSaved }) {
  const show = useToast();
  const digits = /^\d+$/.test(String(initialQuery || "").trim()) ? initialQuery.trim() : "";
  const [form, setForm] = useState({ documentType: "DNI", documentNumber: digits, firstName: "", lastName: "", phone: "", email: "", address: "", status: "ACTIVO" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (patch) => setForm({ ...form, ...patch });
  const save = async () => {
    if (form.documentType === "DNI" && !/^\d{8}$/.test(form.documentNumber)) { setError("El DNI tiene 8 dígitos."); return; }
    if (!form.firstName.trim() || !form.lastName.trim()) { setError("Pon nombres y apellidos."); return; }
    if (form.phone && !/^\d{9}$/.test(form.phone)) { setError("El celular tiene 9 dígitos."); return; }
    setBusy(true); setError("");
    try { const row = await api("/clients", { method: "POST", body: form }); show("Cliente registrado."); onSaved(row); } catch (cause) { setError(cause.message); } finally { setBusy(false); }
  };
  return <Drawer open onClose={onClose} busy={busy} eyebrow="Nuevo cliente" title="Registrar cliente" subtitle="Una sola ficha por documento" footer={<><button className="rx-btn" type="button" onClick={onClose} disabled={busy}>Cancelar</button><button className="rx-btn rx-btn--primary" type="button" onClick={save} disabled={busy}>Registrar</button></>}>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      <label className="rx-field"><span>Tipo de documento</span><select className="rx-select" value={form.documentType} onChange={(event) => set({ documentType: event.target.value })}><option value="DNI">DNI</option><option value="CE">Carné de extranjería</option><option value="PASAPORTE">Pasaporte</option><option value="RUC">RUC</option></select></label>
      <label className="rx-field"><span>Número</span><input className="rx-input rx-mono" value={form.documentNumber} onChange={(event) => set({ documentNumber: event.target.value.replace(/\s/g, "") })} /></label>
      <label className="rx-field"><span>Nombres</span><input className="rx-input" value={form.firstName} onChange={(event) => set({ firstName: event.target.value })} /></label>
      <label className="rx-field"><span>Apellidos</span><input className="rx-input" value={form.lastName} onChange={(event) => set({ lastName: event.target.value })} /></label>
      <label className="rx-field"><span>Celular</span><input className="rx-input" inputMode="numeric" maxLength={9} value={form.phone} onChange={(event) => set({ phone: event.target.value.replace(/\D/g, "") })} /></label>
      <label className="rx-field"><span>Correo (opcional)</span><input className="rx-input" type="email" value={form.email} onChange={(event) => set({ email: event.target.value })} /></label>
      <label className="rx-field" style={{ gridColumn: "1 / -1" }}><span>Dirección (opcional)</span><input className="rx-input" value={form.address} onChange={(event) => set({ address: event.target.value })} /></label>
    </div>
    {error ? <Alert tone="crit">{error}</Alert> : null}
  </Drawer>;
}
