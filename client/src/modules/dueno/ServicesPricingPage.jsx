// Catálogo y precios › Servicios y tarifas. Precio y aforo de cada servicio (lo que ve y paga el cliente), los
// adicionales de cada reserva (planes, extras, pases), la cochera y los ambientes para eventos. Cada cambio de precio
// queda en la auditoría con el antes y el después. Rutas: GET/PUT /api/admin/commercial-settings.
import { useEffect, useState } from "react";
import { Plus, Sparkles, Trash2 } from "lucide-react";
import { api } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Alert, Card, Field, PageHead, Seg, soles, useBusy, useToast } from "./kit";

const GROUP = { HOSPEDAJE: "Hospedaje", PISCINA: "Piscina", MIRADOR: "Mirador", TERRAZA: "Terraza", EVENTOS: "Eventos", BAR: "Bar", EXTRAS_HOSPEDAJE: "Extras de hospedaje", EXTRAS_PISCINA: "Extras de piscina", EXTRAS_MIRADOR: "Extras del mirador", EXTRAS_TERRAZA: "Extras de terraza", EQUIPO_EVENTO: "Equipo para eventos" };
const VEHICLE = { AUTO: "Auto", MOTO: "Moto", MINIVAN: "Minivan", CAMIONETA: "Camioneta" };

export function ServicesPricingPage({ navigate }) {
  const settings = useFetch("/admin/commercial-settings", { initialData: null, realtime: false });
  const show = useToast();
  const { busy, error, run } = useBusy();
  const [draft, setDraft] = useState(null);
  const [group, setGroup] = useState("HOSPEDAJE");
  const fromData = () => structuredClone({ services: settings.data.services, experiencePricing: settings.data.experiencePricing || {}, parkingRates: settings.data.parkingRates || {}, eventSpaces: settings.data.eventSpaces || [] });
  useEffect(() => { if (settings.data) setDraft(fromData()); }, [settings.data]);
  if (!draft) return <LoadingSpinner label="Cargando servicios y tarifas…" />;
  const dirty = JSON.stringify(draft) !== JSON.stringify(fromData());
  const setService = (code, patch) => setDraft({ ...draft, services: draft.services.map((row) => (row.code === code ? { ...row, ...patch } : row)) });
  const extras = draft.experiencePricing[group] || [];
  const setExtra = (index, patch) => setDraft({ ...draft, experiencePricing: { ...draft.experiencePricing, [group]: extras.map((row, i) => (i === index ? { ...row, ...patch } : row)) } });
  const addExtra = () => setDraft({ ...draft, experiencePricing: { ...draft.experiencePricing, [group]: [...extras, { id: `CUSTOM_${Date.now()}`, code: `CUSTOM_${Date.now()}`, name: "Nuevo adicional", description: "", price: 0, active: true }] } });
  const removeExtra = (index) => setDraft({ ...draft, experiencePricing: { ...draft.experiencePricing, [group]: extras.filter((_, i) => i !== index) } });
  const setSpace = (index, patch) => setDraft({ ...draft, eventSpaces: draft.eventSpaces.map((row, i) => (i === index ? { ...row, ...patch } : row)) });
  const save = () => run(async () => { await api("/admin/commercial-settings", { method: "PUT", body: { ...draft, services: draft.services.map((row) => ({ ...row, price: Number(row.price), capacity: row.capacity === "" || row.capacity == null ? null : Number(row.capacity) })), parkingRates: Object.fromEntries(Object.entries(draft.parkingRates).map(([k, v]) => [k, Number(v)])), eventSpaces: draft.eventSpaces.map((row) => ({ ...row, capacity: Number(row.capacity), basePrice: Number(row.basePrice) })) } }); show("Precios guardados. El cliente los ve al instante y el cambio quedó en la auditoría."); settings.reload(); });
  return <>
    <PageHead title="Servicios y tarifas" tools={<><button className="rx-btn" type="button" disabled={!dirty || busy} onClick={() => setDraft(fromData())}>Descartar</button><button className="rx-btn rx-btn--primary" type="button" disabled={!dirty || busy} onClick={save}>Guardar cambios</button></>}>Lo que el cliente ve y paga en cada servicio. El precio de las habitaciones está en Habitaciones y el de cada plato o bebida en Carta del cliente.</PageHead>
    {dirty ? <div style={{ marginBottom: 12 }}><Alert tone="warn">Tienes cambios sin guardar.</Alert></div> : null}
    {error ? <div style={{ marginBottom: 12 }}><Alert tone="crit">{error}</Alert></div> : null}
    <Card title="Precio y aforo por servicio" subtitle="Aforo = personas por horario (vacío si no aplica)" flush style={{ marginBottom: 14 }}>
      <div className="rx-table-wrap"><table className="rx-table"><thead><tr><th>Servicio</th><th>Descripción que ve el cliente</th><th className="n">Precio base (S/)</th><th className="n">Aforo</th></tr></thead>
        <tbody>{draft.services.map((row) => <tr key={row.code}><td style={{ width: 200 }}><input className="rx-input" value={row.name} onChange={(event) => setService(row.code, { name: event.target.value })} /></td><td><input className="rx-input" style={{ width: "100%" }} value={row.description} onChange={(event) => setService(row.code, { description: event.target.value })} /></td><td className="n" style={{ width: 130 }}><input className="rx-input rx-mono" style={{ textAlign: "right", width: 110 }} type="number" min="0" step="0.5" value={row.price} onChange={(event) => setService(row.code, { price: event.target.value })} /></td><td className="n" style={{ width: 110 }}><input className="rx-input rx-mono" style={{ textAlign: "right", width: 90 }} type="number" min="1" value={row.capacity ?? ""} placeholder="—" onChange={(event) => setService(row.code, { capacity: event.target.value })} /></td></tr>)}</tbody></table></div>
    </Card>
    <Card title="Adicionales de reserva" subtitle="Planes, extras y pases que el cliente elige al reservar" tools={<Seg value={group} onChange={setGroup} options={Object.keys(draft.experiencePricing).map((key) => [key, GROUP[key] || key, (draft.experiencePricing[key] || []).length])} />} flush style={{ marginBottom: 14 }}>
      <div className="rx-table-wrap"><table className="rx-table"><thead><tr><th>Nombre</th><th>Qué incluye</th><th className="n">Precio (S/)</th><th>Activo</th><th /></tr></thead>
        <tbody>{extras.map((row, index) => <tr key={row.id || index}><td style={{ width: 220 }}><input className="rx-input" value={row.name} onChange={(event) => setExtra(index, { name: event.target.value })} /></td><td><input className="rx-input" style={{ width: "100%" }} value={row.description || ""} onChange={(event) => setExtra(index, { description: event.target.value })} /></td><td className="n" style={{ width: 120 }}><input className="rx-input rx-mono" style={{ textAlign: "right", width: 100 }} type="number" min="0" step="0.5" value={row.price} onChange={(event) => setExtra(index, { price: Number(event.target.value) })} /></td><td style={{ width: 70 }}><button type="button" className={`ow-switch ${row.active !== false ? "is-on" : ""}`} onClick={() => setExtra(index, { active: row.active === false })} aria-label="Activo" /></td><td style={{ width: 40 }}><button className="rx-close" type="button" aria-label="Quitar" onClick={() => removeExtra(index)}><Trash2 size={14} /></button></td></tr>)}</tbody></table></div>
      <div className="rx-card-b"><button className="rx-btn rx-btn--ghost rx-btn--sm" type="button" onClick={addExtra}><Plus />Agregar adicional a {GROUP[group] || group}</button></div>
    </Card>
    <div className="ow-split">
      <Card title="Cochera" subtitle="Tarifa por vehículo y estadía">
        <div className="ow-form">{Object.entries(draft.parkingRates).map(([key, value]) => <Field key={key} label={`${VEHICLE[key] || key} (S/)`}><input className="rx-input rx-mono" type="number" min="0" step="0.5" value={value} onChange={(event) => setDraft({ ...draft, parkingRates: { ...draft.parkingRates, [key]: event.target.value } })} /></Field>)}</div>
      </Card>
      <Card title="Ambientes para eventos" subtitle="Capacidad y precio base de cada ambiente" flush>
        <div className="rx-table-wrap"><table className="rx-table"><thead><tr><th>Ambiente</th><th className="n">Capacidad</th><th className="n">Precio base</th></tr></thead>
          <tbody>{draft.eventSpaces.map((row, index) => <tr key={row.id}><td><input className="rx-input" value={row.name} onChange={(event) => setSpace(index, { name: event.target.value })} /><small className="mut">{row.description}</small></td><td className="n" style={{ width: 100 }}><input className="rx-input rx-mono" style={{ textAlign: "right" }} type="number" min="1" value={row.capacity} onChange={(event) => setSpace(index, { capacity: event.target.value })} /></td><td className="n" style={{ width: 120 }}><input className="rx-input rx-mono" style={{ textAlign: "right" }} type="number" min="0" value={row.basePrice} onChange={(event) => setSpace(index, { basePrice: event.target.value })} /></td></tr>)}</tbody></table></div>
      </Card>
    </div>
    <p className="ow-mini" style={{ marginTop: 12 }}><Sparkles size={13} style={{ verticalAlign: -2 }} /> Precios actuales de habitaciones: {(settings.data.roomTypes || []).map((row) => `${row.name} ${soles(row.price)}`).join(" · ")}. <button type="button" className="rx-link" style={{ border: 0, background: "none", padding: 0 }} onClick={() => navigate("catalogo", "habitaciones")}>Cambiarlos</button></p>
  </>;
}
