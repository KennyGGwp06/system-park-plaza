// Cocina / Bar › Mi turno. Lo que el cocinero o bartender ve al llegar: su turno, cuántos pedidos hay por etapa, el inventario del día
// (abrirlo si está por abrir), platos que se están agotando y envíos de insumos por recibir.
import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, ClipboardCheck, Clock3, PackageCheck, Unlock, Wine } from "lucide-react";
import { api } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { Alert, Empty, Tag, dateLong, timeOf, todayKey, useShift, useToast } from "../recepcion/rxkit";
import { SESSION_LABEL, useKitchen } from "./KitchenShell";
import { elapsedText, timerTone } from "./KitchenOrdersPage";

export function KitchenHomePage() {
  const show = useToast();
  const { active: shiftActive, openClock, record } = useShift();
  const { station, active, late, activeSession, lastSession, awaitingReview, reloadSession, recipes, incoming, openBottles } = useKitchen();
  const base = station.base;
  const OrderIcon = station.icon;
  const isBar = station.area === "BARTENDER";
  const closing = useFetch("/inventory-closing/suggestions", { initialData: null, realtime: false });
  const requests = useFetch("/stock-requests", { initialData: [], realtime: true, pollInterval: 30000 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const count = (...statuses) => active.filter((row) => statuses.includes(row.status)).length;
  const session = activeSession || lastSession;
  const [sessionLabel, sessionTone] = SESSION_LABEL[session?.status] || ["Sin inventario del turno", "off"];
  const pendingRequests = (requests.data || []).filter((row) => row.status === "REQUESTED").length;
  const low = recipes.filter((row) => Number.isFinite(Number(row.availablePortions))).sort((a, b) => Number(a.availablePortions) - Number(b.availablePortions)).slice(0, 6);
  const queue = active.slice().sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))).slice(0, 6);

  async function openInventory() {
    setBusy(true); setError("");
    try { await api(`/operational-inventory/sessions/${activeSession.id}/open`, { method: "POST", body: { useSystemBalance: true } }); show("Inventario del turno abierto. Ya se descuentan los insumos de cada pedido."); reloadSession(); }
    catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }

  return <>
    <section className="rx-day">
      <div>
        <small>{station.name} · {shiftActive ? `en turno desde ${timeOf(record?.checkIn || record?.clockIn)}` : "turno sin iniciar"}</small>
        <h1>{dateLong(todayKey())}</h1>
        <p>{shiftActive ? `${active.length} pedido(s) en curso${late.length ? ` · ${late.length} fuera de tiempo` : ""} · inventario: ${sessionLabel.toLowerCase()}${closing.data?.closing?.closingTime ? ` · cierre a las ${closing.data.closing.closingTime}` : ""}` : "Marca tu entrada con DNI y PIN para preparar pedidos y mover insumos."}</p>
        <div className="rx-day-actions">
          {shiftActive ? <><Link className="rx-btn rx-btn--primary" to={`${base}/pedidos`}><OrderIcon />Ir a pedidos</Link><Link className="rx-btn" to={`${base}/inventario/recetas`}><BookOpen />Recetario</Link>{isBar ? <Link className="rx-btn" to={`${base}/botellas`}><Wine />Botellas</Link> : null}<Link className="rx-btn" to={`${base}/inventario/cierre`}><ClipboardCheck />Cierre del día</Link></> : <button className="rx-btn rx-btn--primary" type="button" onClick={openClock}><Clock3 />Iniciar turno</button>}
        </div>
      </div>
      <div className="rx-day-stats">
        <div><b>{count("PENDIENTE")}</b><span>nuevos por aceptar</span></div>
        <div><b>{count("EN_COCINA", "PREPARANDO")}</b><span>en preparación</span></div>
        <div><b>{count("LISTO")}</b><span>listos por entregar</span></div>
        <div><b style={{ color: late.length ? "#FF9AA2" : undefined }}>{late.length}</b><span>fuera de tiempo</span></div>
      </div>
    </section>

    <div className="rx-grid rx-g-2">
      <section className="rx-card">
        <div className="rx-card-h"><div><h2>Pedidos en curso</h2><p>Del más antiguo al más reciente</p></div><Link to={`${base}/pedidos`}>Abrir tablero <ArrowRight size={14} /></Link></div>
        {queue.length ? <ul className="rx-list">{queue.map((row) => <li key={row.id}>
          <span className={`kd-timer ${timerTone(row)}`}>{elapsedText(row.createdAt)}</span>
          <div className="grow"><b>{row.code} · {row.destination?.label || "Pedido"}</b><small>{(row.items || []).map((item) => `${item.quantity}× ${item.name}`).join(", ")}</small></div>
          <Tag tone={row.status === "LISTO" ? "ok" : row.status === "PENDIENTE" ? "warn" : "info"}>{{ PENDIENTE: "Nuevo", EN_COCINA: "Aceptado", PREPARANDO: "Preparando", LISTO: "Listo" }[row.status]}</Tag>
        </li>)}</ul> : <Empty icon={OrderIcon} title="Sin pedidos en curso">Los pedidos {isBar ? "del Bar" : "del Restaurante"} aparecerán aquí al llegar.</Empty>}
      </section>

      <div className="rx-stack">
        <section className="rx-card">
          <div className="rx-card-h"><div><h2>Inventario del turno</h2><p>{session ? `${session.shift || ""} · ${session.date ? String(session.date).slice(0, 10).split("-").reverse().join("/") : ""}` : "Aún no hay inventario asignado"}</p></div><Tag tone={sessionTone}>{sessionLabel}</Tag></div>
          <div className="rx-card-b" style={{ display: "grid", gap: 10 }}>
            {activeSession?.status === "PENDING" ? <>
              <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>Ábrelo para empezar: parte del conteo del último cierre y desde ese momento cada pedido entregado descuenta sus insumos.</p>
              {awaitingReview ? <Alert tone="warn">El cierre {awaitingReview.shift} {awaitingReview.status === "OBSERVED" ? "fue observado" : "espera la revisión"} del dueño. Hasta que lo apruebe no se puede abrir el inventario de hoy ni aceptar pedidos.</Alert> : null}
              <button className="rx-btn rx-btn--primary" type="button" onClick={openInventory} disabled={busy || !shiftActive || Boolean(awaitingReview)} style={{ justifySelf: "start" }}><Unlock />Abrir inventario del turno</button>
            </> : ["OPEN", "OPERATING", "REOPENED"].includes(activeSession?.status) ? <p style={{ margin: 0, fontSize: 13 }}>Abierto desde {timeOf(activeSession.openedAt)}. Al terminar la jornada haz el conteo en <Link className="rx-link" to={`${base}/inventario/cierre`}>Cierre del día</Link>.</p>
              : activeSession?.status === "COUNTING" ? <p style={{ margin: 0, fontSize: 13 }}>Conteo de cierre en curso. <Link className="rx-link" to={`${base}/inventario/cierre`}>Continuar el conteo</Link></p>
              : <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>{session?.status === "SUBMITTED" ? "El último cierre fue enviado y espera la revisión del dueño. Cuando lo apruebe, el siguiente turno parte de ese conteo." : `Se crea al marcar tu entrada; si no aparece, el dueño lo asigna desde su panel (Turnos y cierres).`}</p>}
            {error ? <Alert tone="crit">{error}</Alert> : null}
          </div>
        </section>
        <section className="rx-card">
          <div className="rx-card-h"><div><h2>Insumos</h2><p>Envíos del almacén y tus solicitudes</p></div><Link to={`${base}/inventario/solicitudes`}>Pedir y recibir <ArrowRight size={14} /></Link></div>
          <div className="rx-attn">
            <Link className={incoming.length ? "info" : ""} to={`${base}/inventario/solicitudes?vista=recibir`}><b>{incoming.length}</b><span>envío(s) por recibir y contar</span><ArrowRight size={14} /></Link>
            <Link className={pendingRequests ? "warn" : ""} to={`${base}/inventario/solicitudes`}><b>{pendingRequests}</b><span>solicitud(es) esperando al dueño</span><ArrowRight size={14} /></Link>
            {isBar ? <Link className={openBottles.length ? "info" : ""} to={`${base}/botellas`}><b>{openBottles.length}</b><span>botella(s) abierta(s) en la barra</span><ArrowRight size={14} /></Link> : null}
          </div>
        </section>
      </div>
    </div>

    <section className="rx-card rx-mt">
      <div className="rx-card-h"><div><h2>{station.Items} que se agotan primero</h2><p>Porciones que alcanzan con el stock de {station.stock} y el insumo que lo limita</p></div><Link to={`${base}/inventario/recetas`}>Recetario <ArrowRight size={14} /></Link></div>
      {low.length ? <div className="rx-table-wrap"><table className="rx-table">
        <thead><tr><th>{isBar ? "Bebida" : "Plato"}</th><th>Insumo que limita</th><th className="n">Porciones posibles</th><th /></tr></thead>
        <tbody>{low.map((row) => <tr key={row.id}><td><b style={{ fontWeight: 600 }}>{row.name}</b></td><td className="mut">{row.limitingIngredient?.productName || row.limitingIngredient || "—"}</td><td className="n"><Tag tone={Number(row.availablePortions) <= 5 ? "crit" : Number(row.availablePortions) <= 20 ? "warn" : "ok"}>{Number(row.availablePortions) <= 0 ? "Sin stock" : Number(row.availablePortions).toLocaleString("es-PE")}</Tag></td><td className="n"><Link className="rx-btn rx-btn--sm" to={`${base}/inventario/recetas?ver=${row.id}`}>Ver receta</Link></td></tr>)}</tbody>
      </table></div> : <Empty icon={PackageCheck} title="Sin datos de recetas" />}
    </section>
  </>;
}
