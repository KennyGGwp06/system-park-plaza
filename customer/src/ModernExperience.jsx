import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ArrowRight, BedDouble, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, LogIn, LogOut, MapPin, QrCode, ShieldCheck, Sparkles, SunMedium, Waves } from "lucide-react";

const images = { HOSPEDAJE: "/images/experiences/hospedaje.webp", PISCINA: "/images/experiences/piscina.webp", MIRADOR: "/images/experiences/mirador.webp", EVENTOS: "/images/experiences/eventos.webp" };
const icons = { HOSPEDAJE: BedDouble, PISCINA: Waves, MIRADOR: SunMedium, EVENTOS: Sparkles };
const welcomeExperiences = [
  { code: "HOSPEDAJE", eyebrow: "DESCANSA EN PUCALLPA", title: "Hospedaje", headline: "Una habitación para bajar el ritmo", body: "Elige fechas, tipo de habitación, beneficios y cochera con disponibilidad conectada a Recepción." },
  { code: "PISCINA", eyebrow: "DÍAS BAJO EL SOL", title: "Piscina", headline: "Tu pausa más fresca", body: "Reserva accesos para adultos, niños y familias, revisa horarios y conserva todo en tu pase QR." },
  { code: "MIRADOR", eyebrow: "LA CIUDAD DESDE ARRIBA", title: "Mirador", headline: "Atardeceres para recordar", body: "Organiza tu visita, selecciona el horario y disfruta pedidos de restaurante y bar durante tu experiencia." },
  { code: "EVENTOS", eyebrow: "CELEBRA A TU MANERA", title: "Eventos", headline: "Una experiencia creada contigo", body: "Consulta fechas libres y personaliza ambiente, invitados, platos, bebidas, equipamiento y cochera." }
];

export function ModernWelcome({ catalog, onRegister, onLogin, onService }) {
  const services = catalog.services || [];
  const media = Object.fromEntries((catalog.experienceMedia || []).map((item) => [item.code, item]));
  const byCode = (code) => services.find((service) => service.code === code) || welcomeExperiences.find((service) => service.code === code) || { code, name: code, price: 0 };
  const slideDefaults = [
    { code: "HOTEL", targetCode: "HOSPEDAJE", place: "Hotel Park Plaza", title: "HOTEL", title2: "PARK PLAZA", description: "Hospedaje pensado para descansar: fechas, habitaciones, beneficios y cochera conectados con Recepción.", image: images.HOSPEDAJE },
    { code: "BAR", place: "Bar Park Plaza", title: "BAR", title2: "NOCTURNO", description: "Cócteles, bebidas y una atmósfera especial para acompañar tu experiencia en el hotel.", image: "/images/landing/park-plaza-bar-v1.png" },
    { code: "PISCINA", targetCode: "PISCINA", place: "Días bajo el sol", title: "PISCINA", title2: "PARK PLAZA", description: "Reserva tu acceso, elige a tus acompañantes y conserva todo en un único pase QR.", image: images.PISCINA },
    { code: "EVENTOS", targetCode: "EVENTOS", place: "Celebra a tu manera", title: "ZONA DE", title2: "EVENTOS", description: "Diseña tu celebración con ambiente, invitados, comida, bebidas, equipo y cochera.", image: images.EVENTOS },
    { code: "TERRAZA", place: "Terraza · Cocina", title: "SABORES", title2: "EN TERRAZA", description: "Una zona para compartir platos, atención de cocina y momentos que se quedan en la memoria.", image: "/images/landing/park-plaza-terraza-v1.png" },
    { code: "MIRADOR", targetCode: "MIRADOR", place: "La ciudad desde arriba", title: "MIRADOR", title2: "PARK PLAZA", description: "Elige horario, conoce la disponibilidad y vive Pucallpa desde una vista diferente.", image: images.MIRADOR }
  ];
  const slides = slideDefaults.map((slide) => { const saved = media[slide.targetCode || slide.code]; return saved ? { ...slide, ...saved, code: slide.code, targetCode: slide.targetCode, image: saved.imageUrl || slide.image } : slide; });
  const rootRef = useRef(null); const cardsRef = useRef([]); const orderRef = useRef(slides.map((_, index) => index)); const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const root = rootRef.current; if (!root) return undefined;
    let disposed = false; let timer; let transitioning = false; let cycleId = 0;
    const card = (index) => cardsRef.current[index];
    const placeCards = (animate = false) => {
      const width = window.innerWidth; const height = window.innerHeight; const compact = width < 760;
      const cardWidth = compact ? 92 : Math.min(176, Math.max(128, width * .135)); const cardHeight = compact ? 126 : Math.min(240, Math.max(176, height * .29)); const gap = compact ? 9 : 14;
      const active = orderRef.current[0]; const upcoming = orderRef.current.slice(1); const visible = 3;
      gsap.set(card(active), { x: 0, y: 0, width: "100vw", height: "100vh", borderRadius: 0, zIndex: 1, scale: 1 });
      upcoming.forEach((index, position) => {
        const x = width - 24 - ((Math.min(position, visible - 1) + 1) * cardWidth) - (Math.min(position, visible - 1) * gap);
        const target = { x, y: height - cardHeight - (compact ? 25 : 48), width: cardWidth, height: cardHeight, borderRadius: compact ? 12 : 16, zIndex: position < visible ? 8 : 0, opacity: position < visible ? 1 : 0 };
        if (animate) gsap.to(card(index), { ...target, duration: .55, ease: "sine.inOut", delay: position * .07 }); else gsap.set(card(index), target);
      });
    };
    const advance = () => {
      if (disposed || transitioning) return; transitioning = true;
      const oldActive = orderRef.current[0]; const incoming = orderRef.current[1]; const transitionId = cycleId;
      if (incoming === undefined) return;
      const incomingCard = card(incoming); const oldCard = card(oldActive);
      gsap.killTweensOf([incomingCard, oldCard]); gsap.set(incomingCard, { zIndex: 6, opacity: 1 }); gsap.set(oldCard, { zIndex: 5 });
      gsap.to(oldCard, { scale: 1.12, duration: 1.05, ease: "sine.inOut" });
      gsap.to(incomingCard, { x: 0, y: 0, width: "100vw", height: "100vh", borderRadius: 0, duration: 1.05, ease: "sine.inOut", onComplete: () => {
        if (disposed || transitionId !== cycleId) return;
        orderRef.current = [...orderRef.current.slice(1), oldActive]; setActiveIndex(incoming); placeCards(true); transitioning = false; timer = window.setTimeout(runCycle, 5300);
      }});
    };
    const runCycle = () => {
      if (disposed) return; const currentCycle = ++cycleId;
      const indicator = root.querySelector(".ppx-carousel-indicator");
      gsap.set(indicator, { x: -window.innerWidth });
      gsap.to(indicator, { x: 0, duration: 4.2, ease: "none", onComplete: () => { if (disposed || currentCycle !== cycleId) return; gsap.to(indicator, { x: window.innerWidth, duration: .45, ease: "none", onComplete: () => { if (!disposed && currentCycle === cycleId) advance(); } }); } });
    };
    placeCards(false); timer = window.setTimeout(runCycle, 700);
    const resize = () => placeCards(false); window.addEventListener("resize", resize);
    return () => { disposed = true; cycleId += 1; window.clearTimeout(timer); window.removeEventListener("resize", resize); gsap.killTweensOf(root.querySelectorAll(".ppx-carousel-card, .ppx-carousel-indicator")); };
  }, []);

  const active = slides[activeIndex]; const activeService = services.find((service) => service.code === active.targetCode);
  const explore = (slide) => { const service = services.find((item) => item.code === slide.targetCode); if (service) onService(service); else onRegister(); };
  return <main className="ppx-carousel" ref={rootRef}>
    <div className="ppx-carousel-indicator" aria-hidden="true"/>
    <div className="ppx-carousel-cards" aria-hidden="true">{slides.map((slide, index) => <div key={`${slide.code}-${index}`} ref={(node) => { cardsRef.current[index] = node; }} className="ppx-carousel-card" style={{ backgroundImage: `url(${slide.image})` }}/>)}</div>
    <div className="ppx-carousel-overlay" aria-hidden="true"/>
    <header className="ppx-carousel-nav"><Brand/><nav aria-label="Navegación principal"><a href="#inicio">Inicio</a><a href="#servicios">Servicios</a><a href="#experiencias">Experiencias</a></nav><button type="button" className="ppx-carousel-login" onClick={onLogin}><LogIn/> Iniciar sesión</button></header>
    <section className="ppx-carousel-details" id="inicio" aria-live="polite"><div className="ppx-place"><span/>{active.place}</div><div className="ppx-title-mask"><h1>{active.title}</h1></div><div className="ppx-title-mask"><h1>{active.title2}</h1></div><p>{active.description}</p><div className="ppx-carousel-actions"><button type="button" aria-label="Guardar esta experiencia"><ShieldCheck/></button><button type="button" onClick={() => explore(active)}>{activeService ? "Descubrir servicio" : "Crear mi experiencia"} <ArrowRight/></button></div></section>
    <section className="ppx-carousel-thumbs" id="servicios" aria-label="Próximas experiencias">{orderRef.current.slice(1, 4).map((index) => { const slide = slides[index]; return <button key={`${slide.code}-${index}`} type="button" onClick={() => explore(slide)}><small>{slide.place}</small><strong>{slide.title}<br/>{slide.title2}</strong></button>; })}</section>
    <section className="ppx-carousel-hud" id="experiencias"><span>{String(activeIndex + 1).padStart(2, "0")}</span><i/><b>{String(slides.length).padStart(2, "0")}</b><div><ChevronLeft/><ChevronRight/></div><button type="button" onClick={onRegister}>Crear mi experiencia</button></section>
  </main>;
}

function Brand() { return <div className="ppx-brand"><img src="/brand/park-plaza-mark.svg" alt="Park Plaza"/><div><strong>PARK PLAZA</strong><span>LA MAGIA DE PUCALLPA</span></div></div>; }
function Entry({ icon: Icon, title, text, onClick, primary=false }) { return <button className={`ppx-entry ${primary ? "primary" : ""}`} type="button" onClick={onClick}><span><Icon/></span><div><strong>{title}</strong><small>{text}</small></div><ChevronRight/></button>; }

export function ModernHome({ client, catalog, experience, onService, onExperience, onReservations, onExit }) {
  const bookings=experience?.bookings||[]; const next=bookings.find(item=>!["FINALIZADA","CANCELADA"].includes(item.status));
  const media=Object.fromEntries((catalog.experienceMedia||[]).map((item)=>[item.code,item]));
  const fullName=[client?.firstName,client?.lastName].filter(Boolean).join(" ")||"Visitante Park Plaza";
  const initials=fullName.split(/\s+/).slice(0,2).map((item)=>item[0]).join("").toUpperCase();
  return <main className="ppx-home"><header className="ppx-home-head"><Brand/><div className="ppx-home-actions"><button type="button" className="ppx-verify-button" onClick={onReservations}><ClipboardList/> Verificación de reserva</button><button type="button" aria-label="Abrir mi pase" title="Mi pase" onClick={onExperience}><QrCode/></button>{client ? <button type="button" className="ppx-exit" aria-label="Cerrar sesión" title="Cerrar sesión" onClick={onExit}><LogOut/></button> : null}</div></header>{client?<section className="ppx-profile-card" aria-label="Mi perfil"><div className="ppx-avatar">{client.avatarUrl?<img src={client.avatarUrl} alt={`Foto de ${fullName}`}/>:<span>{initials}</span>}</div><div><small>MI PERFIL</small><strong>{fullName}</strong><span>{client.email||"Acceso personal Park Plaza"}</span></div><b>{client.authProvider==="GOOGLE"?"Conectado con Google":"Sesión activa"}</b></section>:null}<section className="ppx-hero-card"><p>HOLA, {client?.firstName?.toUpperCase()||"VISITANTE"}</p><h1>{next?"Tu próxima experiencia está lista":"¿Qué te gustaría vivir hoy?"}</h1><span>{next?"Consulta horarios, pagos y accesos desde tu pase personal.":"Elige una experiencia y te guiaremos paso a paso."}</span><div>{experience?.pass?<button onClick={onExperience}><QrCode/> Abrir mi pase QR</button>:null}{bookings.length?<button onClick={onReservations}><CalendarDays/> Mis reservas</button>:null}</div></section>{next?<section className="ppx-next"><div><small>PRÓXIMO PASO</small><h2>{serviceName(next.serviceCode)}</h2><p>{next.date||next.checkIn} {next.slot?`· ${next.slot}`:""}</p></div><span className={`ppx-status ${next.paymentStatus==="PAGADO"?"ready":"pending"}`}>{next.paymentStatus==="PAGADO"?"Acceso listo":`Saldo S/ ${Number(next.balance||0).toFixed(2)}`}</span></section>:null}<section className="ppx-section-head"><div><small>DESCUBRE PARK PLAZA</small><h2>Experiencias disponibles</h2></div><p>Precios y disponibilidad conectados con Recepción.</p></section><section className="ppx-service-grid">{(catalog.services||[]).map(service=>{const Icon=icons[service.code]||Sparkles;return <button type="button" className="ppx-service" onClick={()=>onService(service)} key={service.code}><img src={media[service.code]?.imageUrl||images[service.code]} alt={service.name} loading="lazy" decoding="async"/><div><span><Icon/></span><small>{service.code==="EVENTOS"?"COTIZACIÓN PERSONALIZADA":`DESDE S/ ${service.price}`}</small><h3>{service.name}</h3><p>{service.description}</p><strong>Explorar <ChevronRight/></strong></div></button>})}</section></main>;
}
function serviceName(code){return({HOSPEDAJE:"Hospedaje",PISCINA:"Piscina",MIRADOR:"Mirador",EVENTOS:"Evento"})[code]||code;}
