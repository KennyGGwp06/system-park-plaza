
import { CalendarDays, CheckCircle2, Eye, KeyRound, MoreVertical, Pencil, RefreshCw, Search, ShieldCheck, Trash2, UserPlus, UserRound, Users, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState } from "../../components/EmptyState";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { StatusBadge } from "../../components/StatusBadge";
import { Toast } from "../../components/Toast";
import { Button, PageHeader } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { useFetch } from "../../hooks/useFetch";
import { api } from "../../services/api";

const PAGE_SIZE = 10;
export function UsersPage() {
  const { user } = useAuth();
  const { data: usersData, loading, error, reload } = useFetch("/usuarios", { initialData: [] });
  const { data: rolesData } = useFetch("/roles", { initialData: [] });
  const { data: auditData } = useFetch("/auditoria", { initialData: [] });
  const [filters, setFilters] = useState({ search: "", role: "TODOS", status: "TODOS" });
  const [page, setPage] = useState(1);
  const [menuOpen, setMenuOpen] = useState(null);
  const [drawer, setDrawer] = useState(null);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState("");
  const [saving, setSaving] = useState(false);
  const users = Array.isArray(usersData) ? usersData : [];
  const roles = Array.isArray(rolesData) ? rolesData : [];
  const auditLogs = Array.isArray(auditData) ? auditData : [];
  const visible = useMemo(() => filterUsers(users, filters), [users, filters]);
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const paged = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const summary = buildSummary(users);
  async function saveUser(payload, target) {
    setSaving(true);
    try {
      await api(target ? `/usuarios/${target.id}` : "/usuarios", { method: target ? "PUT" : "POST", body: payload });
      await reload();
      setModal(null);
      setDrawer(null);
      setToast(target ? "Usuario actualizado." : "Usuario creado.");
    } finally {
      setSaving(false);
    }
  }
  async function quickUpdate(target, changes, label) {
    if (target.id === user?.id && changes.status && changes.status !== "ACTIVO") {
      setToast("No puedes modificar tu propio acceso.");
      return;
    }
    setSaving(true);
    try {
      const path = "/usuarios/" + target.id;
      await api(path, { method: "PUT", body: userPayload(target, changes) });
      await reload();
      setMenuOpen(null);
      setDrawer(null);
      setToast(label);
    } finally {
      setSaving(false);
    }
  }
  if (loading) return <LoadingSpinner />;
  if (error) return <p className="rounded-card bg-park-danger-soft p-4 font-semibold text-park-danger">{error.message}</p>;
  return (
    <div className="space-y-5">
      <Toast message={toast} onClose={() => setToast("")} />
      <PageHeader eyebrow="Administracion / Usuarios" title="Usuarios / Trabajadores" description="Gestion del personal y acceso al ERP." actions={<Button variant="secondary" icon={RefreshCw} onClick={reload}>Actualizar</Button>} />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Users} label="Trabajadores" value={summary.total} hint="Total registrados" />
        <Metric icon={CheckCircle2} label="Activos" value={summary.active} hint="Con acceso habilitado" />
        <Metric icon={UserRound} label="Inactivos" value={summary.inactive} hint="Sin acceso al sistema" tone="warn" />
        <Metric icon={CalendarDays} label="Presentes hoy" value={0} hint="Pendiente de asistencia" tone="muted" />
      </section>
      <section className="rounded-card border border-park-border bg-white p-4 shadow-card">
        <div className="grid gap-3 xl:grid-cols-[1fr_220px_220px_auto_auto] lg:items-end">
          <label className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-park-muted" size={17} /><input className="h-11 w-full rounded-input border border-park-border px-3 pl-10 text-sm outline-none focus:border-park-green" placeholder="Buscar trabajador por nombre, DNI o correo..." value={filters.search} onChange={(event) => { setPage(1); setFilters((state) => ({ ...state, search: event.target.value })); }} /></label>
          <SelectControl label="Rol" value={filters.role} onChange={(value) => { setPage(1); setFilters((state) => ({ ...state, role: value })); }}><option value="TODOS">Todos los roles</option>{roles.map((role) => <option key={role.id} value={role.name}>{roleLabel(role.name)}</option>)}</SelectControl>
          <SelectControl label="Estado" value={filters.status} onChange={(value) => { setPage(1); setFilters((state) => ({ ...state, status: value })); }}><option value="TODOS">Todos los estados</option>{statusOptions(users).map((status) => <option key={status} value={status}>{status}</option>)}</SelectControl>
          <Button type="button" variant="secondary" onClick={() => { setPage(1); setFilters({ search: "", role: "TODOS", status: "TODOS" }); }}>Limpiar filtros</Button><Button icon={UserPlus} onClick={() => setModal({ type: "create" })}>Nuevo trabajador</Button>
        </div>
      </section>
      {paged.length ? <UsersTable users={paged} currentUser={user} auditLogs={auditLogs} menuOpen={menuOpen} setMenuOpen={setMenuOpen} onDetail={setDrawer} onModal={setModal} onQuickUpdate={quickUpdate} saving={saving} /> : <EmptyState title="Sin trabajadores" description="No hay trabajadores con los filtros actuales." />}
      <Pagination page={page} pageCount={pageCount} total={visible.length} onPage={setPage} />
      {drawer ? <UserDrawer user={drawer} roles={roles} auditLogs={auditLogs} onClose={() => setDrawer(null)} onModal={setModal} onQuickUpdate={quickUpdate} /> : null}
      {modal ? <UserModal modal={modal} roles={roles} onClose={() => setModal(null)} onSave={saveUser} saving={saving} /> : null}
    </div>
  );
}

function UsersTable({ users, currentUser, auditLogs, menuOpen, setMenuOpen, onDetail, onModal, onQuickUpdate, saving }) {
  const columns = ["Trabajador", "DNI", "Rol / area", "Estado", "Asistencia actual", "Acceso", "Acciones"];
  return <div className="overflow-x-auto rounded-card border border-park-border bg-white shadow-card"><table className="min-w-full text-left text-sm"><thead className="bg-park-bg text-xs uppercase text-park-muted"><tr>{columns.map((col) => <th className="px-4 py-3 font-black" key={col}>{col}</th>)}</tr></thead><tbody className="divide-y divide-park-border/70">{users.map((item) => <UserRow key={item.id} item={item} currentUser={currentUser} auditLogs={auditLogs} menuOpen={menuOpen} setMenuOpen={setMenuOpen} onDetail={onDetail} onModal={onModal} onQuickUpdate={onQuickUpdate} saving={saving} />)}</tbody></table></div>;
}

function UserRow({ item, currentUser, auditLogs, menuOpen, setMenuOpen, onDetail, onModal, onQuickUpdate, saving }) {
  const isSelf = item.id === currentUser?.id;
  return <tr className="hover:bg-park-green-soft/30"><td className="px-4 py-3"><div className="flex items-center gap-3"><Avatar user={item} /><div><p className="font-black text-park-black">{fullName(item)} {isSelf ? <span className="ml-2 rounded-full bg-park-green-soft px-2 py-0.5 text-[10px] font-black text-park-green">TU</span> : null}</p><p className="text-xs text-park-muted">{item.email}</p></div></div></td><td className="px-4 py-3 font-semibold text-park-black">{item.documentNumber || "-"}</td><td className="px-4 py-3"><p className="font-black text-park-black">{roleLabel(item.role?.name, item.position)}</p><p className="text-xs text-park-muted">{positionLabel(item.position, item.role?.name)}</p></td><td className="px-4 py-3"><StatusBadge value={item.status} /></td><td className="px-4 py-3"><StatusBadge value={item.attendanceStatus || "FUERA_DE_TURNO"} /></td><td className="px-4 py-3"><AccessBadge status={item.status} /></td><td className="relative px-4 py-3"><button className="grid h-9 w-9 place-items-center rounded-button border border-park-border hover:border-park-green" onClick={() => setMenuOpen(menuOpen === item.id ? null : item.id)} type="button"><MoreVertical size={16} /></button>{menuOpen === item.id ? <ActionMenu item={item} isSelf={isSelf} saving={saving} onDetail={onDetail} onModal={onModal} onQuickUpdate={onQuickUpdate} /> : null}</td></tr>;
}

function ActionMenu({ item, isSelf, saving, onDetail, onModal, onQuickUpdate }) {
  const disabledAccess = item.status !== "ACTIVO";
  return <div className="absolute right-4 z-20 mt-2 w-64 rounded-card border border-park-border bg-white p-2 shadow-drawer"><MenuButton icon={Eye} label="Ver informacion" onClick={() => onDetail(item)} /><MenuButton icon={Pencil} label="Editar trabajador" onClick={() => onModal({ type: "edit", user: item })} /><MenuButton icon={ShieldCheck} label="Cambiar rol/permisos" onClick={() => onModal({ type: "role", user: item })} /><MenuButton icon={CalendarDays} label="Ver asistencias" onClick={() => window.location.assign("/empleados")} /><MenuButton icon={KeyRound} label="Restablecer acceso" disabled={isSelf || saving} onClick={() => onModal({ type: "reset", user: item })} /><Divider /><MenuButton icon={ShieldCheck} label={disabledAccess ? "Reactivar acceso" : "Desactivar acceso"} disabled={isSelf || saving} danger={!disabledAccess} onClick={() => onQuickUpdate(item, { status: disabledAccess ? "ACTIVO" : "INACTIVO" }, disabledAccess ? "Acceso reactivado." : "Acceso desactivado.")} /><MenuButton icon={Trash2} label="Eliminar trabajador" disabled={isSelf || saving} danger onClick={() => onQuickUpdate(item, { status: "INACTIVO" }, "El trabajador se inactivo para conservar historial.")} /></div>;
}

function UserDrawer({ user, roles, auditLogs, onClose, onModal }) {
  const currentRole = roles.find((role) => role.id === (user.roleId || user.role?.id) || role.name === user.role?.name);
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200"><section className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-card border border-park-border bg-white p-6 shadow-drawer"><div className="flex items-start justify-between gap-4 border-b border-park-border pb-4"><div><p className="text-xs font-black uppercase text-park-gold">Informacion del trabajador</p><h2 className="mt-1 font-sans text-2xl font-black text-park-black">{fullName(user)}</h2></div><button className="grid h-9 w-9 place-items-center rounded-button border border-park-border" onClick={onClose} type="button"><X size={18} /></button></div><div className="mt-5 grid gap-6 lg:grid-cols-[220px_1fr]"><aside className="rounded-card border border-park-border bg-park-bg p-4 text-center"><Avatar user={user} xl /><h3 className="mt-4 font-sans text-lg font-black text-park-black">{fullName(user)}</h3><p className="text-sm text-park-muted">{areaLabel(user.role?.name)}</p><div className="mt-3 flex justify-center gap-2"><StatusBadge value={user.status} /><RoleBadge role={user.role?.name} /></div></aside><div className="grid gap-4 lg:grid-cols-2"><Panel title="Informacion personal"><Detail label="DNI" value={user.documentNumber} /><Detail label="Nombre completo" value={fullName(user)} /><Detail label="Fecha nacimiento" value={formatDateOnly(user.birthDate)} /><Detail label="Edad" value={calculateAge(user.birthDate)} /><Detail label="Correo" value={user.email} /><Detail label="Celular" value={user.phone} /></Panel><Panel title="Informacion laboral"><Detail label="Rol / area" value={currentRole?.name || user.role?.name} /><Detail label="Puesto" value={user.position || areaLabel(user.role?.name)} /><Detail label="Fecha ingreso" value={formatDateOnly(user.hireDate)} /><Detail label="Estado acceso" value={user.status === "ACTIVO" ? "Habilitado" : "Deshabilitado"} /><Detail label="Usuario" value={user.username || user.email} /><Detail label="Ultimo acceso" value={lastAccess(user, auditLogs)} /></Panel></div></div><div className="mt-6 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cerrar</Button><Button icon={Pencil} onClick={() => onModal({ type: "edit", user })}>Editar trabajador</Button></div></section></div>;
}

function InfoTab({ user }) { return <section className="mt-5 space-y-5"><Panel title="Datos personales"><Detail label="DNI" value={user.documentNumber} /><Detail label="Nombre completo" value={fullName(user)} /><Detail label="Fecha nacimiento" value={formatDateOnly(user.birthDate)} /><Detail label="Edad" value={calculateAge(user.birthDate)} /><Detail label="Correo" value={user.email} /><Detail label="Celular" value={user.phone} /></Panel><Panel title="Acceso y seguridad"><Detail label="Rol actual" value={user.role?.name} /><Detail label="Estado" value={user.status} /><Detail label="Fecha ingreso" value={formatDateOnly(user.hireDate)} /><Detail label="Usuario" value={user.username || user.email} /><Detail label="Ultimo acceso" value={lastAccess(user)} /></Panel></section>; }
function ActivityTab({ user, auditLogs }) { const logs = (user.auditLogs?.length ? user.auditLogs : auditLogs.filter((log) => log.userId === user.id)); return <section className="mt-5">{logs.length ? logs.map((log) => <div className="border-b border-park-border py-3" key={log.id}><p className="font-black text-park-black">{log.action} | {log.module}</p><p className="text-sm text-park-muted">{log.detail || "Registro de auditoria"}</p><p className="text-xs text-park-muted">{formatDate(log.createdAt)}</p></div>) : <EmptyState title="Sin actividad" description="La actividad aparecera desde auditoria." />}</section>; }
function PermissionsTab({ permissions, role }) { return <section className="mt-5"><Panel title={role || "Rol"}>{permissions.length ? permissions.map((permission) => <div className="mb-2 flex items-center justify-between rounded-card bg-park-bg px-3 py-2 text-sm" key={`${permission.module}-${permission.action}`}><span className="font-black text-park-black">{permission.module}</span><span className="text-park-muted">{permission.action}</span></div>) : <p className="text-sm text-park-muted">Sin permisos asignados.</p>}<Link className="mt-3 inline-flex text-sm font-black text-park-green" to="/roles">Ver en Roles y permisos</Link></Panel></section>; }

function UserModal({ modal, roles, onClose, onSave, saving }) {
  const target = modal.user;
  const [form, setForm] = useState({ firstName: target?.firstName || "", lastName: target?.lastName || "", email: target?.email || "", documentNumber: target?.documentNumber || "", phone: target?.phone || "", birthDate: dateInputValue(target?.birthDate), photoUrl: target?.photoUrl || "", position: target?.position || "", hireDate: dateInputValue(target?.hireDate), username: target?.username || "", roleId: target?.roleId || target?.role?.id || "", status: target?.status || "ACTIVO", password: "", pin: "" });
  const [formError, setFormError] = useState("");
  function update(key, value) { setForm((state) => ({ ...state, [key]: value })); }
  async function submit(event) {
    event.preventDefault();
    setFormError("");
    if (modal.type !== "reset" && modal.type !== "role" && !/^\d{8}$/.test(form.documentNumber)) return setFormError("El DNI debe tener exactamente 8 dígitos.");
    if (modal.type === "create" && !/^\d{4}$/.test(form.pin)) return setFormError("Asigna un PIN de asistencia de exactamente 4 dígitos.");
    if (modal.type === "edit" && form.pin && !/^\d{4}$/.test(form.pin)) return setFormError("El nuevo PIN debe tener exactamente 4 dígitos.");
    try { await onSave(modal.type === "reset" ? userPayload(target, { password: form.password, status: "ACTIVO" }) : form, target); }
    catch (cause) { setFormError(cause.message || "No se pudo guardar al trabajador."); }
  }
  const title = modal.type === "reset" ? "Crear nueva contraseña temporal" : modal.type === "role" ? "Cambiar rol/permisos" : target ? "Editar trabajador" : "Nuevo trabajador";
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <form className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-card bg-white p-6 shadow-drawer" onSubmit={submit}>
        <div className="flex items-center justify-between">
          <h2 className="font-sans text-xl font-black text-park-black">{title}</h2>
          <button className="grid h-9 w-9 place-items-center rounded-button border border-park-border" onClick={onClose} type="button"><X size={18} /></button>
        </div>
        {modal.type === "create" ? <p className="mt-3 rounded-card bg-park-green-soft p-3 text-sm font-semibold text-park-green">La contraseña sirve para entrar al sistema. El PIN personal de 4 dígitos sirve únicamente para iniciar y cerrar su turno con el DNI.</p> : null}
        {modal.type === "role" ? <p className="mt-3 rounded-card bg-park-gold-soft p-3 text-sm font-semibold text-park-black">El rol define los permisos y la vista operativa que verá el trabajador.</p> : null}
        {modal.type === "reset" ? <p className="mt-3 rounded-card bg-park-gold-soft p-3 text-sm font-semibold text-park-black">La contraseña anterior dejará de funcionar inmediatamente. Comunica la nueva clave únicamente al trabajador.</p> : null}
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {modal.type === "reset" ? (
            <div className="md:col-span-2">
              <TextInput label="Nueva contraseña temporal *" type="password" value={form.password} onChange={(value) => update("password", value)} required />
              <p className="mt-2 text-xs text-park-muted">Mínimo 12 caracteres. Combina palabras, números y símbolos.</p>
            </div>
          ) : (
            <>
              {modal.type !== "role" ? <><TextInput label="DNI *" value={form.documentNumber} onChange={(value) => update("documentNumber", onlyDigits(value, 8))} inputMode="numeric" maxLength={8} required /><TextInput label="Usuario" value={form.username} onChange={(value) => update("username", value)} /><TextInput label="Nombres *" value={form.firstName} onChange={(value) => update("firstName", value)} required /><TextInput label="Apellidos *" value={form.lastName} onChange={(value) => update("lastName", value)} required /><TextInput label="Correo *" type="email" value={form.email} onChange={(value) => update("email", value)} required /><TextInput label="Celular" value={form.phone} onChange={(value) => update("phone", onlyDigits(value, 15))} inputMode="numeric" maxLength={15} /><TextInput label="Fecha de nacimiento" type="date" value={form.birthDate} onChange={(value) => update("birthDate", value)} /><TextInput label="Fecha de ingreso" type="date" value={form.hireDate} onChange={(value) => update("hireDate", value)} /><TextInput label="Puesto / area" value={form.position} onChange={(value) => update("position", value)} /><TextInput label="URL de fotografia" value={form.photoUrl} onChange={(value) => update("photoUrl", value)} /><div><TextInput label={modal.type === "create" ? "PIN de asistencia *" : "Nuevo PIN de asistencia"} type="password" value={form.pin} onChange={(value) => update("pin", onlyDigits(value, 4))} inputMode="numeric" maxLength={4} required={modal.type === "create"} /><p className="mt-2 text-xs text-park-muted">{modal.type === "create" ? "El trabajador lo usará junto con su DNI para marcar ingreso y salida." : "Déjalo vacío para conservar el PIN actual."}</p></div>{modal.type === "create" ? <div><TextInput label="Contraseña temporal del sistema *" type="password" value={form.password} onChange={(value) => update("password", value)} required /><p className="mt-2 text-xs text-park-muted">Mínimo 12 caracteres. Es distinta del PIN de asistencia.</p></div> : null}</> : null}
              <SelectControl label="Rol *" value={form.roleId} onChange={(value) => update("roleId", value)}><option value="">Seleccionar</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</SelectControl>
              {modal.type !== "create" ? <SelectControl label="Estado" value={form.status} onChange={(value) => update("status", value)}>{statusOptions().map((status) => <option key={status} value={status}>{status}</option>)}</SelectControl> : null}
            </>
          )}
        </div>
        {formError ? <p className="mt-4 rounded-card bg-park-danger-soft p-3 text-sm font-semibold text-park-danger">{formError}</p> : null}
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={saving}>{modal.type === "reset" ? "Guardar nueva contraseña" : modal.type === "role" ? "Cambiar rol" : target ? "Guardar cambios" : "Crear trabajador"}</Button>
        </div>
      </form>
    </div>
  );
}

function Metric({ icon: Icon, label, value, hint, tone = "green" }) {
  const styles = tone === "warn" ? "bg-park-gold-soft text-park-gold" : tone === "muted" ? "bg-slate-100 text-slate-500" : "bg-park-green-soft text-park-green";
  return <article className="rounded-card border border-park-border bg-white p-5 shadow-card"><div className="flex items-center gap-4"><span className={`grid h-12 w-12 place-items-center rounded-button ${styles}`}><Icon size={22} /></span><div><strong className="font-display text-2xl text-park-dark">{value}</strong><p className="font-black text-park-black">{label}</p><p className="text-xs text-park-muted">{hint}</p></div></div></article>;
}
function Avatar({ user, large = false, xl = false }) {
  const size = xl ? "mx-auto h-32 w-32 text-3xl" : large ? "h-16 w-16 text-xl" : "h-10 w-10 text-sm";
  if (user.photoUrl) return <img className={size + " shrink-0 rounded-full object-cover ring-2 ring-park-green-soft"} src={user.photoUrl} alt={fullName(user)} />;
  return <span className={size + " grid shrink-0 place-items-center rounded-full bg-park-green font-black text-white"}>{initials(user)}</span>;
}
function RoleBadge({ role }) {
  return <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{roleLabel(role)}</span>;
}
function AccessBadge({ status }) {
  const active = status === "ACTIVO";
  return <span className={(active ? "bg-park-green-soft text-park-green" : "bg-park-danger-soft text-park-danger") + " rounded-full px-3 py-1 text-xs font-black"}>{active ? "Habilitado" : "Deshabilitado"}</span>;
}
function MenuButton({ icon: Icon, label, onClick, danger, disabled }) {
  const color = danger ? "text-park-danger" : "text-park-black";
  return <button className={`flex w-full items-center gap-3 rounded-button px-3 py-2 text-left text-sm font-semibold hover:bg-park-bg disabled:cursor-not-allowed disabled:opacity-40 ${color}`} disabled={disabled} onClick={onClick} type="button"><Icon size={16} />{label}</button>;
}
function Divider() { return <div className="my-2 border-t border-park-border" />; }
function Panel({ title, children }) { return <section className="rounded-card border border-park-border bg-white p-4"><h3 className="mb-3 text-sm font-black uppercase text-park-muted">{title}</h3>{children}</section>; }
function Detail({ label, value }) { return <div className="mb-3 grid grid-cols-[140px_1fr] gap-3 text-sm last:mb-0"><span className="text-park-muted">{label}</span><strong className="text-park-black">{value || "-"}</strong></div>; }
function TextInput({ label, value, onChange, type = "text", required, inputMode, maxLength }) { return <label className="block"><span className="text-sm font-black text-park-black">{label}</span><input className="mt-2 h-11 w-full rounded-input border border-park-border px-3 text-sm outline-none focus:border-park-green" type={type} value={value} required={required} inputMode={inputMode} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} /></label>; }
function SelectControl({ label, value, onChange, children }) { return <label className="block"><span className="text-xs font-black uppercase text-park-muted">{label}</span><select className="mt-2 h-11 w-full rounded-input border border-park-border bg-white px-3 text-sm outline-none focus:border-park-green" value={value} onChange={(event) => onChange(event.target.value)}>{children}</select></label>; }
function Pagination({ page, pageCount, total, onPage }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-park-border bg-white p-4 text-sm text-park-muted shadow-card"><span>Mostrando pagina {page} de {pageCount} | {total} trabajadores</span><div className="flex gap-2"><Button type="button" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>Anterior</Button><Button type="button" variant="secondary" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>Siguiente</Button></div></div>;
}
function filterUsers(users, filters) {
  const search = filters.search.trim().toLowerCase();
  return users.filter((item) => {
    const haystack = [fullName(item), item.email, item.documentNumber, item.phone, item.username, item.position, item.role?.name, item.status].filter(Boolean).join(" ").toLowerCase();
    if (search && !haystack.includes(search)) return false;
    if (filters.role !== "TODOS" && item.role?.name !== filters.role) return false;
    if (filters.status !== "TODOS" && item.status !== filters.status) return false;
    return true;
  });
}
function buildSummary(users) {
  return {
    total: users.length,
    active: users.filter((u) => u.status === "ACTIVO").length,
    inactive: users.filter((u) => u.status !== "ACTIVO").length
  };
}
function statusOptions(users = []) {
  return [...new Set(["ACTIVO", "SUSPENDIDO", "INACTIVO", ...users.map((user) => user.status).filter(Boolean)])];
}
function fullName(user) { return [user.firstName, user.lastName].filter(Boolean).join(" ") || "Trabajador"; }
function initials(user) { return fullName(user).split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase(); }
function formatDate(value) { return value ? new Date(value).toLocaleString("es-PE") : "-"; }
function formatDateOnly(value) { return value ? new Date(value).toLocaleDateString("es-PE") : "-"; }
function dateInputValue(value) { return value ? new Date(value).toISOString().slice(0, 10) : ""; }
function onlyDigits(value, max) { return value.replace(/\D/g, "").slice(0, max); }
function calculateAge(value) { if (!value) return "-"; const birth = new Date(value); const today = new Date(); let age = today.getFullYear() - birth.getFullYear(); const month = today.getMonth() - birth.getMonth(); if (month < 0 || (month === 0 && today.getDate() < birth.getDate())) age -= 1; return age + " anos"; }
function areaLabel(role) { return role ? role.charAt(0).toUpperCase() + role.slice(1).toLowerCase().replaceAll("_", " ") : "Sin area"; }
function roleLabel(role, position) { return role === "ADMINISTRADOR" && position === "ADMIN_RECEPCION" ? "Admin de recepción" : areaLabel(role); }
function positionLabel(position, role) { return position === "ADMIN_RECEPCION" ? "Segundo al mando · recepción" : position || areaLabel(role); }
function lastAccess(user, auditLogs = []) {
  const login = (user.auditLogs || auditLogs.filter((log) => log.userId === user.id)).find((log) => log.module === "AUTH" || log.action === "LOGIN");
  return login ? formatDate(login.createdAt) : "-";
}
function userPayload(user, changes = {}) {
  return { firstName: user.firstName, lastName: user.lastName, email: user.email, documentNumber: user.documentNumber || "", phone: user.phone || "", birthDate: dateInputValue(user.birthDate), photoUrl: user.photoUrl || "", position: user.position || "", hireDate: dateInputValue(user.hireDate), username: user.username || "", roleId: user.roleId || user.role?.id, status: user.status, ...changes };
}








