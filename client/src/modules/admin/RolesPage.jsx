import { useMemo, useState } from "react";
import { LockKeyhole, Save, Search, ShieldCheck, UserCog } from "lucide-react";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { useFetch } from "../../hooks/useFetch";
import { api } from "../../services/api";
import { Button, PageHeader } from "../../components/ui";

const actions = ["VER", "CREAR", "EDITAR", "ELIMINAR"];

export function RolesPage() {
  const { data: roles, loading: rolesLoading, error: rolesError, reload } = useFetch("/roles", { initialData: [] });
  const { data: permissions, loading: permissionsLoading } = useFetch("/roles/permissions", { initialData: [] });
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [saving, setSaving] = useState(false);
  const [moduleSearch, setModuleSearch] = useState("");
  const selectedRole = roles.find((role) => String(role.id) === String(selectedRoleId)) || roles[0];

  const modules = useMemo(() => {
    const grouped = {};
    for (const permission of permissions || []) {
      grouped[permission.module] = grouped[permission.module] || {};
      grouped[permission.module][permission.action] = permission;
    }
    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
  }, [permissions]);

  const selectedPermissionIds = useMemo(() => new Set(selectedRole?.permissions?.map((item) => item.permissionId || item.id) || []), [selectedRole]);
  const [draft, setDraft] = useState(null);
  const currentDraft = draft || selectedPermissionIds;
  const filteredModules = useMemo(() => {
    const needle = moduleSearch.trim().toLowerCase();
    return modules.filter(([module]) => !needle || module.toLowerCase().includes(needle));
  }, [modules, moduleSearch]);
  const assignedCount = currentDraft.size;
  const hasChanges = Boolean(draft);

  if (rolesLoading || permissionsLoading) return <LoadingSpinner />;
  if (rolesError) return <p className="rounded-card bg-park-danger-soft p-4 font-semibold text-park-danger">{rolesError.message}</p>;

  function toggle(permissionId) {
    const next = new Set(currentDraft);
    if (next.has(permissionId)) next.delete(permissionId);
    else next.add(permissionId);
    setDraft(next);
  }

  async function save() {
    setSaving(true);
    try {
      await api(`/roles/${selectedRole.id}/permissions`, { method: "PUT", body: { permissionIds: Array.from(currentDraft) } });
      setDraft(null);
      await reload();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Sistema"
        title="Roles y Permisos"
        description="Administra permisos por modulo usando la matriz oficial de acciones."
        actions={<Button icon={Save} loading={saving} onClick={save} variant="gold">Guardar permisos</Button>}
      />

      <section className="mb-6 grid gap-4 md:grid-cols-3">
        <RoleMetric icon={UserCog} label="Roles activos" value={roles.length} />
        <RoleMetric icon={LockKeyhole} label="Modulos configurables" value={modules.length} />
        <RoleMetric icon={ShieldCheck} label="Permisos asignados" value={assignedCount} tone={hasChanges ? "gold" : "green"} helper={hasChanges ? "Cambios sin guardar" : "Guardado"} />
      </section>

      <section className="mb-6 rounded-card border border-park-border bg-white p-5 shadow-card">
        <div className="grid gap-4 lg:grid-cols-[320px_1fr] lg:items-end">
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-park-black">Rol</span>
            <select
              className="h-10 w-full rounded-input border border-park-border px-3 text-sm outline-none focus:border-park-green focus:ring-2 focus:ring-park-green/15"
              value={selectedRole?.id || ""}
              onChange={(event) => { setSelectedRoleId(event.target.value); setDraft(null); }}
            >
              {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
            </select>
          </label>
          <label className="relative block">
            <span className="mb-1.5 block text-sm font-semibold text-park-black">Buscar modulo</span>
            <Search className="pointer-events-none absolute bottom-2.5 left-3 text-park-muted" size={17} />
            <input
              className="h-10 w-full rounded-input border border-park-border px-3 pl-9 text-sm outline-none focus:border-park-green focus:ring-2 focus:ring-park-green/15"
              placeholder="Ej. reservas, usuarios, caja..."
              value={moduleSearch}
              onChange={(event) => setModuleSearch(event.target.value)}
            />
          </label>
        </div>
      </section>

      <div className="overflow-x-auto rounded-card border border-park-border bg-white shadow-card">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-park-bg text-xs uppercase text-park-muted">
            <tr>
              <th className="px-4 py-3">Modulo</th>
              {actions.map((action) => <th className="px-4 py-3 text-center" key={action}>{action}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-park-border/70">
            {filteredModules.map(([module, permissionsByAction]) => (
              <tr key={module}>
                <td className="px-4 py-3 font-semibold text-park-black">{module}</td>
                {actions.map((action) => {
                  const permission = permissionsByAction[action];
                  return (
                    <td className="px-4 py-3 text-center" key={action}>
                      {permission ? (
                        <input
                          aria-label={`${module} ${action}`}
                          checked={currentDraft.has(permission.id)}
                          className="h-4 w-4 accent-park-green"
                          onChange={() => toggle(permission.id)}
                          type="checkbox"
                        />
                      ) : "-"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!filteredModules.length ? <p className="mt-4 rounded-card bg-park-bg p-4 text-sm font-semibold text-park-muted">No hay modulos que coincidan con la busqueda.</p> : null}
    </div>
  );
}

function RoleMetric({ icon: Icon, label, value, tone = "green", helper }) {
  const tones = {
    green: "bg-park-green-soft text-park-green",
    gold: "bg-park-gold-soft text-park-black"
  };

  return (
    <article className="rounded-card border border-park-border bg-white p-5 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase text-park-muted">{label}</p>
          <strong className="mt-2 block font-display text-3xl font-semibold text-park-dark">{value}</strong>
          {helper ? <span className="mt-1 block text-xs font-semibold text-park-muted">{helper}</span> : null}
        </div>
        <span className={`grid h-12 w-12 place-items-center rounded-full ${tones[tone] || tones.green}`}>
          <Icon size={21} />
        </span>
      </div>
    </article>
  );
}
