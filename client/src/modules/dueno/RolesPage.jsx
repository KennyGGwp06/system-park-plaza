// Control del sistema › Roles y permisos. Qué puede ver y hacer cada rol, por módulo (ver, crear, editar, eliminar).
// El servidor además protege cada ruta por rol; aquí se ajusta lo que el menú y las acciones permiten. Los permisos del
// Superadmin no se pueden vaciar. Rutas: GET /api/roles, /api/roles/permissions, PUT /api/roles/:id/permissions.
import { useMemo, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { api } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Alert, Card, PageHead, Seg, useBusy, useToast } from "./kit";
import { ROLE_LABEL } from "./UsersPage";

const ACTIONS = [["VER", "Ver"], ["CREAR", "Crear"], ["EDITAR", "Editar"], ["ELIMINAR", "Eliminar"]];
const MODULE_NAME = { DASHBOARD: "Inicio", RECEPCION: "Recepción", CLIENTES: "Clientes", HABITACIONES: "Habitaciones", RESERVAS: "Reservas", CHECK_IN: "Llegadas (check-in)", CHECK_OUT: "Salidas (check-out)", PEDIDOS: "Pedidos", RESTAURANTE: "Restaurante", BARTENDER: "Bar", EVENTOS: "Eventos", COCHERA: "Cochera", LIMPIEZA: "Limpieza", MANTENIMIENTO: "Mantenimiento", INVENTARIO: "Inventario", COMPRAS: "Compras", PROVEEDORES: "Proveedores", PAGOS: "Pagos", FACTURACION: "Facturación", CAJA: "Caja", USUARIOS: "Usuarios", ROLES: "Roles y permisos", REPORTES: "Reportes", AUDITORIA: "Auditoría", CONFIGURACION: "Configuración", EMPLEADOS: "Personal", TURNOS: "Turnos", ACCESOS: "Accesos" };
const moduleName = (code) => MODULE_NAME[code] || code.charAt(0) + code.slice(1).toLowerCase().replaceAll("_", " ");

export function RolesPage() {
  const roles = useFetch("/roles", { initialData: [], realtime: false });
  const catalog = useFetch("/roles/permissions", { initialData: [], realtime: false });
  const show = useToast();
  const { busy, error, run } = useBusy();
  const list = Array.isArray(roles.data) ? roles.data : [];
  const [roleId, setRoleId] = useState(null);
  const role = list.find((row) => String(row.id) === String(roleId)) || list[0];
  const [draft, setDraft] = useState(null);
  const current = draft && draft.roleId === role?.id ? draft.ids : new Set((role?.permissions || []).map((p) => Number(p.permissionId || p.id)));
  const modules = useMemo(() => { const map = new Map(); (Array.isArray(catalog.data) ? catalog.data : []).forEach((p) => { const row = map.get(p.module) || {}; row[p.action] = p; map.set(p.module, row); }); return [...map.entries()]; }, [catalog.data]);
  const original = new Set((role?.permissions || []).map((p) => Number(p.permissionId || p.id)));
  const changed = role && (current.size !== original.size || [...current].some((id) => !original.has(id)));
  const toggle = (id) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); setDraft({ roleId: role.id, ids: next }); };
  const save = () => run(async () => { await api(`/roles/${role.id}/permissions`, { method: "PUT", body: { permissionIds: [...current] } }); show(`Permisos de ${ROLE_LABEL[role.name] || role.name} guardados.`); setDraft(null); roles.reload(); });
  if (roles.loading && !list.length) return <LoadingSpinner label="Cargando roles…" />;
  return <>
    <PageHead title="Roles y permisos" tools={<button className="rx-btn rx-btn--primary" type="button" disabled={busy || !changed} onClick={save}>Guardar cambios</button>}>Marca qué puede hacer cada rol en cada módulo. Además de esto, el servidor protege cada operación por rol: un permiso nunca abre una acción que el rol no debe hacer.</PageHead>
    <div style={{ marginBottom: 12 }}><Seg value={String(role?.id)} onChange={(value) => { setRoleId(value); setDraft(null); }} options={list.map((row) => [String(row.id), ROLE_LABEL[row.name] || row.name, (row.permissions || []).length])} /></div>
    {role?.name === "SUPERADMIN" ? <div style={{ marginBottom: 12 }}><Alert tone="info">El dueño tiene acceso completo; sus permisos no pueden vaciarse.</Alert></div> : null}
    {error ? <div style={{ marginBottom: 12 }}><Alert tone="crit">{error}</Alert></div> : null}
    <Card title={<><ShieldCheck size={16} style={{ verticalAlign: -3 }} /> {ROLE_LABEL[role?.name] || role?.name}</>} subtitle={`${current.size} permiso(s) marcados${changed ? " · sin guardar" : ""}`} flush>
      <div className="rx-table-wrap"><table className="rx-table"><thead><tr><th>Módulo</th>{ACTIONS.map(([, label]) => <th key={label} className="n">{label}</th>)}</tr></thead>
        <tbody>{modules.map(([code, actions]) => <tr key={code}><td><b style={{ fontWeight: 600 }}>{moduleName(code)}</b></td>{ACTIONS.map(([action]) => { const p = actions[action]; return <td key={action} className="n">{p ? <input type="checkbox" checked={current.has(Number(p.id))} onChange={() => toggle(Number(p.id))} aria-label={`${moduleName(code)} · ${action}`} style={{ width: 16, height: 16 }} /> : <span className="mut">—</span>}</td>; })}</tr>)}</tbody></table></div>
    </Card>
  </>;
}
