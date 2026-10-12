// Caja › Cobros pendientes. Todo el dinero que Recepción debe gestionar en un solo lugar:
// Yape/Plin enviados por clientes que esperan verificación, saldos de reservas de los 5 servicios y cuentas
// abiertas de huéspedes en casa (hospedaje + consumos). Cada fila abre la ficha con el cobro.
import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BadgeCheck, RefreshCw, Wallet } from "lucide-react";
import { useFetch } from "../../hooks/useFetch";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Empty, Kpi, PageHead, ReservationTag, Tag, dateShort, money, serviceOf, timeOf, todayKey, useShift } from "./rxkit";
import { ReservationDrawer } from "./ReservationDrawer";

export function ReceivablesPage() {
  const { desk, reloadDesk } = useShift();
  const [target, setTarget] = useState(null);
  const { data, loading, reload } = useFetch("/reception/reservations?range=todas&pageSize=100&when=", { initialData: null, realtime: true, pollInterval: 30000 });
  const today = todayKey();
  const refresh = () => { reload(); reloadDesk(); };

  const balances = (data?.list?.rows || []).filter((row) => row.balance > 0 && !["CANCELADA", "COMPLETADA"].includes(row.status)).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const due = balances.filter((row) => row.date && row.date <= today);
  const upcoming = balances.filter((row) => !row.date || row.date > today);
  const verifications = desk?.verifications || [];
  const openAccounts = (desk?.inHouse || []).filter((row) => row.account.balance > 0);
  const total = balances.reduce((sum, row) => sum + row.balance, 0);

  return <>
    <PageHead title="Cobros pendientes" tools={<>
      <Link className="rx-btn" to="/admin-panel/pagos">Pagos y comprobantes</Link>
      <button className="rx-btn" type="button" onClick={refresh}><RefreshCw />Actualizar</button>
    </>}>Verifica los Yape/Plin que envían los clientes y cobra los saldos de cualquier servicio. Cada cobro queda a tu nombre en tu caja del turno.</PageHead>

    <div className="rx-grid rx-g-4" style={{ marginBottom: 14 }}>
      <Kpi icon={BadgeCheck} label="Pagos por verificar" value={verifications.length} detail={verifications.length ? `${money(verifications.reduce((sum, row) => sum + row.amount, 0))} enviados por clientes` : "Ninguno pendiente"} />
      <Kpi icon={Wallet} label="Saldo por cobrar" value={money(total)} detail={`${balances.length} reserva(s) · ${due.length} vencen hoy o antes`} />
      <Kpi label="Cuentas de huéspedes en casa" value={openAccounts.length} detail={openAccounts.length ? `${money(openAccounts.reduce((sum, row) => sum + row.account.balance, 0))} entre hospedaje y consumos` : "Todas al día"} />
      <Kpi label="Cobrado por ti hoy" value={money(desk?.cash?.collected || 0)} detail={`${desk?.cash?.count || 0} cobro(s) registrados`} />
    </div>

    <section className="rx-card">
      <div className="rx-card-h"><div><h2>Pagos por verificar</h2><p>El cliente pagó por Yape o Plin y envió su número de operación. Compruébalo en la app antes de aprobar.</p></div></div>
      {verifications.length ? <div className="rx-table-wrap"><table className="rx-table">
        <thead><tr><th>Reserva</th><th>Titular</th><th>Servicio</th><th>Fecha de uso</th><th>Método</th><th>N.º de operación</th><th className="n">Monto</th><th /></tr></thead>
        <tbody>{verifications.map((row) => { const Icon = serviceOf(row.service).icon; return <tr key={`${row.kind}-${row.id}`}>
          <td><b className="rx-mono">{row.code}</b><div className="rx-code">enviado {dateShort(row.createdAt)} {timeOf(row.createdAt)}</div></td>
          <td><div className="rx-who"><b>{row.client?.name}</b><small>DNI {row.client?.document || "—"}</small></div></td>
          <td><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon size={15} color="#0F4C9E" />{row.serviceName}</span></td>
          <td>{dateShort(row.date)}</td>
          <td><Tag tone="info">{row.method}</Tag></td>
          <td className="rx-mono"><b>{row.reference}</b></td>
          <td className="n"><b>{money(row.amount)}</b></td>
          <td className="n"><button className="rx-btn rx-btn--primary rx-btn--sm" type="button" onClick={() => setTarget({ type: row.service, id: row.id, code: row.code })}>Verificar</button></td>
        </tr>; })}</tbody>
      </table></div> : <Empty icon={BadgeCheck} title="No hay pagos por verificar" />}
    </section>

    <div className="rx-grid rx-g-2e rx-mt">
      <BalanceTable title="Saldos de hoy y vencidos" subtitle="Reservas cuya fecha de uso ya llegó" rows={due} onOpen={setTarget} loading={loading && !data} empty="Ningún saldo vencido" />
      <BalanceTable title="Saldos de próximas reservas" subtitle="Adelantos del 50 % y reservas con pago en caja" rows={upcoming} onOpen={setTarget} loading={loading && !data} empty="Sin saldos próximos" />
    </div>

    <section className="rx-card rx-mt">
      <div className="rx-card-h"><div><h2>Cuentas abiertas de huéspedes en casa</h2><p>Hospedaje y consumos de Restaurante y Bar cargados a la habitación; se cobran al cerrar la salida.</p></div><Link to="/admin-panel/movimientos?vista=encasa">Ver en casa <ArrowRight size={14} /></Link></div>
      {openAccounts.length ? <div className="rx-table-wrap"><table className="rx-table">
        <thead><tr><th>Hab.</th><th>Huésped</th><th>Salida</th><th className="n">Hospedaje</th><th className="n">Consumos</th><th className="n">Pagado</th><th className="n">Saldo</th><th /></tr></thead>
        <tbody>{openAccounts.map((row) => <tr key={row.stayId}>
          <td><b>{row.room?.number}</b></td>
          <td><div className="rx-who"><b>{row.client?.name}</b><small>{row.code}</small></div></td>
          <td>{row.departureState === "VENCIDA" ? <Tag tone="crit">Vencida · {dateShort(row.departure)}</Tag> : dateShort(row.departure)}</td>
          <td className="n">{money(row.account.lodging)}</td>
          <td className="n">{money(row.account.consumptions)}</td>
          <td className="n">{money(row.account.paid)}</td>
          <td className="n"><b style={{ color: "var(--warn)" }}>{money(row.account.balance)}</b></td>
          <td className="n"><Link className="rx-btn rx-btn--sm" to={`/admin-panel/movimientos?vista=${row.departureState === "EN_CASA" ? "encasa" : "salidas"}&abrir=${row.stayId}`}>Gestionar</Link></td>
        </tr>)}</tbody>
      </table></div> : <Empty title="Todas las cuentas de huéspedes están al día" />}
    </section>

    <ReservationDrawer target={target} onClose={() => setTarget(null)} onChanged={refresh} />
  </>;
}

function BalanceTable({ title, subtitle, rows, onOpen, loading, empty }) {
  return <section className="rx-card">
    <div className="rx-card-h"><div><h2>{title}</h2><p>{subtitle}</p></div><b className="rx-mono" style={{ fontWeight: 600 }}>{money(rows.reduce((sum, row) => sum + row.balance, 0))}</b></div>
    {loading ? <LoadingSpinner /> : rows.length ? <ul className="rx-list">{rows.map((row) => { const Icon = serviceOf(row.type).icon; return <li key={`${row.type}-${row.id}`}>
      <span className="rx-ico"><Icon /></span>
      <div className="grow"><b>{row.clientName}</b><small>{row.code} · {serviceOf(row.type).name} · {dateShort(row.date)}{row.slot ? ` ${row.slot}` : ""}</small></div>
      <ReservationTag status={row.status} />
      <b className="rx-mono" style={{ minWidth: 88, textAlign: "right", fontWeight: 600 }}>{money(row.balance)}</b>
      <button className="rx-btn rx-btn--sm" type="button" onClick={() => onOpen({ type: row.type, id: row.id, code: row.code })}>Cobrar</button>
    </li>; })}</ul> : <Empty title={empty} />}
  </section>;
}
