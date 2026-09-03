import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ArrowRight, BedDouble, Car, ChevronRight, ClipboardList, LogIn, LogOut, MessageCircle, QrCode, Sparkles, SunMedium, UtensilsCrossed, Waves, Wine } from "lucide-react";

const images = { HOSPEDAJE: "/images/experiences/hospedaje.webp", PISCINA: "/images/experiences/piscina.webp", MIRADOR: "/images/experiences/mirador.webp", EVENTOS: "/images/experiences/eventos.webp" };
const icons = { HOSPEDAJE: BedDouble, PISCINA: Waves, MIRADOR: SunMedium, EVENTOS: Sparkles };
const welcomeExperiences = [
  { code: "HOSPEDAJE", eyebrow: "DESCANSA EN PUCALLPA", title: "Hospedaje", headline: "Una habitación para bajar el ritmo", body: "Elige fechas, tipo de habitación, beneficios y cochera con disponibilidad conectada a Recepción.", cta: "Descubrir habitaciones" },
  { code: "PISCINA", eyebrow: "DÍAS BAJO EL SOL", title: "Piscina", headline: "Tu pausa más fresca", body: "Reserva accesos para adultos, niños y familias, revisa horarios y conserva todo en tu pase QR.", cta: "Reservar piscina" },
  { code: "MIRADOR", eyebrow: "LA CIUDAD DESDE ARRIBA", title: "Mirador", headline: "Atardeceres para recordar", body: "Organiza tu visita, selecciona el horario y disfruta pedidos de restaurante y bar durante tu experiencia.", cta: "Reservar mirador" },
  { code: "EVENTOS", eyebrow: "CELEBRA A TU MANERA", title: "Eventos", headline: "Una experiencia creada contigo", body: "Consulta fechas libres y personaliza ambiente, invitados, platos, bebidas, equipamiento y cochera.", cta: "Diseñar mi evento" },
  { code: "RESTAURANTE", eyebrow: "SABORES DE LA SELVA", title: "Restaurante", headline: "La Amazonía servida en tu mesa", body: "Descubre platos regionales y cocina de la casa. Durante tu estadía podrás pedir directamente desde tu experiencia digital.", image: "/images/landing/park-plaza-terraza-v1.png", action: "VERIFY", cta: "Verificar para ordenar" },
  { code: "BARTENDER", eyebrow: "COCTELERÍA DE AUTOR", title: "Bar", headline: "La noche empieza con un buen brindis", body: "Cócteles clásicos, bebidas amazónicas y atención conectada con tu habitación o experiencia activa.", image: "/images/landing/park-plaza-bar-v1.png", action: "VERIFY", cta: "Acceder a la carta" },
  { code: "COCHERA", eyebrow: "LLEGA SIN PREOCUPACIONES", title: "Cochera", headline: "Tu vehículo también tiene su lugar", body: "Consulta espacios disponibles y agrega moto, auto, camioneta o miniván al reservar hospedaje, piscina, mirador o eventos.", image: "/images/landing/park-plaza-hero-mobile-v1.png", targetCode: "HOSPEDAJE", cta: "Reservar con cochera" }
];

export function ModernWelcome({ catalog, onRegister, onLogin, onVerify, onService }) {
  const services = catalog.services || [];
  const media = Object.fromEntries((catalog.experienceMedia || []).map((item) => [item.code, item]));
  const service = (code) => services.find((item) => item.code === code);
  const explore = (code) => { const selected = service(code); if (selected) onService(selected); else onRegister(); };
  const slides = welcomeExperiences.map((item) => ({ ...item, ...(service(item.code) || {}), body: service(item.code)?.description || item.body, image: media[item.code]?.imageUrl || item.image || (item.code === "HOSPEDAJE" ? "/images/landing/park-plaza-hero-desktop-v1.png" : images[item.code]) }));
  const [activeIndex, setActiveIndex] = useState(0);
  const [isHoveringCards, setIsHoveringCards] = useState(false);
  const rootRef = useRef(null); const copyRef = useRef(null); const visualRef = useRef(null); const transitioningRef = useRef(false);
  const active = slides[activeIndex] || slides[0];
  const launchActive = () => active.action === "VERIFY" ? onVerify() : explore(active.targetCode || active.code);
  const moveTo = (nextIndex) => {
    const normalized = (nextIndex + slides.length) % slides.length;
    if (normalized === activeIndex || transitioningRef.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce), (max-width: 660px)").matches) { setActiveIndex(normalized); return; }
    transitioningRef.current = true;
    gsap.timeline({ defaults: { ease: "power3.inOut" }, onComplete: () => setActiveIndex(normalized) })
      .to(visualRef.current, { xPercent: -38, rotate: -2.5, scale: .92, opacity: 0, filter: "blur(16px)", duration: .78 })
      .to(copyRef.current, { y: 110, opacity: 0, filter: "blur(10px)", duration: .62 }, "<.08");
  };
  useEffect(() => {
    if (!visualRef.current || !copyRef.current) return;
    gsap.killTweensOf([visualRef.current, copyRef.current]);
    if (window.matchMedia("(prefers-reduced-motion: reduce), (max-width: 660px)").matches) {
      gsap.set([visualRef.current, copyRef.current], { clearProps: "transform,opacity,filter" });
      transitioningRef.current = false;
      return;
    }
    gsap.fromTo(visualRef.current, { xPercent: 30, rotate: 3, scale: 1.08, opacity: 0, filter: "blur(18px)" }, { xPercent: 0, rotate: 0, scale: 1, opacity: 1, filter: "blur(0px)", duration: 1.05, ease: "expo.out" });
    gsap.fromTo(copyRef.current, { y: -95, opacity: 0, filter: "blur(10px)" }, { y: 0, opacity: 1, filter: "blur(0px)", duration: .92, delay: .12, ease: "power4.out", onComplete: () => { transitioningRef.current = false; } });
  }, [activeIndex]);
  useEffect(() => { const timer = window.setInterval(() => { if (!transitioningRef.current && document.visibilityState === "visible") moveTo(activeIndex + 1); }, 6500); return () => window.clearInterval(timer); }, [activeIndex, slides.length]);
  const quickLinks = [
    { code: "HOSPEDAJE", label: "Habitaciones", icon: BedDouble },
    { code: "PISCINA", label: "Piscina", icon: Waves },
    { code: "MIRADOR", label: "Mirador", icon: SunMedium },
    { code: "EVENTOS", label: "Eventos", icon: Sparkles },
    { code: "RESTAURANTE", label: "Restaurante", icon: UtensilsCrossed },
    { code: "BARTENDER", label: "Bar", icon: Wine },
    { code: "COCHERA", label: "Cochera", icon: Car },
    { code: "CONTACTO", label: "Contacto", icon: MessageCircle }
  ];
  return <main className="pp-lumora pp-lumora-cinematic" id="inicio" ref={rootRef}>
    <header className="pp-lumora-nav"><Brand/><button type="button" className="pp-lumora-session" aria-label="Abrir mis reservas" title="Abrir mis reservas" onClick={onLogin}><LogIn/> Mis reservas</button><button type="button" className="pp-lumora-book" aria-label="Verificar mi reserva" title="Verificar mi reserva" onClick={onVerify}><QrCode/> Verificar mi reserva</button></header>
    <section className="pp-lumora-copy" ref={copyRef}><p>{active.eyebrow}</p><h1>{active.title.toUpperCase()}<br/><span>PARK PLAZA</span></h1><h2>{active.headline}</h2><div className="pp-lumora-rule"/><p className="pp-lumora-description">{active.body}</p><div className="pp-lumora-actions"><button type="button" onClick={launchActive}>{active.cta || `Descubrir ${active.title.toLowerCase()}`} <ArrowRight/></button><button type="button" onClick={onRegister}>Crear mi experiencia</button></div></section>
    <section className="pp-lumora-visual" aria-label={active.title} ref={visualRef}><div className="pp-lumora-orbit orbit-one"/><div className="pp-lumora-orbit orbit-two"/><div className="pp-lumora-image"><img src={active.image} alt={active.title}/></div><div className="pp-lumora-stamp"><Sparkles/><span>{active.title}<br/>a tu ritmo</span></div></section>
    <aside className="pp-lumora-rail" aria-label="Accesos rápidos">{quickLinks.map(({ code, label, icon: Icon }) => code === "CONTACTO" ? <a key={code} href="tel:+51961000120"><Icon/><span>{label}</span></a> : <button key={code} type="button" className={active.code===code?"active":""} onClick={() => moveTo(Math.max(0,slides.findIndex((item)=>item.code===code)))}><Icon/><span>{label}</span></button>)}</aside>
  </main>;
}

function Brand() { return <div className="ppx-brand"><img src="/brand/park-plaza-mark.svg" alt="Park Plaza"/><div><strong>PARK PLAZA</strong><span>LA MAGIA DE PUCALLPA</span></div></div>; }
function Entry({ icon: Icon, title, text, onClick, primary=false }) { return <button className={`ppx-entry ${primary ? "primary" : ""}`} type="button" onClick={onClick}><span><Icon/></span><div><strong>{title}</strong><small>{text}</small></div><ChevronRight/></button>; }

export function ModernHome({ client, catalog, experience, onService, onExperience, onReservations, onExit }) {
  const services = catalog.services || [];
  const media = Object.fromEntries((catalog.experienceMedia || []).map((item) => [item.code, item]));
  const slides = services.map((service) => {
    const narrative = welcomeExperiences.find((item) => item.code === service.code) || {};
    return { ...narrative, ...service, headline: narrative.headline || service.name, body: service.description || narrative.body, cta: narrative.cta || `Explorar ${service.name.toLowerCase()}`, image: media[service.code]?.imageUrl || narrative.image || images[service.code] || "/images/landing/park-plaza-hero-desktop-v1.png" };
  });
  const [activeIndex, setActiveIndex] = useState(0);
  const [isHoveringCards, setIsHoveringCards] = useState(false);
  const imageRef = useRef(null);
  const copyRef = useRef(null);
  const orbitRef = useRef(null);
  const transitioningRef = useRef(false);
  const active = slides[activeIndex] || slides[0];
  const cardServices = services.slice(0, 4);
  const moveTo = (index) => {
    if (!slides.length || index === activeIndex || transitioningRef.current) return;
    const normalized = (index + slides.length) % slides.length;
    const image = imageRef.current;
    const copy = copyRef.current;
    const orbit = orbitRef.current;
    if (!image || !copy || !orbit || window.matchMedia("(prefers-reduced-motion: reduce), (max-width: 760px)").matches) { setActiveIndex(normalized); return; }
    transitioningRef.current = true;
    try {
      gsap.timeline({ defaults: { ease: "power3.inOut" }, onComplete: () => setActiveIndex(normalized) })
        .to(image, { scale: .76, rotate: -18, opacity: 0, filter: "blur(18px)", duration: .62 })
        .to(copy, { y: 46, opacity: 0, filter: "blur(8px)", duration: .42 }, "<.05")
        .to(orbit, { rotate: "+=150", duration: .72 }, "<");
    } catch {
      transitioningRef.current = false;
      setActiveIndex(normalized);
    }
  };
  useEffect(() => {
    if (!orbitRef.current || !imageRef.current || !copyRef.current) return undefined;
    const spin = gsap.to(orbitRef.current, { rotate: 360, duration: 22, repeat: -1, ease: "none" });
    return () => spin.kill();
  }, []);
  useEffect(() => {
    if (!imageRef.current || !copyRef.current) return;
    gsap.killTweensOf([imageRef.current, copyRef.current]);
    if (window.matchMedia("(prefers-reduced-motion: reduce), (max-width: 760px)").matches) {
      gsap.set([imageRef.current, copyRef.current], { clearProps: "transform,opacity,filter" });
      transitioningRef.current = false;
      return;
    }
    gsap.fromTo(imageRef.current, { scale: .76, rotate: 18, opacity: 0, filter: "blur(18px)" }, { scale: 1, rotate: 0, opacity: 1, filter: "blur(0px)", duration: .95, ease: "expo.out" });
    gsap.fromTo(copyRef.current, { y: -45, opacity: 0, filter: "blur(8px)" }, { y: 0, opacity: 1, filter: "blur(0px)", duration: .68, delay: .1, ease: "power4.out", onComplete: () => { transitioningRef.current = false; } });
  }, [activeIndex]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!isHoveringCards && !transitioningRef.current && document.visibilityState === "visible") moveTo(activeIndex + 1);
    }, 6500);
    return () => window.clearInterval(timer);
  }, [activeIndex, isHoveringCards, slides.length]);

  return <main className="service-hub">
    <header className="service-hub-nav">
      <Brand/>
      <div className="service-hub-actions">
        <button type="button" className="service-hub-reservations" onClick={onReservations}><ClipboardList/> Mis reservas</button>
      </div>
      <button type="button" className="service-hub-qr" aria-label="Abrir mi QR" onClick={onExperience}><QrCode/></button>
      <button type="button" className="service-hub-exit" aria-label="Cerrar sesión" onClick={onExit}><LogOut/></button>
    </header>

    <section className="service-hub-stage">
    <section className="service-hub-discover">
      <div className="service-hub-intro"><small>EXPERIENCIAS PARK PLAZA</small><h2>Elige tu<br/><em>experiencia</em></h2><p>Selecciona la forma en que quieres vivir Park Plaza.</p></div>
      <div className="service-hub-cards" onMouseEnter={() => setIsHoveringCards(true)} onMouseLeave={() => setIsHoveringCards(false)}>{cardServices.map((service) => { const Icon = icons[service.code] || Sparkles; const index = slides.findIndex((slide) => slide.code === service.code); return <button type="button" key={service.code} className={index === activeIndex ? "active" : ""} onMouseEnter={() => moveTo(index)} onFocus={() => moveTo(index)} onClick={() => onService(service)}><img src={media[service.code]?.imageUrl || images[service.code]} alt={service.name}/><i/><span><Icon/></span><div><h3>{service.name}</h3><p>{service.description}</p><b>{service.code === "EVENTOS" ? "Cotizar" : `Desde S/ ${service.price}`} <ChevronRight/></b></div></button>; })}</div>
    </section>

    <section className="service-hub-hero">
      <div className="service-hub-orbit" ref={orbitRef}/>
      <img ref={imageRef} src={active?.image} alt={active?.name || "Experiencia Park Plaza"}/>
      <div className="service-hub-hero-shade"/>
      <div className="service-hub-copy" ref={copyRef}><small>{active?.eyebrow || "EXPERIENCIAS PARK PLAZA"}</small><h1>{active?.headline || "Descubre Park Plaza"}</h1><p>{active?.body}</p><div><button type="button" onClick={() => active && onService(active)}>{active?.cta || "Explorar experiencia"} <ArrowRight/></button></div></div>
      <div className="service-hub-carousel" aria-label="Cambiar experiencia"><button type="button" aria-label="Experiencia anterior" onClick={() => moveTo(activeIndex - 1)}>←</button><div>{slides.map((slide, index) => <button type="button" aria-label={`Ver ${slide.name}`} key={slide.code} className={index === activeIndex ? "active" : ""} onClick={() => moveTo(index)}/>)}</div><button type="button" aria-label="Siguiente experiencia" onClick={() => moveTo(activeIndex + 1)}>→</button></div>
    </section>
    </section>

  </main>;
}
