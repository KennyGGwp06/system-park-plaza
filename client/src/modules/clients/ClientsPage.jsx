import { useMemo, useState } from "react";
import { Ban, CheckCircle2, Eye, KeyRound, Plus, Trash2, X } from "lucide-react";
import { api } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { SearchInput } from "../../components/SearchInput";
import { Table } from "../../components/Table";
import { StatusBadge } from "../../components/StatusBadge";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Toast } from "../../components/Toast";
import { Button, Input, PageHeader, Select } from "../../components/ui";

const emptyClient = { documentType: "DNI", documentNumber: "", firstName: "", lastName: "", phone: "", email: "", address: "", status: "ACTIVO" };

export function ClientsPage() {
  const { data, loading, error, reload } = useFetch("/clients", { initialData: [] });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("TODOS");
  const [form, setForm] = useState(emptyClient);
  const [toast, setToast] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState(null);

  const rows = useMemo(() => (data || []).filter((client) => {
    const text = `${client.firstName} ${client.lastName} ${client.documentNumber} ${client.phone || ""} ${client.email || ""}`.toLowerCase();
    const matchesSearch = text.includes(search.toLowerCase());
    const matchesFilter =
      filter === "TODOS" ||
      (filter === "ACTIVOS" && client.status === "ACTIVO") ||
      (filter === "CON_RESERVA" && ((client.reservations?.length || 0) + (client.serviceBookings?.length || 0) > 0)) ||
      (filter === "CON_ACCESO" && client.accessStatus === "ACTIVO") ||
      (filter === "HOSPEDADOS" && client.status === "HOSPEDADO") ||
      (filter === "INACTIVOS" && client.status === "INACTIVO");
    return matchesSearch && matchesFilter;
  }), [data, search, filter]);

  async function submit(event) {
    event.preventDefault();
    await api("/clients", { method: "POST", body: form });
    setForm(emptyClient);
    setShowForm(false);
    setToast("Cliente registrado correctamente.");
    reload();
  }

  async function clientAction(client, action, payload = {}) {
    try {
      if (action === "end") await api(`/clients/${client.id}/end-services`, { method: "POST", body: { reason: "Finalizado manualmente desde Recepcion" } });
      if (action === "disable") await api(`/clients/${client.id}/status`, { method: "PATCH", body: { status: "BLOQUEADO", reason: "Cuenta deshabilitada desde Recepcion" } });
      if (action === "enable") await api(`/clients/${client.id}/status`, { method: "PATCH", body: { status: "ACTIVO", reason: "Cuenta reactivada" } });
      if (action === "delete") await api(`/clients/${client.id}`, { method: "DELETE", body: { confirmDocument: payload.confirmDocument } });
      setToast(action === "delete" ? "Datos de prueba eliminados. El documento puede registrarse nuevamente como cliente nuevo." : action === "end" ? "Servicios y accesos finalizados." : action === "enable" ? "Cuenta del huesped reactivada." : "Cuenta y QR deshabilitados.");
      setSelected(null);
      reload();
    } catch (cause) {
      setToast(cause.message || "No se pudo completar la acción.");
    }
  }

  if (loading) return <LoadingSpinner />;
  if (error) return <p className="text-park-danger">{error.message}</p>;

  return (
    <div className="space-y-5">
      <Toast message={toast} onClose={() => setToast("")} />
      <PageHeader
        eyebrow="Recepcion"
        title="Clientes"
        description="Gestion de huespedes, contactos, reservas vinculadas e historial operativo."
        actions={<Button icon={Plus} onClick={() => setShowForm(true)}>Nuevo cliente</Button>}
      />
      <section className="rounded-card border border-park-border bg-white p-5 shadow-card">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="w-full lg:max-w-xl">
            <SearchInput value={search} onChange={setSearch} placeholder="Buscar por DNI, nombre, telefono o correo" />
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              ["TODOS", "Todos"],
              ["ACTIVOS", "Activos"],
              ["CON_RESERVA", "Con reserva"],
              ["CON_ACCESO", "Con acceso QR"],
              ["HOSPEDADOS", "Hospedados"],
              ["INACTIVOS", "Inactivos"]
            ].map(([value, label]) => (
              <button
                className={`rounded-button px-3 py-2 text-sm font-semibold ${filter === value ? "bg-park-green text-white" : "bg-park-bg text-park-muted hover:text-park-black"}`}
                key={value}
                onClick={() => setFilter(value)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>
      <Table columns={["Cliente", "Documento", "Telefono", "Correo", "Reservas", "Cuenta", "Acceso QR", "Accion"]} rows={rows} renderRow={(client) => (
        <tr key={client.id}>
          <td className="px-4 py-3 font-bold">{client.firstName} {client.lastName}</td>
          <td className="px-4 py-3">{client.documentType} {client.documentNumber}</td>
          <td className="px-4 py-3">{client.phone}</td>
          <td className="px-4 py-3">{client.email}</td>
          <td className="px-4 py-3">{(client.reservations?.length || 0) + (client.serviceBookings?.length || 0)}</td>
          <td className="px-4 py-3"><StatusBadge value={client.status} /></td>
          <td className="px-4 py-3"><StatusBadge value={client.accessStatus} /></td>
          <td className="px-4 py-3">
            <button className="grid h-8 w-8 place-items-center rounded-button border border-park-border text-park-green hover:bg-park-green-soft" onClick={() => setSelected(client)} type="button" title="Ver cliente">
              <Eye size={15} />
            </button>
          </td>
        </tr>
      )} />
      {showForm ? <ClientFormDrawer form={form} setForm={setForm} onSubmit={submit} onClose={() => setShowForm(false)} /> : null}
      {selected ? <ClientDrawer client={selected} onAction={clientAction} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}

function ClientFormDrawer({ form, setForm, onSubmit, onClose }) {
  return (
    <div className="fixed inset-0 z-40 bg-slate-950/30 p-4">
      <aside className="ml-auto h-full max-w-xl overflow-auto rounded-card bg-white p-5 shadow-drawer">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase text-park-gold">Recepcion</p>
            <h2 className="font-display text-xl font-semibold text-park-dark">Nuevo cliente</h2>
          </div>
          <Button icon={X} onClick={onClose} size="sm" variant="ghost">Cerrar</Button>
        </div>
        <form className="mt-5 grid gap-4 md:grid-cols-2" onSubmit={onSubmit}>
          <Select label="Tipo documento" value={form.documentType} onChange={(event) => setForm({ ...form, documentType: event.target.value })}>
            <option>DNI</option>
            <option>CE</option>
            <option>PASAPORTE</option>
          </Select>
          <Input label="Documento" value={form.documentNumber} onChange={(event) => setForm({ ...form, documentNumber: event.target.value })} required />
          <Input label="Nombre" value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} required />
          <Input label="Apellido" value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} required />
          <Input label="Telefono" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
          <Input label="Correo" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          <Input className="md:col-span-2" label="Direccion" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
          <div className="flex justify-end gap-2 md:col-span-2">
            <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button type="submit">Guardar cliente</Button>
          </div>
        </form>
      </aside>
    </div>
  );
}

function ClientDrawer({ client, onClose, onAction }) {
  const activeReservation = [...(client.reservations || []), ...(client.serviceBookings || [])].find((reservation) => ["CONFIRMADA", "PENDIENTE", "PENDIENTE_PAGO", "CHECKED_IN"].includes(reservation.status));
  const [confirmDocument, setConfirmDocument] = useState("");
  const [showDelete, setShowDelete] = useState(false);
  return (
    <div className="fixed inset-0 z-40 bg-slate-950/30 p-4">
      <aside className="ml-auto h-full max-w-lg overflow-auto rounded-card bg-white p-5 shadow-drawer">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase text-park-gold">Cliente</p>
            <h2 className="font-display text-xl font-semibold text-park-dark">{client.firstName} {client.lastName}</h2>
            <p className="text-sm text-park-muted">{client.documentType} {client.documentNumber}</p>
          </div>
          <Button icon={X} onClick={onClose} size="sm" variant="ghost">Cerrar</Button>
        </div>
        <dl className="mt-5 grid gap-3 text-sm">
          <Detail label="Telefono" value={client.phone} />
          <Detail label="Correo" value={client.email} />
          <Detail label="Estado" value={<StatusBadge value={client.status} />} />
          <Detail label="Acceso QR" value={<StatusBadge value={client.accessStatus} />} />
          <Detail label="Reserva activa" value={activeReservation ? `${activeReservation.code} - ${activeReservation.serviceCode || `Habitación ${activeReservation.room?.number || "-"}`}` : "Sin reserva activa"} />
          <Detail label="Eventos" value={client.events?.length || 0} />
          <Detail label="Reservas historicas" value={(client.reservations?.length || 0) + (client.serviceBookings?.length || 0)} />
          <Detail label="Servicios vigentes" value={client.activeServices?.length || 0} />
        </dl>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <Button as="a" href="/reservas" variant="secondary">Ver reservas</Button>
          <Button as="a" href="/pagos" variant="secondary">Registrar pago</Button>
          <Button as="a" href="/checkin" variant="secondary">Check-in</Button>
          <Button as="a" href="/checkout" variant="secondary">Check-out</Button>
        </div>
        <section className="mt-5 rounded-card border border-amber-200 bg-amber-50 p-4">
          <h3 className="font-black text-park-dark">Control de cuenta y accesos</h3>
          <p className="mt-1 text-sm text-park-muted">Finalizar servicios conserva la ficha del cliente. Deshabilitar bloquea además su cuenta y revoca el QR.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Button icon={KeyRound} onClick={() => onAction(client, "end")} variant="secondary">Finalizar servicios</Button>
            {client.status === "ACTIVO" ? <Button icon={Ban} onClick={() => onAction(client, "disable")} variant="danger">Deshabilitar cuenta</Button> : <Button icon={CheckCircle2} onClick={() => onAction(client, "enable")}>Reactivar cuenta</Button>}
          </div>
        </section>
        <section className="mt-4 rounded-card border border-red-200 bg-red-50 p-4">
          <h3 className="font-black text-red-800">Reiniciar cliente de prueba</h3>
          <p className="mt-1 text-sm text-red-700">Elimina la ficha, reservas, pagos, QR, pedidos y solicitudes vinculadas. Después podrás registrar nuevamente el mismo documento y celular como cliente nuevo.</p>
          {!showDelete ? <Button className="mt-4" icon={Trash2} onClick={() => setShowDelete(true)} variant="danger">Eliminar datos de prueba</Button> : <div className="mt-4 space-y-3">
            <Input label={`Escribe ${client.documentNumber} para confirmar`} value={confirmDocument} onChange={(event) => setConfirmDocument(event.target.value)} />
            <div className="flex flex-wrap gap-2">
              <Button icon={Trash2} disabled={confirmDocument.trim() !== String(client.documentNumber).trim()} onClick={() => onAction(client, "delete", { confirmDocument })} variant="danger">Eliminar definitivamente</Button>
              <Button onClick={() => { setShowDelete(false); setConfirmDocument(""); }} variant="secondary">Cancelar</Button>
            </div>
          </div>}
        </section>
      </aside>
    </div>
  );
}

function Detail({ label, value }) {
  return <div className="rounded-card bg-park-bg p-3"><dt className="text-xs font-bold uppercase text-park-muted">{label}</dt><dd className="mt-1 font-semibold text-park-black">{value || "-"}</dd></div>;
}

function lastStay(client) {
  const stays = client.stays || [];
  if (!stays.length) return "-";
  const latest = [...stays].sort((a, b) => new Date(b.checkInAt) - new Date(a.checkInAt))[0];
  return latest?.checkInAt ? new Date(latest.checkInAt).toLocaleDateString("es-PE") : "-";
}
