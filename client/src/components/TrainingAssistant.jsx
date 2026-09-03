import { useEffect, useState } from "react";
import { CheckCircle2, ChevronRight, CircleHelp, Clock3, X } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { defaultRouteByRole } from "../constants/menu";

const guides = {
  SUPERADMIN: {
    title: "Centro de control Park Plaza",
    focus: "Empieza por las decisiones pendientes; después revisa servicios, dinero e inventario.",
    actions: [["Ver operación de hoy", "/superadmin"], ["Revisar inventario", "/admin/inventario"], ["Administrar carta", "/admin/alimentos-bebidas"]],
    steps: ["Revisa lo que necesita una decisión", "Abre el servicio que requiere atención", "Confirma que pedidos, stock y cobros quedaron actualizados"]
  },
  ADMINISTRADOR: {
    title: "Control general del hotel",
    focus: "Revisa primero alertas, ocupación, personal activo y saldos pendientes.",
    actions: [["Ver operación de hoy", "/dashboard"], ["Organizar turnos", "/turnos"], ["Revisar incidencias", "/incidencias"]],
    steps: ["Comprueba las alertas del tablero", "Asigna personal y horarios rotativos", "Revisa ventas, inventario e incidencias"]
  },
  RECEPCION: {
    title: "Recepción paso a paso",
    focus: "Atiende llegadas y salidas; después registra reservas, pagos o incidencias.",
    actions: [["Registrar una reserva", "/reservas?nueva=1"], ["Realizar check-in", "/checkin"], ["Realizar check-out", "/checkout"]],
    steps: ["Busca al huésped por DNI o código", "Confirma pago y habitación", "Entrega o finaliza el acceso del QR"]
  },
  RESTAURANTE: {
    title: "Pedidos de restaurante",
    focus: "Trabaja de izquierda a derecha: pendiente, preparando, listo y entregado.",
    actions: [["Ver pedidos", "/restaurante/pedidos"], ["Solicitar insumos", "/restaurante/inventario/solicitudes"], ["Revisar mi stock", "/restaurante/inventario/insumos"]],
    steps: ["Acepta el pedido y revisa cantidades", "Actualiza el estado al comenzar", "Marca listo y confirma la entrega"]
  },
  BARTENDER: {
    title: "Pedidos de bar",
    focus: "Prioriza el pedido con mayor tiempo de espera y confirma cada entrega.",
    actions: [["Ver pedidos", "/bartender/pedidos"], ["Solicitar insumos", "/bartender/inventario/solicitudes"], ["Revisar mi stock", "/bartender/inventario/insumos"]],
    steps: ["Revisa producto y cantidad exacta", "Marca preparando para iniciar el tiempo", "Entrega y descuenta el inventario"]
  },
  LIMPIEZA: {
    title: "Turno de limpieza",
    focus: "Registra tu ingreso, atiende la prioridad más alta y finaliza con evidencia.",
    actions: [["Ver alertas", "/limpieza"], ["En atención", "/limpieza/en-atencion"], ["Consultar historial", "/limpieza/historial"]],
    steps: ["Confirma ingreso al turno", "Inicia la habitación asignada", "Adjunta evidencia y marca la salida"]
  }
};

export function TrainingAssistant() {
  const { user } = useAuth(); const location = useLocation(); const guide = guides[user?.role] || guides.RECEPCION;
  const storageKey = `pp_erp_onboarding_${user?.role || "usuario"}`;
  const [open, setOpen] = useState(false); const [showWelcome, setShowWelcome] = useState(false);
  useEffect(() => { setShowWelcome(localStorage.getItem(storageKey) !== "done"); }, [storageKey]);
  
  if (user?.role === "LIMPIEZA" || user?.role === "MANTENIMIENTO") return null;
  const isStart = location.pathname === defaultRouteByRole[user?.role];
  function dismiss() { localStorage.setItem(storageKey, "done"); setShowWelcome(false); }

  return <>
    {isStart ? <section className="mb-5 overflow-hidden rounded-card border border-park-green/20 bg-gradient-to-r from-park-dark to-park-green p-5 text-white shadow-card">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-xs font-black uppercase tracking-[.18em] text-park-gold">Tu punto de partida</p><h2 className="mt-1 text-xl font-black">{guide.title}</h2><p className="mt-1 max-w-2xl text-sm text-emerald-50">{guide.focus}</p></div><div className="grid gap-2 sm:grid-cols-3">{guide.actions.map(([label, href]) => <Link className="flex items-center justify-between gap-2 rounded-lg border border-white/25 bg-white/10 px-3 py-2 text-sm font-bold hover:bg-white/20" to={href} key={label}>{label}<ChevronRight size={15}/></Link>)}</div></div>
    </section> : null}

    {showWelcome ? <aside className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-xl rounded-card border border-park-border bg-white p-5 shadow-2xl sm:left-auto sm:right-5 sm:mx-0">
      <button className="absolute right-3 top-3 rounded-full p-2 text-park-muted hover:bg-slate-100" onClick={dismiss} aria-label="Cerrar guía"><X size={18}/></button><p className="text-xs font-black uppercase tracking-wider text-park-green">Bienvenido a tu espacio</p><h2 className="mt-1 pr-8 text-lg font-black text-park-dark">Aprende el flujo en menos de un minuto</h2><div className="mt-3 space-y-2">{guide.steps.map((step, index) => <p className="flex items-center gap-2 text-sm text-park-muted" key={step}><span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-park-green-soft font-black text-park-green">{index + 1}</span>{step}</p>)}</div><button className="mt-4 w-full rounded-input bg-park-green px-4 py-3 text-sm font-black text-white" onClick={dismiss}>Entendido, comenzar</button>
    </aside> : null}

    <button className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-park-dark px-4 py-3 text-sm font-black text-white shadow-xl hover:bg-park-green" onClick={() => setOpen(true)}><CircleHelp size={19}/> <span className="hidden sm:inline">¿Qué hago aquí?</span></button>
    {open ? <div className="fixed inset-0 z-50 bg-black/40 p-4" onClick={() => setOpen(false)}><aside className="ml-auto flex h-full w-full max-w-md flex-col overflow-y-auto rounded-card bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between"><div><p className="text-xs font-black uppercase tracking-wider text-park-green">Ayuda de esta pantalla</p><h2 className="mt-1 text-xl font-black text-park-dark">{guide.title}</h2></div><button className="rounded-full p-2 hover:bg-slate-100" onClick={() => setOpen(false)}><X size={20}/></button></div><p className="mt-3 rounded-lg bg-park-green-soft p-3 text-sm font-semibold text-park-dark">{guide.focus}</p><h3 className="mt-5 font-black text-park-dark">Flujo recomendado</h3><ol className="mt-3 space-y-3">{guide.steps.map((step, index) => <li className="flex gap-3 text-sm text-park-muted" key={step}><CheckCircle2 className="text-park-green" size={19}/><span><b className="text-park-black">Paso {index + 1}.</b> {step}</span></li>)}</ol><h3 className="mt-6 font-black text-park-dark">Estados fáciles</h3><div className="mt-3 grid gap-2 text-sm"><p className="rounded-lg bg-park-gold-soft p-3"><b>Pendiente:</b> requiere una acción.</p><p className="rounded-lg bg-park-green-soft p-3"><b>Listo / activo:</b> puede continuar.</p><p className="rounded-lg bg-slate-100 p-3"><b>Finalizado:</b> ya no requiere atención.</p><p className="flex items-center gap-2 text-park-muted"><Clock3 size={16}/> Los tiempos visibles ayudan a priorizar.</p></div><div className="mt-auto grid gap-2 pt-6">{guide.actions.map(([label, href]) => <Link className="flex items-center justify-between rounded-input border border-park-border px-4 py-3 text-sm font-black text-park-dark hover:bg-park-bg" to={href} onClick={() => setOpen(false)} key={label}>{label}<ChevronRight size={17}/></Link>)}</div></aside></div> : null}
  </>;
}
