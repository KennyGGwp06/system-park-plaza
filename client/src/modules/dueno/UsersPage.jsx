// Control del sistema › Usuarios. Cada persona que entra al sistema: su rol (qué estación ve), su DNI y PIN para marcar
// asistencia, su tarifa diaria (define la planilla), su contraseña y su estado. El último Superadmin activo no se puede
// quitar. Rutas: GET/POST /api/usuarios, PUT /api/usuarios/:id, GET /api/roles.
import { useMemo, useState } from "react";
import { KeyRound, Plus, UserCog } from "lucide-react";
import { api } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Alert, Card, Drawer, Empty, Field, Kpi, PageHead, SearchBox, Seg, Status, dayText, soles, useBusy, useOpenId, useToast } from "./kit";

export const ROLE_LABEL = { SUPERADMIN: "Dueño (Superadmin)", ADMINISTRADOR: "Recepción", RESTAURANTE: "Cocina", BARTENDER: "Bar", LIMPIEZA: "Limpieza", MANTENIMIENTO: "Mantenimiento", RECEPCION: "Recepción", OPERATIVO: "Operativo (sin acceso)" };

export function UsersPage() {
  const users = useFetch("/usuarios", { initialData: [], realtime: false });
  const roles = useFetch("/roles", { initialData: [], realtime: false });
  const [openId, open] = useOpenId();
  const [creating, setCreating] = useState(false);
  const [text, setText] = useState("");
  const [filter, setFilter] = useState("activos");
  const rows = (Array.isArray(users.data) ? users.data : []).filter((row) => row.position !== "CUENTA_HISTORICA_DESACTIVADA");
  const shown = useMemo(() => rows.filter((row) => (filter === "todos" || (filter === "activos" ? row.status === "ACTIVO" : row.status !== "ACTIVO")) && (!text.trim() || `${row.firstName} ${row.lastName} ${row.username} ${row.email} ${row.documentNumber}`.toLowerCase().includes(text.trim().toLowerCase()))).sort((a, b) => `${a.firstName}`.localeCompare(`${b.firstName}`, "es")), [rows, filter, text]);
  const byRole = Object.entries(rows.filter((row) => row.status === "ACTIVO").reduce((acc, row) => { const key = row.role?.name || row.role; acc[key] = (acc[key] || 0) + 1; return acc; }, {}));
  const selected = rows.find((row) => String(row.id) === openId) || null;
  if (users.loading && !rows.length) return <LoadingSpinner label="Cargando usuarios…" />;
  return <>
    <PageHead title="Usuarios" tools={<button className="rx-btn rx-btn--primary" type="button" onClick={() => setCreating(true)}><Plus />Nuevo trabajador</button>}>Quién entra al sistema y con qué rol. La contraseña sirve para entrar; el PIN de 4 dígitos, junto con el DNI, para marcar entrada y salida.</PageHead>
    <div className="rx-grid rx-g-4" style={{ marginBottom: 14 }}>
      <Kpi icon={UserCog} label="Usuarios activos" value={rows.filter((row) => row.status === "ACTIVO").length} detail={`${rows.length} registrados`} />
      {byRole.slice(0, 3).map(([role, count]) => <Kpi key={role} label={ROLE_LABEL[role] || role} value={count} detail="Activos" />)}
    </div>
    <Card title="Personas con acceso" flush tools={<><SearchBox value={text} onChange={setText} placeholder="Nombre, usuario o DNI" width={220} /><Seg value={filter} onChange={setFilter} options={[["activos", "Activos"], ["inactivos", "Inactivos"], ["todos", "Todos"]]} /></>}>
      {shown.length ? <div className="rx-table-wrap"><table className="rx-table"><thead><tr><th>Persona</th><th>Rol</th><th>DNI</th><th>Usuario</th><th className="n">Tarifa diaria</th><th>Ingreso</th><th>Estado</th></tr></thead>
        <tbody>{shown.map((row) => <tr key={row.id} className="is-click" onClick={() => open(row.id)}><td><b style={{ fontWeight: 600 }}>{row.firstName} {row.lastName}</b></td><td>{ROLE_LABEL[row.role?.name || row.role] || row.role?.name}</td><td className="mut rx-mono">{row.documentNumber || "—"}</td><td className="rx-mono">{row.username || row.email}</td><td className="n">{row.dailyRate != null ? soles(row.dailyRate) : "—"}</td><td className="mut">{row.hireDate ? dayText(String(row.hireDate).slice(0, 10)) : "—"}</td><td><Status value={row.status} /></td></tr>)}</tbody></table></div> : <Empty icon={UserCog} title="Sin usuarios con este filtro" />}
    </Card>
    {creating || selected ? <UserDrawer user={creating ? null : selected} roles={Array.isArray(roles.data) ? roles.data : []} onClose={() => { setCreating(false); open(null); }} onSaved={() => { setCreating(false); open(null); users.reload(); }} /> : null}
  </>;
}

function UserDrawer({ user, roles, onClose, onSaved }) {
  const show = useToast();
  const { busy, error, setError, run } = useBusy();
  const [form, setForm] = useState({ firstName: user?.firstName || "", lastName: user?.lastName || "", username: user?.username || "", email: user?.email || "", documentNumber: user?.documentNumber || "", phone: user?.phone || "", roleId: String(user?.roleId || user?.role?.id || ""), status: user?.status || "ACTIVO", dailyRate: String(user?.dailyRate ?? "60"), hireDate: String(user?.hireDate || "").slice(0, 10), position: user?.position || "", password: "", pin: "" });
  const set = (patch) => setForm({ ...form, ...patch });
  const save = () => {
    if (!form.firstName.trim() || !form.lastName.trim()) { setError("Completa nombre y apellido."); return; }
    if (!/^[a-z0-9._-]{3,30}$/.test(form.username)) { setError("El usuario tiene de 3 a 30 letras o números, sin espacios (ej.: recepcion2)."); return; }
    if (!/^\d{8}$/.test(form.documentNumber)) { setError("El DNI tiene 8 dígitos."); return; }
    if (!form.roleId) { setError("Elige el rol."); return; }
    if (!user && form.password.length < 3) { setError("La contraseña debe tener al menos 3 caracteres."); return; }
    if (user && form.password && form.password.length < 3) { setError("La nueva contraseña debe tener al menos 3 caracteres."); return; }
    if ((!user || form.pin) && !/^\d{4}$/.test(form.pin)) { setError("El PIN de asistencia tiene 4 dígitos."); return; }
    const payload = { ...form, roleId: Number(form.roleId), dailyRate: Number(form.dailyRate || 0), username: form.username };
    if (!payload.password) delete payload.password; if (!payload.pin) delete payload.pin;
    run(async () => { await api(user ? `/usuarios/${user.id}` : "/usuarios", { method: user ? "PUT" : "POST", body: payload }); show(user ? "Usuario actualizado." : "Trabajador creado. Entrégale su contraseña y su PIN en persona."); onSaved(); });
  };
  return <Drawer open onClose={onClose} busy={busy} eyebrow={user ? `Usuario: ${user.username || user.email}` : "Nuevo trabajador"} title={user ? `${user.firstName} ${user.lastName}` : "Dar acceso a una persona"} subtitle="El rol define qué estación ve al entrar"
    footer={<><button className="rx-btn" type="button" onClick={onClose} disabled={busy}>Cancelar</button><button className="rx-btn rx-btn--primary" type="button" onClick={save} disabled={busy}>{user ? "Guardar" : "Crear"}</button></>}>
    <div className="ow-form">
      <Field label="Nombres"><input className="rx-input" value={form.firstName} onChange={(event) => set({ firstName: event.target.value })} /></Field>
      <Field label="Apellidos"><input className="rx-input" value={form.lastName} onChange={(event) => set({ lastName: event.target.value })} /></Field>
      <Field label="DNI"><input className="rx-input rx-mono" inputMode="numeric" maxLength={8} value={form.documentNumber} onChange={(event) => set({ documentNumber: event.target.value.replace(/\D/g, "") })} /></Field>
      <Field label="Celular"><input className="rx-input" value={form.phone} onChange={(event) => set({ phone: event.target.value })} /></Field>
      <Field label="Usuario (para entrar)"><input className="rx-input rx-mono" autoCapitalize="none" spellCheck={false} placeholder="ej.: recepcion2" value={form.username} onChange={(event) => set({ username: event.target.value.toLowerCase().replace(/\s/g, "") })} /></Field>
      <Field label="Correo (opcional)"><input className="rx-input" type="email" value={form.email} onChange={(event) => set({ email: event.target.value })} /></Field>
      <Field label="Rol"><select className="rx-select" value={form.roleId} onChange={(event) => set({ roleId: event.target.value })}><option value="">Elige</option>{roles.map((role) => <option key={role.id} value={role.id}>{ROLE_LABEL[role.name] || role.name}</option>)}</select></Field>
      <Field label="Estado"><select className="rx-select" value={form.status} onChange={(event) => set({ status: event.target.value })}><option value="ACTIVO">Activo</option><option value="INACTIVO">Inactivo (no puede entrar)</option></select></Field>
      <Field label="Tarifa diaria (S/)"><input className="rx-input rx-mono" type="number" min="0" step="0.5" value={form.dailyRate} onChange={(event) => set({ dailyRate: event.target.value })} /></Field>
      <Field label="Fecha de ingreso"><input className="rx-input" type="date" value={form.hireDate} onChange={(event) => set({ hireDate: event.target.value })} /></Field>
    </div>
    <section className="rx-sec"><h3><KeyRound size={14} style={{ verticalAlign: -2 }} /> Acceso</h3><div className="ow-form">
      <Field label={user ? "Nueva contraseña (opcional)" : "Contraseña"}><input className="rx-input" type="password" autoComplete="new-password" value={form.password} onChange={(event) => set({ password: event.target.value })} /></Field>
      <Field label={user ? "Nuevo PIN de asistencia (opcional)" : "PIN de asistencia (4 dígitos)"}><input className="rx-input rx-mono" type="password" inputMode="numeric" maxLength={4} value={form.pin} onChange={(event) => set({ pin: event.target.value.replace(/\D/g, "") })} /></Field>
    </div><p className="ow-mini">Entrega la contraseña y el PIN en persona. Si cambias la contraseña, la anterior deja de funcionar al instante.</p></section>
    {error ? <Alert tone="crit">{error}</Alert> : null}
  </Drawer>;
}
