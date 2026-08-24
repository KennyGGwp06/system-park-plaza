import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BedDouble, CalendarCheck, Car, CreditCard, LogIn, LogOut, RefreshCw, Search, ShoppingBag, Sparkles, Users } from "lucide-react";
import { EmptyState } from "../../components/EmptyState";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { StatusBadge } from "../../components/StatusBadge";
import { Table } from "../../components/Table";
import { useFetch } from "../../hooks/useFetch";
import { api } from "../../services/api";
import { Button, Input, PageHeader, Select } from "../../components/ui";

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("es-PE");
}

function money(value) {
  if (value === undefined || value === null) return "-";
  return `S/ ${Number(value).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function clientName(client) {
  return client ? `${client.firstName || ""} ${client.lastName || ""}`.trim() : "-";
}

function paymentContext(item) {
  if (item.stay?.room?.number) return `Estadia hab. ${item.stay.room.number}`;
  if (item.reservation?.room?.number) return `Reserva ${item.reservation.code || ""} hab. ${item.reservation.room.number}`.trim();
  if (item.event?.name) return `Evento ${item.event.name}`;
  return "Pago manual";
}

const filterableResources = ["consumos", "cochera", "contratos", "pagosEventos", "compras", "proveedores", "pagos", "facturacion", "caja", "usuarios", "auditoria"];

function rowSearchText(type, item) {
  if (type === "consumos") {
    return [
      item.code,
      item.area,
      item.status,
      item.stay?.client?.firstName,
      item.stay?.client?.lastName,
      item.stay?.client?.documentNumber,
      item.stay?.room?.number
    ].join(" ");
  }
  if (type === "cochera") {
    const active = item.entries?.[0];
    return [
      item.code,
      item.status,
      active?.plate,
      active?.brand,
      active?.model,
      active?.client?.firstName,
      active?.client?.lastName,
      active?.client?.documentNumber,
      active?.client?.stays?.[0]?.room?.number
    ].join(" ");
  }
  if (type === "contratos") {
    return [item.name, item.status, item.client?.firstName, item.client?.lastName, item.client?.documentNumber, item.space?.name].join(" ");
  }
  if (type === "pagosEventos") {
    return [item.event?.name, item.client?.firstName, item.client?.lastName, item.client?.documentNumber, item.concept, item.method, item.area].join(" ");
  }
  if (type === "pagos") {
    return [
      item.client?.firstName,
      item.client?.lastName,
      item.client?.documentNumber,
      item.concept,
      item.area,
      item.method,
      paymentContext(item)
    ].join(" ");
  }
  if (type === "facturacion") {
    return [
      item.type,
      item.series,
      item.number,
      item.status,
      item.client?.firstName,
      item.client?.lastName,
      item.client?.documentNumber
    ].join(" ");
  }
  if (type === "compras") {
    return [item.supplier?.name, item.status, item.total, item.createdAt].join(" ");
  }
  if (type === "proveedores") {
    return [item.ruc, item.name, item.contact, item.phone, item.email, item.status].join(" ");
  }
  if (type === "caja") {
    return [item.type, item.concept, item.category, item.method, item.amount, item.createdAt].join(" ");
  }
  if (type === "usuarios") {
    return [item.firstName, item.lastName, item.email, item.role?.name, item.status].join(" ");
  }
  if (type === "auditoria") {
    return [item.user?.firstName, item.user?.lastName, item.module, item.action, item.detail, item.createdAt].join(" ");
  }
  return Object.values(item || {}).join(" ");
}

function getResourceFilterValue(type, item) {
  if (type === "pagos" || type === "pagosEventos") return item.method;
  if (type === "caja") return item.type;
  if (type === "auditoria") return item.module;
  return item.status;
}

function resourceFilterOptions(type, rows) {
  const values = rows.map((item) => getResourceFilterValue(type, item)).filter(Boolean);
  return ["TODOS", ...Array.from(new Set(values))];
}

function filterResourceRows(type, rows, search, filter) {
  const needle = search.trim().toLowerCase();
  return rows.filter((item) => {
    const matchesSearch = !needle || rowSearchText(type, item).toLowerCase().includes(needle);
    const matchesFilter = filter === "TODOS" || getResourceFilterValue(type, item) === filter;
    return matchesSearch && matchesFilter;
  });
}

function resourceSearchPlaceholder(type) {
  const labels = {
    usuarios: "Buscar por nombre, correo, rol o estado",
    auditoria: "Buscar por usuario, modulo, accion o detalle",
    compras: "Buscar por proveedor, estado, total o fecha",
    proveedores: "Buscar por RUC, proveedor, contacto o correo",
    caja: "Buscar por tipo, concepto, metodo o monto",
    pagos: "Buscar por cliente, documento, operacion, metodo o concepto",
    facturacion: "Buscar por cliente, documento, serie, numero o estado",
    consumos: "Buscar por cliente, habitacion, codigo, area o estado",
    cochera: "Buscar por espacio, placa, cliente o habitacion",
    contratos: "Buscar por evento, cliente, DNI, espacio o estado",
    pagosEventos: "Buscar por evento, cliente, concepto o metodo"
  };
  return labels[type] || "Buscar registros";
}

function nextOrderStatus(order) {
  const restaurantFlow = {
    PENDIENTE: "EN_COCINA",
    EN_COCINA: "LISTO",
    LISTO: "ENTREGADO"
  };
  const barFlow = {
    PENDIENTE: "PREPARANDO",
    PREPARANDO: "LISTO",
    LISTO: "ENTREGADO"
  };
  const flow = order.area === "BARTENDER" ? barFlow : restaurantFlow;
  return flow[order.status] || null;
}

function buildReceivables(reservations = [], stays = [], events = []) {
  const reservationItems = (Array.isArray(reservations) ? reservations : [])
    .filter((reservation) => Number(reservation.balance || 0) > 0 && !["CANCELADA", "NO_SHOW", "COMPLETADA"].includes(reservation.status))
    .map((reservation) => ({
      key: `reservation-${reservation.id}`,
      origin: "Reserva",
      client: clientName(reservation.client),
      document: reservation.client?.documentNumber || "-",
      operation: `${reservation.code} - Hab. ${reservation.room?.number || "-"}`,
      balance: Number(reservation.balance || 0),
      payload: {
        clientId: reservation.clientId,
        reservationId: reservation.id,
        area: "RECEPCION",
        concept: `Pago reserva ${reservation.code}`,
        amount: Number(reservation.balance || 0).toFixed(2)
      }
    }));

  const stayItems = (Array.isArray(stays) ? stays : []).map((stay) => {
    const consumptionTotal = (stay.consumptions || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const reservationTotal = Number(stay.reservation?.totalPrice || 0);
    const paidTotal = (stay.payments || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const balance = Math.max(0, reservationTotal + consumptionTotal - paidTotal);
    return {
      key: `stay-${stay.id}`,
      origin: "Estadia",
      client: clientName(stay.client),
      document: stay.client?.documentNumber || "-",
      operation: `Hab. ${stay.room?.number || "-"} - Check-out`,
      balance,
      payload: {
        clientId: stay.clientId,
        reservationId: stay.reservationId,
        stayId: stay.id,
        area: "RECEPCION",
        concept: `Pago estadia habitacion ${stay.room?.number || "-"}`,
        amount: balance.toFixed(2)
      }
    };
  }).filter((item) => item.balance > 0);

  const eventItems = (Array.isArray(events) ? events : [])
    .filter((event) => Number(event.balance || 0) > 0 && !["CANCELADO", "FINALIZADO"].includes(event.status))
    .map((event) => ({
      key: `event-${event.id}`,
      origin: "Evento",
      client: clientName(event.client),
      document: event.client?.documentNumber || "-",
      operation: `${event.name} - ${event.space?.name || "-"}`,
      balance: Number(event.balance || 0),
      payload: {
        clientId: event.clientId,
        eventId: event.id,
        area: "EVENTOS",
        concept: `Pago evento ${event.name}`,
        amount: Number(event.balance || 0).toFixed(2)
      }
    }));

  return [...stayItems, ...reservationItems, ...eventItems].sort((a, b) => b.balance - a.balance).slice(0, 8);
}

function buildInvoiceCandidates(payments = []) {
  return (Array.isArray(payments) ? payments : [])
    .filter((payment) => !payment.invoice)
    .map((payment) => ({
      key: payment.id,
      client: clientName(payment.client),
      document: payment.client?.documentNumber || "-",
      operation: paymentContext(payment),
      concept: payment.concept,
      amount: Number(payment.amount || 0),
      payload: {
        clientId: payment.clientId || "",
        paymentId: payment.id,
        type: "BOLETA",
        series: "B001",
        subtotal: (Number(payment.amount || 0) / 1.18).toFixed(2),
        tax: (Number(payment.amount || 0) - Number(payment.amount || 0) / 1.18).toFixed(2),
        total: Number(payment.amount || 0).toFixed(2)
      }
    }))
    .filter((item) => item.payload.clientId)
    .slice(0, 8);
}

const configs = {
  operaciones: {
    title: "Nueva Operacion",
    description: "Accesos operativos para recepcion, consumos, pagos y habitaciones.",
    endpoint: "/dashboard",
    custom: "operations"
  },
  consumos: {
    title: "Consumos",
    description: "Pedidos y consumos operativos registrados por areas.",
    endpoint: "/orders",
    columns: ["Codigo", "Cliente", "Habitacion", "Area", "Estado", "Total"],
    row: (item) => [item.code, item.stay?.client ? `${item.stay.client.firstName} ${item.stay.client.lastName}` : "-", item.stay?.room?.number || item.roomId || "-", item.area, <StatusBadge value={item.status} />, money(item.total)]
  },
  cochera: {
    title: "Cochera",
    description: "Control de espacios de estacionamiento, ocupacion y disponibilidad.",
    endpoint: "/cochera",
    columns: ["Espacio", "Estado", "Placa", "Vehiculo", "Cliente", "Habitacion"],
    row: (item) => {
      const active = item.entries?.[0];
      return [
        item.code,
        <StatusBadge value={item.status} />,
        active?.plate || "-",
        active ? `${active.brand || ""} ${active.model || ""}`.trim() || "-" : "-",
        active?.client ? `${active.client.firstName} ${active.client.lastName}` : "-",
        active?.client?.stays?.[0]?.room?.number || "-"
      ];
    }
  },
  contratos: {
    title: "Contratos de Eventos",
    description: "Eventos con informacion contractual y estado comercial.",
    endpoint: "/events",
    columns: ["Evento", "Cliente", "Espacio", "Estado"],
    row: (item) => [item.name, `${item.client?.firstName || ""} ${item.client?.lastName || ""}`.trim(), item.space?.name, <StatusBadge value={item.status} />]
  },
  pagosEventos: {
    title: "Pagos de Eventos",
    description: "Pagos registrados y vinculados a eventos.",
    endpoint: "/pagos",
    transform: (data) => (Array.isArray(data) ? data : []).filter((item) => item.eventId || item.event || item.area === "EVENTOS"),
    columns: ["Evento", "Cliente", "Concepto", "Metodo", "Monto"],
    row: (item) => [item.event?.name || "-", clientName(item.client), item.concept, item.method, money(item.amount)]
  },
  compras: {
    title: "Compras",
    description: "Solicitudes y ordenes de compra conectadas con inventario.",
    endpoint: "/compras",
    columns: ["Proveedor", "Estado", "Total", "Fecha"],
    row: (item) => [item.supplier?.name || "-", <StatusBadge value={item.status} />, money(item.total), formatDate(item.createdAt)]
  },
  proveedores: {
    title: "Proveedores",
    description: "Directorio de proveedores, contacto e historial de compras.",
    endpoint: "/proveedores",
    columns: ["RUC", "Proveedor", "Contacto", "Estado"],
    row: (item) => [item.ruc, item.name, item.contact || item.phone || "-", <StatusBadge value={item.status} />]
  },
  pagos: {
    title: "Pagos",
    description: "Movimientos de pago registrados desde reservas, estadias y eventos.",
    endpoint: "/pagos",
    columns: ["Cliente", "Operacion", "Concepto", "Area", "Metodo", "Monto"],
    row: (item) => [item.client ? `${item.client.firstName} ${item.client.lastName}` : "-", paymentContext(item), item.concept, item.area, item.method, money(item.amount)]
  },
  facturacion: {
    title: "Facturacion",
    description: "Comprobantes emitidos y estado documental.",
    endpoint: "/facturacion",
    columns: ["Tipo", "Serie", "Numero", "Cliente", "Fecha", "Total", "Estado", "Acciones"],
    row: (item) => [item.type, item.series, item.number, item.client ? `${item.client.firstName} ${item.client.lastName}` : "-", formatDate(item.issuedAt), money(item.total), <StatusBadge value={item.status} />, <div className="flex gap-2"><Button size="sm" variant="secondary">Ver</Button><Button size="sm" variant="secondary">Descargar</Button></div>]
  },
  caja: {
    title: "Caja General",
    description: "Ingresos, egresos y movimientos de caja conectados a pagos.",
    endpoint: "/caja",
    transform: (data) => data?.movements || [],
    columns: ["Tipo", "Concepto", "Metodo", "Monto"],
    row: (item) => [<StatusBadge value={item.type} />, item.concept, item.method || "-", money(item.amount)]
  },
  usuarios: {
    title: "Usuarios",
    description: "Usuarios del ERP, roles asignados y estado de acceso.",
    endpoint: "/usuarios",
    columns: ["Nombre", "Email", "Rol", "Estado"],
    row: (item) => [`${item.firstName} ${item.lastName}`, item.email, item.role?.name, <StatusBadge value={item.status} />]
  },
  roles: {
    title: "Roles y Permisos",
    description: "Matriz base de permisos por rol y modulo.",
    endpoint: "/roles",
    columns: ["Rol", "Descripcion", "Permisos"],
    row: (item) => [item.name, item.description || "-", item.permissions?.length || 0]
  },
  auditoria: {
    title: "Auditoria",
    description: "Actividad registrada por usuario, modulo y accion.",
    endpoint: "/auditoria",
    columns: ["Usuario", "Modulo", "Accion", "Detalle", "Fecha"],
    row: (item) => [item.user ? `${item.user.firstName} ${item.user.lastName}` : "Sistema", item.module, item.action, item.detail || "-", formatDate(item.createdAt)]
  },
  configuracion: {
    title: "Configuracion",
    description: "Parametros generales del hotel y sistema.",
    endpoint: "/configuracion",
    columns: ["Hotel", "RUC", "Telefono", "Moneda"],
    row: (item) => [item.hotelName, item.ruc || "-", item.phone || "-", item.currency]
  }
};

export function AdminResourcePage({ type }) {
  const config = configs[type];
  const { data, loading, error, reload } = useFetch(config.endpoint, { initialData: [] });
  const { data: suppliersData } = useFetch("/proveedores", { initialData: [] });
  const { data: productsData } = useFetch("/products", { initialData: [] });
  const { data: rolesData } = useFetch("/roles", { initialData: [] });
  const { data: reservationsData, reload: reloadReservations } = useFetch("/reservations", { initialData: [], enabled: type === "pagos" });
  const { data: staysData, reload: reloadStays } = useFetch("/checkout/stays", { initialData: [], enabled: type === "pagos" });
  const { data: eventsData, reload: reloadEvents } = useFetch("/events", { initialData: [], enabled: type === "pagos" });
  const { data: paymentsData, reload: reloadPaymentsForInvoices } = useFetch("/pagos", { initialData: [], enabled: type === "facturacion" });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [resourceFilter, setResourceFilter] = useState("TODOS");
  const [formPrefill, setFormPrefill] = useState(null);

  if (loading) return <LoadingSpinner />;
  if (error) return <p className="rounded-card bg-park-danger-soft p-4 font-semibold text-park-danger">{error.message}</p>;

  if (config.custom === "operations") {
    return <OperationsPage data={data} />;
  }

  const rows = config.transform ? config.transform(data) : Array.isArray(data) ? data : data?.items || [];
  const filterOptions = resourceFilterOptions(type, rows);
  const visibleRows = filterableResources.includes(type) ? filterResourceRows(type, rows, search, resourceFilter) : rows;
  const receivables = type === "pagos" ? buildReceivables(reservationsData, staysData, eventsData) : [];
  const invoiceCandidates = type === "facturacion" ? buildInvoiceCandidates(paymentsData) : [];
  const context = {
    parkingSpaces: type === "cochera" ? rows : [],
    suppliers: Array.isArray(suppliersData) ? suppliersData : [],
    products: Array.isArray(productsData) ? productsData : [],
    roles: Array.isArray(rolesData) ? rolesData : [],
    payments: Array.isArray(paymentsData) ? paymentsData : []
  };

  async function handleSubmit(payload) {
    setSaving(true);
    try {
      const method = type === "configuracion" ? "PUT" : "POST";
      const path = type === "caja" ? `${config.endpoint}/movements` : type === "cochera" ? `${config.endpoint}/entries` : config.endpoint;
      await api(path, { method, body: payload });
      await reload();
      if (type === "pagos") {
        await Promise.all([reloadReservations(), reloadStays(), reloadEvents()]);
      }
      if (type === "facturacion") {
        await reloadPaymentsForInvoices();
      }
      setFormPrefill(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleAction(action, item) {
    setSaving(true);
    try {
      if (action === "vehicleExit") {
        const entry = item.entries?.[0];
        if (entry) await api(`/cochera/entries/${entry.id}/finish`, { method: "PATCH" });
      }
      if (action === "receivePurchase") {
        await api(`/compras/${item.id}/receive`, { method: "PATCH" });
      }
      if (action === "orderStatus") {
        await api(`/orders/${item.id}/status`, { method: "PATCH", body: { status: nextOrderStatus(item) } });
      }
      await reload();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Modulo ERP"
        title={config.title}
        description={config.description}
        actions={
          <Button variant="secondary" icon={RefreshCw} onClick={reload}>Actualizar</Button>
        }
      />
      {type === "caja" && data?.summary ? (
        <section className="mb-6 grid gap-4 md:grid-cols-3">
          <SummaryCard label="Ingresos" value={money(data.summary.income)} />
          <SummaryCard label="Egresos" value={money(data.summary.expenses)} />
          <SummaryCard label="Saldo" value={money(data.summary.balance)} />
        </section>
      ) : null}
      {filterableResources.includes(type) ? (
        <section className="mb-6 rounded-card border border-park-border bg-white p-4 shadow-card">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative lg:w-[420px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-park-muted" size={17} />
              <input
                className="h-10 w-full rounded-input border border-park-border bg-white px-3 pl-9 text-sm text-park-black outline-none transition placeholder:text-park-muted focus:border-park-green focus:ring-2 focus:ring-park-green/15"
                placeholder={resourceSearchPlaceholder(type)}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {filterOptions.map((option) => (
                <button
                  className={`rounded-button border px-3 py-2 text-xs font-black transition ${resourceFilter === option ? "border-park-green bg-park-green text-white" : "border-park-border bg-white text-park-muted hover:border-park-green hover:text-park-green"}`}
                  key={option}
                  type="button"
                  onClick={() => setResourceFilter(option)}
                >
                  {option === "TODOS" ? "Todos" : option}
                </button>
              ))}
            </div>
          </div>
        </section>
      ) : null}
      {type === "pagos" ? (
        <ReceivablesPanel items={receivables} onSelect={(item) => setFormPrefill(item.payload)} />
      ) : null}
      {type === "facturacion" ? (
        <InvoiceCandidatesPanel items={invoiceCandidates} onSelect={(item) => setFormPrefill(item.payload)} />
      ) : null}
      {type === "configuracion" ? (
        <SettingsPanel rows={rows} onSubmit={handleSubmit} saving={saving} />
      ) : (
        <ResourceForm type={type} onSubmit={handleSubmit} saving={saving} context={context} prefill={formPrefill} />
      )}
      {type !== "configuracion" && visibleRows.length ? (
        <Table
          columns={["consumos", "cochera", "compras"].includes(type) ? [...config.columns, "Acciones"] : config.columns}
          rows={visibleRows}
          renderRow={(item) => (
            <tr key={item.id}>
              {config.row(item).map((cell, index) => <td className="px-4 py-3" key={index}>{cell}</td>)}
              {type === "cochera" ? (
                <td className="px-4 py-3">
                  {item.entries?.[0] ? <Button disabled={saving} onClick={() => handleAction("vehicleExit", item)} size="sm" variant="secondary">Registrar salida</Button> : "-"}
                </td>
              ) : null}
              {type === "consumos" ? (
                <td className="px-4 py-3">
                  {nextOrderStatus(item) ? (
                    <Button disabled={saving} onClick={() => handleAction("orderStatus", item)} size="sm" variant={nextOrderStatus(item) === "ENTREGADO" ? "gold" : "secondary"}>
                      Pasar a {nextOrderStatus(item).replaceAll("_", " ")}
                    </Button>
                  ) : (
                    <StatusBadge value={item.status} />
                  )}
                </td>
              ) : null}
              {type === "compras" ? (
                <td className="px-4 py-3">
                  {item.status !== "RECIBIDA" ? <Button disabled={saving} onClick={() => handleAction("receivePurchase", item)} size="sm" variant="gold">Recibir</Button> : <StatusBadge value="RECIBIDA" />}
                </td>
              ) : null}
            </tr>
          )}
        />
      ) : type !== "configuracion" ? (
        <EmptyState title={`Sin registros en ${config.title}`} description={rows.length ? "No hay resultados con los filtros actuales." : "Cuando existan datos en PostgreSQL apareceran en esta vista."} />
      ) : null}
    </div>
  );
}

function ResourceForm({ type, onSubmit, saving, context, prefill }) {
  const [form, setForm] = useState(defaultForm(type));
  const supported = ["cochera", "proveedores", "compras", "pagos", "facturacion", "caja", "usuarios"];

  useEffect(() => {
    if (prefill) setForm({ ...defaultForm(type), ...prefill });
  }, [prefill, type]);

  if (!supported.includes(type)) return null;

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    const payload = normalizePayload(type, form);
    await onSubmit(payload);
    setForm(defaultForm(type));
  }

  return (
    <form className="mb-6 rounded-card border border-park-border bg-white p-5 shadow-card" onSubmit={submit}>
      <h2 className="mb-4 font-sans text-lg font-semibold text-park-black">{formTitle(type)}</h2>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {type === "cochera" ? (
          <>
            <Select label="Espacio" value={form.spaceId} onChange={(event) => update("spaceId", event.target.value)} required>
              <option value="">Seleccionar</option>
              {context.parkingSpaces.filter((space) => space.status !== "OCUPADO").map((space) => <option key={space.id} value={space.id}>{space.code}</option>)}
            </Select>
            <Input label="Placa" value={form.plate} onChange={(event) => update("plate", event.target.value.toUpperCase())} required />
            <Input label="Marca" value={form.brand} onChange={(event) => update("brand", event.target.value)} />
            <Input label="Modelo" value={form.model} onChange={(event) => update("model", event.target.value)} />
          </>
        ) : null}
        {type === "proveedores" ? (
          <>
            <Input label="RUC" value={form.ruc} onChange={(event) => update("ruc", event.target.value)} required />
            <Input label="Proveedor" value={form.name} onChange={(event) => update("name", event.target.value)} required />
            <Input label="Telefono" value={form.phone} onChange={(event) => update("phone", event.target.value)} />
            <Input label="Correo" type="email" value={form.email} onChange={(event) => update("email", event.target.value)} />
          </>
        ) : null}
        {type === "compras" ? (
          <>
            <Select label="Proveedor" value={form.supplierId} onChange={(event) => update("supplierId", event.target.value)} required>
              <option value="">Seleccionar</option>
              {context.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
            </Select>
            <Select label="Producto" value={form.productId} onChange={(event) => update("productId", event.target.value)} required>
              <option value="">Seleccionar</option>
              {context.products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
            </Select>
            <Input label="Cantidad" type="number" min="1" value={form.quantity} onChange={(event) => update("quantity", event.target.value)} required />
            <Input label="Costo" type="number" min="0" step="0.01" value={form.cost} onChange={(event) => update("cost", event.target.value)} required />
          </>
        ) : null}
        {type === "pagos" || type === "caja" ? (
          <>
            {type === "pagos" && (form.reservationId || form.stayId || form.eventId) ? (
              <div className="rounded-card border border-park-border bg-park-bg p-3 text-sm md:col-span-2 xl:col-span-4">
                <span className="font-black text-park-dark">Operacion vinculada</span>
                <p className="mt-1 text-park-muted">
                  {form.stayId ? `Estadia #${form.stayId}` : form.reservationId ? `Reserva #${form.reservationId}` : `Evento #${form.eventId}`}
                </p>
              </div>
            ) : null}
            {type === "caja" ? (
              <Select label="Tipo" value={form.type} onChange={(event) => update("type", event.target.value)} required>
                <option value="INGRESO">Ingreso</option>
                <option value="EGRESO">Egreso</option>
              </Select>
            ) : (
              <Input label="Area" value={form.area} onChange={(event) => update("area", event.target.value)} required />
            )}
            <Input label="Concepto" value={form.concept} onChange={(event) => update("concept", event.target.value)} required />
            <Select label="Metodo" value={form.method} onChange={(event) => update("method", event.target.value)} required>
              {["EFECTIVO", "TARJETA", "YAPE", "PLIN"].map((method) => <option key={method}>{method}</option>)}
            </Select>
            <Input label="Monto" type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => update("amount", event.target.value)} required />
          </>
        ) : null}
        {type === "facturacion" ? (
          <>
            <Select label="Pago" value={form.paymentId} onChange={(event) => {
              const payment = context.payments.find((item) => String(item.id) === event.target.value);
              const total = Number(payment?.amount || 0);
              setForm((current) => ({
                ...current,
                paymentId: event.target.value,
                clientId: payment?.clientId || current.clientId,
                subtotal: total ? (total / 1.18).toFixed(2) : current.subtotal,
                tax: total ? (total - total / 1.18).toFixed(2) : current.tax,
                total: total ? total.toFixed(2) : current.total
              }));
            }} required>
              <option value="">Seleccionar pago</option>
              {context.payments.filter((payment) => !payment.invoice && payment.clientId).map((payment) => (
                <option key={payment.id} value={payment.id}>{clientName(payment.client)} - {payment.concept} - {money(payment.amount)}</option>
              ))}
            </Select>
            <Select label="Tipo" value={form.type} onChange={(event) => update("type", event.target.value)} required>
              <option value="BOLETA">Boleta</option>
              <option value="FACTURA">Factura</option>
            </Select>
            <Input label="Serie" value={form.series} onChange={(event) => update("series", event.target.value.toUpperCase())} required />
            <Input label="Subtotal" type="number" min="0" step="0.01" value={form.subtotal} onChange={(event) => update("subtotal", event.target.value)} required />
            <Input label="IGV" type="number" min="0" step="0.01" value={form.tax} onChange={(event) => update("tax", event.target.value)} required />
            <Input label="Total" type="number" min="0.01" step="0.01" value={form.total} onChange={(event) => update("total", event.target.value)} required />
          </>
        ) : null}
        {type === "usuarios" ? (
          <>
            <Input label="Nombre" value={form.firstName} onChange={(event) => update("firstName", event.target.value)} required />
            <Input label="Apellido" value={form.lastName} onChange={(event) => update("lastName", event.target.value)} required />
            <Input label="Correo" type="email" value={form.email} onChange={(event) => update("email", event.target.value)} required />
            <Select label="Rol" value={form.roleId} onChange={(event) => update("roleId", event.target.value)} required>
              <option value="">Seleccionar</option>
              {context.roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
            </Select>
          </>
        ) : null}
      </div>
      <div className="mt-4 flex justify-end">
        <Button loading={saving} type="submit" variant="gold">{submitLabel(type)}</Button>
      </div>
    </form>
  );
}

function SettingsPanel({ rows, onSubmit, saving }) {
  const current = Array.isArray(rows) ? rows[0] : rows;
  const [form, setForm] = useState({
    hotelName: current?.hotelName || "Hotel Park Plaza",
    ruc: current?.ruc || "",
    phone: current?.phone || "",
    email: current?.email || "",
    logoUrl: current?.logoUrl || "",
    currency: current?.currency || "PEN",
    taxRate: current?.taxRate || "18",
    timezone: current?.timezone || "America/Lima",
    dateFormat: current?.dateFormat || "dd/MM/yyyy",
    address: current?.address || ""
  });

  function update(key, value) {
    setForm((state) => ({ ...state, [key]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    await onSubmit(form);
  }

  return (
    <form className="space-y-5" onSubmit={submit}>
      <section className="rounded-card border border-park-border bg-white p-5 shadow-card">
        <div className="mb-4">
          <h2 className="font-sans text-lg font-semibold text-park-black">Datos del hotel</h2>
          <p className="text-sm text-park-muted">Informacion institucional utilizada por el ERP.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Input label="Hotel" value={form.hotelName} onChange={(event) => update("hotelName", event.target.value)} required />
          <Input label="RUC" value={form.ruc} onChange={(event) => update("ruc", event.target.value)} />
          <Input label="Telefono" value={form.phone} onChange={(event) => update("phone", event.target.value)} />
          <Input label="Correo" type="email" value={form.email} onChange={(event) => update("email", event.target.value)} />
          <div className="md:col-span-2 xl:col-span-4">
            <Input label="Direccion" value={form.address} onChange={(event) => update("address", event.target.value)} />
          </div>
        </div>
      </section>

      <section className="rounded-card border border-park-border bg-white p-5 shadow-card">
        <div className="mb-4">
          <h2 className="font-sans text-lg font-semibold text-park-black">Identidad visual</h2>
          <p className="text-sm text-park-muted">Logo institucional almacenado como URL para reportes y pantallas del sistema.</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
          <Input label="URL del logo" value={form.logoUrl} onChange={(event) => update("logoUrl", event.target.value)} />
          <div className="flex min-h-28 items-center justify-center rounded-card border border-dashed border-park-border bg-park-bg p-3">
            {form.logoUrl ? (
              <img className="max-h-24 max-w-full object-contain" src={form.logoUrl} alt="Logo configurado" />
            ) : (
              <span className="text-center text-sm font-semibold text-park-muted">Sin logo configurado</span>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-card border border-park-border bg-white p-5 shadow-card">
        <div className="mb-4">
          <h2 className="font-sans text-lg font-semibold text-park-black">Sistema</h2>
          <p className="text-sm text-park-muted">Parametros generales disponibles actualmente.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Input label="Moneda" value={form.currency} onChange={(event) => update("currency", event.target.value.toUpperCase())} />
          <Input label="IGV / impuesto (%)" type="number" min="0" step="0.01" value={form.taxRate} onChange={(event) => update("taxRate", event.target.value)} />
          <Input label="Zona horaria" value={form.timezone} onChange={(event) => update("timezone", event.target.value)} />
          <Input label="Formato de fecha" value={form.dateFormat} onChange={(event) => update("dateFormat", event.target.value)} />
        </div>
      </section>

      <div className="flex justify-end">
        <Button loading={saving} type="submit" variant="gold">Guardar configuracion</Button>
      </div>
    </form>
  );
}

function ReceivablesPanel({ items, onSelect }) {
  return (
    <section className="mb-6 rounded-card border border-park-border bg-white p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-sans text-lg font-semibold text-park-black">Pendientes por cobrar</h2>
          <p className="text-sm text-park-muted">Reservas, estadias y eventos con saldo pendiente.</p>
        </div>
        <span className="rounded-button bg-park-green-soft px-3 py-1 text-sm font-black text-park-green">{items.length}</span>
      </div>
      {items.length ? (
        <div className="grid gap-3 xl:grid-cols-2">
          {items.map((item) => (
            <article className="rounded-card border border-park-border bg-park-bg p-4" key={item.key}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="rounded-button bg-white px-2 py-1 text-xs font-black text-park-green">{item.origin}</span>
                  <h3 className="mt-2 font-black text-park-dark">{item.client}</h3>
                  <p className="text-xs font-semibold text-park-muted">Doc. {item.document}</p>
                </div>
                <strong className="text-right font-display text-xl font-semibold text-park-dark">{money(item.balance)}</strong>
              </div>
              <p className="mt-3 text-sm text-park-muted">{item.operation}</p>
              <div className="mt-4 flex justify-end">
                <Button size="sm" type="button" onClick={() => onSelect(item)}>Cobrar</Button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState title="Sin saldos pendientes" description="No hay reservas, estadias o eventos con saldo por cobrar." />
      )}
    </section>
  );
}

function InvoiceCandidatesPanel({ items, onSelect }) {
  return (
    <section className="mb-6 rounded-card border border-park-border bg-white p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-sans text-lg font-semibold text-park-black">Pagos sin comprobante</h2>
          <p className="text-sm text-park-muted">Selecciona un pago registrado para preparar la emision.</p>
        </div>
        <span className="rounded-button bg-park-gold/20 px-3 py-1 text-sm font-black text-park-black">{items.length}</span>
      </div>
      {items.length ? (
        <div className="grid gap-3 xl:grid-cols-2">
          {items.map((item) => (
            <article className="rounded-card border border-park-border bg-park-bg p-4" key={item.key}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-black text-park-dark">{item.client}</h3>
                  <p className="text-xs font-semibold text-park-muted">Doc. {item.document}</p>
                </div>
                <strong className="text-right font-display text-xl font-semibold text-park-dark">{money(item.amount)}</strong>
              </div>
              <p className="mt-3 text-sm text-park-muted">{item.operation}</p>
              <p className="text-sm font-semibold text-park-dark">{item.concept}</p>
              <div className="mt-4 flex justify-end">
                <Button size="sm" type="button" variant="gold" onClick={() => onSelect(item)}>Emitir</Button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState title="Sin pagos pendientes de comprobante" description="Los pagos disponibles para facturacion apareceran aqui." />
      )}
    </section>
  );
}

function defaultForm(type) {
  const forms = {
    cochera: { spaceId: "", plate: "", brand: "", model: "" },
    proveedores: { ruc: "", name: "", phone: "", email: "", status: "ACTIVO" },
    compras: { supplierId: "", productId: "", quantity: "1", cost: "0" },
    pagos: { clientId: "", reservationId: "", stayId: "", eventId: "", area: "RECEPCION", concept: "", method: "EFECTIVO", amount: "" },
    facturacion: { clientId: "", paymentId: "", type: "BOLETA", series: "B001", subtotal: "", tax: "", total: "" },
    caja: { type: "INGRESO", concept: "", method: "EFECTIVO", amount: "" },
    usuarios: { firstName: "", lastName: "", email: "", roleId: "", status: "ACTIVO" },
    configuracion: { hotelName: "Hotel Park Plaza", ruc: "", phone: "", email: "", logoUrl: "", currency: "PEN", taxRate: "18", timezone: "America/Lima", dateFormat: "dd/MM/yyyy", address: "" }
  };
  return forms[type] || {};
}

function normalizePayload(type, form) {
  if (type === "compras") {
    return {
      supplierId: form.supplierId,
      items: [{ productId: form.productId, quantity: form.quantity, cost: form.cost }]
    };
  }
  return form;
}

function formTitle(type) {
  const labels = {
    cochera: "Registrar vehiculo",
    proveedores: "Nuevo proveedor",
    compras: "Nueva compra simple",
    pagos: "Registrar pago",
    facturacion: "Emitir comprobante",
    caja: "Registrar movimiento",
    usuarios: "Nuevo usuario",
    configuracion: "Actualizar datos del hotel"
  };
  return labels[type];
}

function submitLabel(type) {
  return type === "configuracion" ? "Guardar configuracion" : "Guardar";
}

function SummaryCard({ label, value }) {
  return (
    <article className="rounded-card border border-park-border bg-white p-5 shadow-card">
      <p className="text-sm font-medium text-park-muted">{label}</p>
      <strong className="mt-2 block font-display text-[28px] font-semibold text-park-dark">{value}</strong>
    </article>
  );
}

function OperationsPage({ data }) {
  const metrics = data.metrics || {};
  const modules = data.modules || {};
  const links = [
    { label: "Reservas", href: "/reservas", icon: CalendarCheck, helper: "Crear y revisar reservas", tone: "bg-purple-50 text-purple-700" },
    { label: "Check-in", href: "/checkin", icon: LogIn, helper: "Registrar llegadas", tone: "bg-emerald-50 text-park-green" },
    { label: "Check-out", href: "/checkout", icon: LogOut, helper: "Cerrar estadias", tone: "bg-cyan-50 text-cyan-700" },
    { label: "Pagos", href: "/pagos", icon: CreditCard, helper: "Cobros y saldos", tone: "bg-amber-50 text-amber-700" },
    { label: "Habitaciones", href: "/habitaciones", icon: BedDouble, helper: "Disponibilidad y estados", tone: "bg-slate-100 text-slate-700" },
    { label: "Cochera", href: "/cochera", icon: Car, helper: "Ingresos vehiculares", tone: "bg-green-50 text-green-700" },
    { label: "Consumos", href: "/consumos", icon: ShoppingBag, helper: "Pedidos operativos", tone: "bg-orange-50 text-orange-700" },
    { label: "Eventos", href: "/eventos/calendario", icon: Sparkles, helper: "Reservas de espacios", tone: "bg-pink-50 text-pink-700" }
  ];
  const pendingCleaning = Array.isArray(modules.cleaning) ? modules.cleaning.slice(0, 4) : [];
  const activeOrders = Array.isArray(modules.orders) ? modules.orders.slice(0, 4) : [];

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Recepcion" title="Nueva Operacion" description="Centro de accesos rapidos para la operacion diaria del hotel." />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Stat label="Reservas hoy" value={metrics.reservationsToday} />
        <Stat label="Check-ins hoy" value={metrics.checkInsToday} />
        <Stat label="Check-outs hoy" value={metrics.checkOutsToday} />
        <Stat label="Habitaciones libres" value={metrics.availableRooms} />
        <Stat label="Huespedes" value={metrics.hostedGuests} />
      </section>

      <section className="rounded-card border border-park-border bg-white p-5 shadow-card">
        <div className="mb-4">
          <h2 className="font-sans text-lg font-semibold text-park-black">Acciones por area</h2>
          <p className="text-sm text-park-muted">Accesos principales agrupados para resolver operaciones sin recorrer todo el menu.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {links.map(({ label, href, icon: Icon, helper, tone }) => (
            <Link className="group rounded-card border border-park-border bg-park-bg p-4 transition hover:border-park-green hover:bg-white hover:shadow-card" key={href} to={href}>
              <div className="flex items-start gap-3">
                <span className={`grid h-11 w-11 place-items-center rounded-button ${tone}`}>
                  <Icon size={19} />
                </span>
                <span>
                  <span className="block font-black text-park-black group-hover:text-park-green">{label}</span>
                  <span className="mt-1 block text-sm font-medium text-park-muted">{helper}</span>
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-card border border-park-border bg-white p-5 shadow-card">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-sans text-lg font-semibold text-park-black">Limpieza pendiente</h2>
              <p className="text-sm text-park-muted">Habitaciones que requieren seguimiento operativo.</p>
            </div>
            <Link className="text-sm font-black text-park-green" to="/limpieza/pendientes">Ver modulo</Link>
          </div>
          {pendingCleaning.length ? (
            <div className="space-y-3">
              {pendingCleaning.map((task) => (
                <div className="flex items-center justify-between gap-3 rounded-card border border-park-border bg-park-bg p-3" key={task.id}>
                  <div>
                    <p className="font-black text-park-black">Habitacion {task.room?.number || "-"}</p>
                    <p className="text-sm font-medium text-park-muted">{task.status?.replaceAll("_", " ") || "Pendiente"}</p>
                  </div>
                  <StatusBadge value={task.status} />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Sin pendientes" description="No hay tareas de limpieza pendientes en este momento." />
          )}
        </div>

        <div className="rounded-card border border-park-border bg-white p-5 shadow-card">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-sans text-lg font-semibold text-park-black">Pedidos activos</h2>
              <p className="text-sm text-park-muted">Consumos en restaurante y bartender.</p>
            </div>
            <Link className="text-sm font-black text-park-green" to="/consumos">Ver consumos</Link>
          </div>
          {activeOrders.length ? (
            <div className="space-y-3">
              {activeOrders.map((order) => (
                <div className="flex items-center justify-between gap-3 rounded-card border border-park-border bg-park-bg p-3" key={order.id}>
                  <div>
                    <p className="font-black text-park-black">{order.code || `Pedido ${order.id}`}</p>
                    <p className="text-sm font-medium text-park-muted">{order.area} / {money(order.total)}</p>
                  </div>
                  <StatusBadge value={order.status} />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Sin pedidos activos" description="Los pedidos en curso apareceran aqui." />
          )}
        </div>
      </section>

      <section className="rounded-card border border-park-border bg-white p-5 shadow-card">
        <h2 className="font-sans text-lg font-semibold text-park-black">Resumen operativo</h2>
        <dl className="mt-4 grid gap-4 md:grid-cols-3">
          <DetailStat label="No show" value={metrics.noShow} />
          <DetailStat label="Incidencias abiertas" value={metrics.incidentsOpen} />
          <DetailStat label="Eventos proximos" value={Array.isArray(data.upcomingEvents) ? data.upcomingEvents.length : 0} />
        </dl>
      </section>
    </div>
  );
}

function DetailStat({ label, value }) {
  return (
    <div className="rounded-card bg-park-bg p-4">
      <dt className="text-sm font-semibold text-park-muted">{label}</dt>
      <dd className="mt-2 font-display text-2xl font-semibold text-park-dark">{value || 0}</dd>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <article className="rounded-card border border-park-border bg-white p-5 shadow-card">
      <p className="text-sm font-semibold text-park-muted">{label}</p>
      <strong className="mt-2 block font-display text-[28px] font-semibold text-park-dark">{value || 0}</strong>
    </article>
  );
}
