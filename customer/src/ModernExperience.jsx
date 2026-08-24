import { useEffect, useState } from "react";
import { BedDouble, CalendarDays, ChevronRight, ClipboardList, CreditCard, LogOut, MapPin, QrCode, ShieldCheck, Sparkles, SunMedium, Waves } from "lucide-react";

const images = { HOSPEDAJE: "/images/experiences/hospedaje.webp", PISCINA: "/images/experiences/piscina.webp", MIRADOR: "/images/experiences/mirador.webp", EVENTOS: "/images/experiences/eventos.webp" };
const icons = { HOSPEDAJE: BedDouble, PISCINA: Waves, MIRADOR: SunMedium, EVENTOS: Sparkles };
const welcomeExperiences = [
  { code: "HOSPEDAJE", eyebrow: "DESCANSA EN PUCALLPA", title: "Hospedaje", headline: "Una habitación para bajar el ritmo", body: "Elige fechas, tipo de habitación, beneficios y cochera con disponibilidad conectada a Recepción." },
  { code: "PISCINA", eyebrow: "DÍAS BAJO EL SOL", title: "Piscina", headline: "Tu pausa más fresca", body: "Reserva accesos para adultos, niños y familias, revisa horarios y conserva todo en tu pase QR." },
  { code: "MIRADOR", eyebrow: "LA CIUDAD DESDE ARRIBA", title: "Mirador", headline: "Atardeceres para recordar", body: "Organiza tu visita, selecciona el horario y disfruta pedidos de restaurante y bar durante tu experiencia." },
  { code: "EVENTOS", eyebrow: "CELEBRA A TU MANERA", title: "Eventos", headline: "Una experiencia creada contigo", body: "Consulta fechas libres y personaliza ambiente, invitados, platos, bebidas, equipamiento y cochera." }
];

export function ModernWelcome({ onCredential, onRecover }) {
  const [active, setActive] = useState(0);
  const current = welcomeExperiences[active];
  const advance = () => setActive((value) => (value + 1) % welcomeExperiences.length);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const timer = window.setTimeout(advance, 3000);
    return () => window.clearTimeout(timer);
  }, [active]);

  return <main className="ppx-welcome">
    <a className="ppx-skip" href="#welcome-actions">Ir a las opciones de ingreso</a>
    <div className="ppx-welcome-stage" aria-hidden="true">
      {welcomeExperiences.map((item, index) => <img key={item.code} className={`ppx-welcome-bg ${index === active ? "active" : ""}`} src={images[item.code]} alt="" fetchPriority={index === 0 ? "high" : "auto"} loading={index === 0 ? "eager" : "lazy"} decoding="async"/>)}
    </div>
    <div className="ppx-welcome-shade"/>
    <header className="ppx-welcome-head"><Brand/><span><MapPin/>Pucallpa · Perú</span><b aria-live="polite">{String(active + 1).padStart(2, "0")} <i/> 04</b></header>
    <section className="ppx-welcome-copy" key={current.code} aria-live="polite">
      <p>{current.eyebrow}</p><h1>{current.title}</h1><h2>{current.headline}</h2><span>{current.body}</span>
      <div className="ppx-trust"><span><ShieldCheck/>Pago protegido</span><span><QrCode/>Un solo QR</span><span><CalendarDays/>Disponibilidad real</span></div>
    </section>
    <section className="ppx-entry-panel" id="welcome-actions"><div className="ppx-entry-heading"><div><small>EXPERIENCIA PARK PLAZA</small><p>¿Cómo deseas comenzar?</p></div><span className="ppx-auto-label">Cambio automático · 3 s</span></div><Entry icon={CreditCard} title="Iniciar una experiencia" text="Explora servicios, fechas y disponibilidad" onClick={onCredential} primary/><Entry icon={ClipboardList} title="Recuperar mi reserva" text="Ingresa tu DNI y revisa tus accesos" onClick={onRecover}/></section>
  </main>;
}

function Brand() { return <div className="ppx-brand"><img src="/brand/park-plaza-mark.svg" alt="Park Plaza"/><div><strong>PARK PLAZA</strong><span>LA MAGIA DE PUCALLPA</span></div></div>; }
function Entry({ icon: Icon, title, text, onClick, primary=false }) { return <button className={`ppx-entry ${primary ? "primary" : ""}`} type="button" onClick={onClick}><span><Icon/></span><div><strong>{title}</strong><small>{text}</small></div><ChevronRight/></button>; }

export function ModernHome({ client, catalog, experience, onService, onExperience, onReservations, onExit }) {
  const bookings=experience?.bookings||[]; const next=bookings.find(item=>!["FINALIZADA","CANCELADA"].includes(item.status));
  return <main className="ppx-home"><header className="ppx-home-head"><Brand/><div className="ppx-home-actions"><button type="button" aria-label="Abrir mi pase" title="Mi pase" onClick={onExperience}><QrCode/></button>{client ? <button type="button" className="ppx-exit" aria-label="Cerrar sesión" title="Cerrar sesión" onClick={onExit}><LogOut/></button> : null}</div></header><section className="ppx-hero-card"><p>HOLA, {client?.firstName?.toUpperCase()||"VISITANTE"}</p><h1>{next?"Tu próxima experiencia está lista":"¿Qué te gustaría vivir hoy?"}</h1><span>{next?"Consulta horarios, pagos y accesos desde tu pase personal.":"Elige una experiencia y te guiaremos paso a paso."}</span><div>{experience?.pass?<button onClick={onExperience}><QrCode/> Abrir mi pase QR</button>:null}{bookings.length?<button onClick={onReservations}><CalendarDays/> Mis reservas</button>:null}</div></section>{next?<section className="ppx-next"><div><small>PRÓXIMO PASO</small><h2>{serviceName(next.serviceCode)}</h2><p>{next.date||next.checkIn} {next.slot?`· ${next.slot}`:""}</p></div><span className={`ppx-status ${next.paymentStatus==="PAGADO"?"ready":"pending"}`}>{next.paymentStatus==="PAGADO"?"Acceso listo":`Saldo S/ ${Number(next.balance||0).toFixed(2)}`}</span></section>:null}<section className="ppx-section-head"><div><small>DESCUBRE PARK PLAZA</small><h2>Experiencias disponibles</h2></div><p>Precios y disponibilidad conectados con Recepción.</p></section><section className="ppx-service-grid">{(catalog.services||[]).map(service=>{const Icon=icons[service.code]||Sparkles;return <button type="button" className="ppx-service" onClick={()=>onService(service)} key={service.code}><img src={images[service.code]} alt={service.name} loading="lazy" decoding="async"/><div><span><Icon/></span><small>{service.code==="EVENTOS"?"COTIZACIÓN PERSONALIZADA":`DESDE S/ ${service.price}`}</small><h3>{service.name}</h3><p>{service.description}</p><strong>Explorar <ChevronRight/></strong></div></button>})}</section></main>;
}
function serviceName(code){return({HOSPEDAJE:"Hospedaje",PISCINA:"Piscina",MIRADOR:"Mirador",EVENTOS:"Evento"})[code]||code;}
