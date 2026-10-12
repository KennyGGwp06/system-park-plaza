// Control del sistema › Configuración general. Datos del hotel que salen en comprobantes y en la app del cliente
// (nombre comercial, razón social, RUC, dirección, contacto), los números de Yape y Plin a los que pagan los clientes,
// moneda, zona horaria e IGV. Cada cambio queda en la
// auditoría con el antes y el después. Rutas: GET/PUT /api/configuracion (solo esos campos se pueden cambiar).
import { useEffect, useState } from "react";
import { Settings } from "lucide-react";
import { api } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Alert, Card, Field, PageHead, useBusy, useToast, whenText } from "./kit";

const FIELDS = ["hotelName", "legalName", "ruc", "address", "phone", "email", "currency", "timezone", "taxRate", "yapeNumber", "plinNumber", "payHolder", "fiscalAddress", "ubigeo", "district", "province", "department", "receiptSeries", "invoiceSeries"];
const validRuc = (ruc) => /^(10|15|16|17|20)\d{9}$/.test(ruc) && (11 - ([5, 4, 3, 2, 7, 6, 5, 4, 3, 2].reduce((sum, weight, index) => sum + weight * Number(ruc[index]), 0) % 11)) % 10 === Number(ruc[10]);

export function SettingsPage({ navigate }) {
  const fetched = useFetch("/configuracion", { initialData: null, realtime: false });
  // GET /api/configuracion responde [ajustes] (una lista con un solo objeto).
  const settings = { ...fetched, data: Array.isArray(fetched.data) ? fetched.data[0] || {} : fetched.data };
  const show = useToast();
  const { busy, error, setError, run } = useBusy();
  const [form, setForm] = useState(null);
  useEffect(() => { if (settings.data) setForm(Object.fromEntries(FIELDS.map((key) => [key, settings.data[key] ?? ""]))); }, [settings.data]);
  if (!form) return <LoadingSpinner label="Cargando la configuración…" />;
  const set = (patch) => setForm({ ...form, ...patch });
  const changed = FIELDS.filter((key) => String(form[key] ?? "") !== String(settings.data[key] ?? ""));
  const save = () => { if (form.ruc && !validRuc(form.ruc)) { setError("El RUC no es válido: revisa los 11 dígitos (el último es verificador)."); return; } if (form.ubigeo && !/^\d{6}$/.test(form.ubigeo)) { setError("El ubigeo tiene 6 dígitos."); return; } if (form.receiptSeries && !/^B[A-Z0-9]{3}$/.test(form.receiptSeries)) { setError("La serie de boletas empieza con B y tiene 4 caracteres (B001)."); return; } if (form.invoiceSeries && !/^F[A-Z0-9]{3}$/.test(form.invoiceSeries)) { setError("La serie de facturas empieza con F y tiene 4 caracteres (F001)."); return; } if ([form.yapeNumber, form.plinNumber].some((value) => value && !/^9\d{8}$/.test(value))) { setError("Los números de Yape y Plin son celulares de 9 dígitos que empiezan con 9."); return; } run(async () => { await api("/configuracion", { method: "PUT", body: { ...form, taxRate: Number(form.taxRate) } }); show("Configuración guardada. El cambio quedó en la auditoría."); settings.reload(); }); };
  return <>
    <PageHead title="Configuración general" tools={<button className="rx-btn rx-btn--primary" type="button" disabled={busy || !changed.length} onClick={save}>Guardar {changed.length ? `(${changed.length})` : ""}</button>}>Los datos del hotel que salen en boletas, facturas y en la app del cliente. Precios, horarios y aforos se configuran en Catálogo y precios.</PageHead>
    {error ? <div style={{ marginBottom: 12 }}><Alert tone="crit">{error}</Alert></div> : null}
    <div className="rx-grid rx-g-2">
      <Card title="Identidad del negocio" subtitle="Aparece en comprobantes y en la app">
        <div className="ow-form">
          <Field label="Nombre comercial" full><input className="rx-input" value={form.hotelName} onChange={(event) => set({ hotelName: event.target.value })} /></Field>
          <Field label="Razón social" full><input className="rx-input" value={form.legalName} onChange={(event) => set({ legalName: event.target.value })} /></Field>
          <Field label="RUC"><input className="rx-input rx-mono" inputMode="numeric" maxLength={11} value={form.ruc} onChange={(event) => set({ ruc: event.target.value.replace(/\D/g, "") })} /></Field>
          <Field label="Teléfono"><input className="rx-input" value={form.phone} onChange={(event) => set({ phone: event.target.value })} /></Field>
          <Field label="Correo" full><input className="rx-input" type="email" value={form.email} onChange={(event) => set({ email: event.target.value })} /></Field>
          <Field label="Dirección" full><input className="rx-input" value={form.address} onChange={(event) => set({ address: event.target.value })} /></Field>
        </div>
      </Card>
      <Card title="Facturación electrónica" subtitle="Datos del emisor en boletas, facturas y notas de crédito">
        <div className="ow-form">
          <Field label="Dirección fiscal" full><input className="rx-input" placeholder="Como figura en la ficha RUC" value={form.fiscalAddress} onChange={(event) => set({ fiscalAddress: event.target.value })} /></Field>
          <Field label="Ubigeo"><input className="rx-input rx-mono" inputMode="numeric" maxLength={6} placeholder="250101" value={form.ubigeo} onChange={(event) => set({ ubigeo: event.target.value.replace(/\D/g, "") })} /></Field>
          <Field label="Distrito"><input className="rx-input" placeholder="CALLERIA" value={form.district} onChange={(event) => set({ district: event.target.value.toUpperCase() })} /></Field>
          <Field label="Provincia"><input className="rx-input" placeholder="CORONEL PORTILLO" value={form.province} onChange={(event) => set({ province: event.target.value.toUpperCase() })} /></Field>
          <Field label="Departamento"><input className="rx-input" placeholder="UCAYALI" value={form.department} onChange={(event) => set({ department: event.target.value.toUpperCase() })} /></Field>
          <Field label="Serie de boletas"><input className="rx-input rx-mono" maxLength={4} placeholder="B001" value={form.receiptSeries} onChange={(event) => set({ receiptSeries: event.target.value.toUpperCase() })} /></Field>
          <Field label="Serie de facturas"><input className="rx-input rx-mono" maxLength={4} placeholder="F001" value={form.invoiceSeries} onChange={(event) => set({ invoiceSeries: event.target.value.toUpperCase() })} /></Field>
        </div>
        <p className="ow-mini">El RUC y la razón social se toman de «Identidad del negocio». Las notas de crédito usan las series BC01 y FC01. La conexión real con SUNAT (OSE/PSE y certificado digital) se activa en el servidor.</p>
      </Card>
      <Card title="Cobros por Yape y Plin" subtitle="La app del cliente muestra estos números al pagar">
        <div className="ow-form">
          <Field label="Celular de Yape"><input className="rx-input rx-mono" inputMode="numeric" maxLength={9} placeholder="9 dígitos" value={form.yapeNumber} onChange={(event) => set({ yapeNumber: event.target.value.replace(/\D/g, "") })} /></Field>
          <Field label="Celular de Plin"><input className="rx-input rx-mono" inputMode="numeric" maxLength={9} placeholder="9 dígitos" value={form.plinNumber} onChange={(event) => set({ plinNumber: event.target.value.replace(/\D/g, "") })} /></Field>
          <Field label="Titular que ve el cliente" full><input className="rx-input" placeholder="Ej.: Hotel Park Plaza" value={form.payHolder} onChange={(event) => set({ payHolder: event.target.value })} /></Field>
        </div>
        <p className="ow-mini">Sin número configurado, la app pide al cliente pagar en la caja del hotel.</p>
      </Card>
      <Card title="Reglas generales" subtitle="Afectan precios, comprobantes y horas del sistema">
        <div className="ow-form">
          <Field label="IGV (%)"><input className="rx-input rx-mono" type="number" min="0" max="100" step="0.01" value={form.taxRate} onChange={(event) => set({ taxRate: event.target.value })} /></Field>
          <Field label="Moneda"><select className="rx-select" value={form.currency} onChange={(event) => set({ currency: event.target.value })}><option value="PEN">Soles (PEN)</option><option value="USD">Dólares (USD)</option></select></Field>
          <Field label="Zona horaria" full><select className="rx-select" value={form.timezone} onChange={(event) => set({ timezone: event.target.value })}><option value="America/Lima">Lima (UTC−5)</option></select></Field>
        </div>
        <p className="ow-mini">Última actualización: {settings.data.updatedAt ? whenText(settings.data.updatedAt) : "—"}.</p>
        <div className="ow-toolbar" style={{ marginTop: 6 }}><button className="rx-btn rx-btn--sm" type="button" onClick={() => navigate("catalogo", "servicios")}><Settings />Servicios, tarifas y aforos</button><button className="rx-btn rx-btn--sm" type="button" onClick={() => navigate("insumos", "necesidades")}>Hora de cierre de Cocina y Bar</button><button className="rx-btn rx-btn--sm" type="button" onClick={() => navigate("equipo", "torre")}>Reglas del personal</button></div>
      </Card>
    </div>
  </>;
}
