import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Banknote, BedDouble, CalendarDays, Car, Check, ChevronRight, ClipboardList, Clock3, ConciergeBell, CreditCard, Download, HelpCircle, Home, LockKeyhole, Minus, Plus, QrCode, ShoppingBag, Smartphone, Sparkles, SunMedium, Users, Waves, Map, BookOpen, Wifi, Coffee, FileText, CheckCircle2, Utensils, ChefHat, Bike } from "lucide-react";
import { io } from "socket.io-client";
import { apiBaseUrl, apiOrigin } from "./config/api";
import { signInWithGoogle } from "./config/firebase";
import { ExperienceFlow } from "./ExperienceFlows";
import { ModernHome, ModernWelcome } from "./ModernExperience";

const realtime = io(apiOrigin, { transports: ["websocket", "polling"], reconnection: true });
const serviceImages = {
  HOSPEDAJE: "/images/experiences/hospedaje.webp",
  PISCINA: "/images/experiences/piscina.webp",
  MIRADOR: "/images/experiences/mirador.webp",
  EVENTOS: "/images/experiences/eventos.webp"
};
const menuImages = { CEVICHE: "/images/menu/ceviche.webp", LOMO: "/images/menu/lomo.webp", JUANE: "/images/menu/juane.webp", PISCO: "/images/menu/pisco.webp", SELVA: "/images/menu/selva.webp" };
const icons = { HOSPEDAJE: BedDouble, PISCINA: Waves, MIRADOR: SunMedium, EVENTOS: Sparkles };
const initialIdentity = { documentType: "DNI", documentNumber: "", firstName: "", lastName: "", phone: "", email: "" };

export function App() {
  const storedCustomer = JSON.parse(localStorage.getItem("pp_customer_client") || "null");
  const [screen, setScreen] = useState(() => sessionStorage.getItem("pp_customer_screen") || (storedCustomer ? "home" : "welcome"));
  const [client, setClient] = useState(storedCustomer);
  const [catalog, setCatalog] = useState({ services: [], roomTypes: [], menu: [], eventSpaces: [], restaurantMenu: [], plans: {}, extrasByService: {}, eventLayouts: [], eventEquipment: [], parking: {} });
  const [experience, setExperience] = useState(null);
  const [selection, setSelection] = useState(() => JSON.parse(sessionStorage.getItem("pp_customer_selection") || "null"));
  const [paymentResult, setPaymentResult] = useState(null);
  const [notice, setNotice] = useState("");
  const [identityDraft, setIdentityDraft] = useState(() => JSON.parse(sessionStorage.getItem("pp_customer_identity_draft") || JSON.stringify(initialIdentity)));
  const [recoveryDocument, setRecoveryDocument] = useState(() => sessionStorage.getItem("pp_customer_recovery_document") || "");
  const [recoveryCode, setRecoveryCode] = useState(() => sessionStorage.getItem("pp_customer_recovery_code") || "");
  const [identityNext, setIdentityNext] = useState(() => sessionStorage.getItem("pp_customer_identity_next") || "");
  const [identityMode, setIdentityMode] = useState("register");
  const sessionVersion = useRef(0);

  useEffect(() => { loadCatalog().then(setCatalog).catch(() => {}); }, []);
  useEffect(() => { if (client) refreshExperience(); }, [client]);
  useEffect(() => { sessionStorage.setItem("pp_customer_screen", screen); }, [screen]);
  useEffect(() => { sessionStorage.setItem("pp_customer_selection", JSON.stringify(selection)); }, [selection]);
  useEffect(() => { sessionStorage.setItem("pp_customer_identity_draft", JSON.stringify(identityDraft)); }, [identityDraft]);
  useEffect(() => { sessionStorage.setItem("pp_customer_recovery_document", recoveryDocument); }, [recoveryDocument]);
  useEffect(() => { sessionStorage.setItem("pp_customer_recovery_code", recoveryCode); }, [recoveryCode]);
  useEffect(() => { sessionStorage.setItem("pp_customer_identity_next", identityNext); }, [identityNext]);
  useEffect(() => {
    if (client || ["welcome", "identify", "recover"].includes(screen)) return;
    if (["home", "reservations", "experience", "orders", "requests", "directory"].includes(screen)) {
      setIdentityMode("login");
      setIdentityNext(screen === "home" ? "home" : screen);
      setScreen("identify");
    }
  }, [client, screen]);
  useEffect(() => {
    if (!client) return undefined;
    let timer;
    const sync = (event = {}) => {
      if (event.clientId && Number(event.clientId) !== Number(client.id)) return;
      clearTimeout(timer);
      timer = setTimeout(() => { refreshExperience(); loadCatalog().then(setCatalog).catch(() => {}); }, 80);
    };
    const reconnect = () => sync({ source: "reconnect" });
    const fallback = setInterval(() => {
      if (document.visibilityState === "visible") sync({ source: "fallback" });
    }, 2500);
    const refreshOnReturn = () => { if (document.visibilityState === "visible") refreshExperience(); };
    realtime.on("state:changed", sync);
    realtime.on("connect", reconnect);
    document.addEventListener("visibilitychange", refreshOnReturn);
    return () => { clearTimeout(timer); clearInterval(fallback); document.removeEventListener("visibilitychange", refreshOnReturn); realtime.off("state:changed", sync); realtime.off("connect", reconnect); };
  }, [client?.id]);

  async function refreshExperience() {
    const version = ++sessionVersion.current;
    const token = localStorage.getItem("pp_customer_token");
    const storedClient = JSON.parse(localStorage.getItem("pp_customer_client") || "null");
    if (!token || !storedClient?.id) { setExperience(null); return null; }
    try {
      const value = await request("/public/my-experience", {}, true);
      const sameSession = version === sessionVersion.current && token === localStorage.getItem("pp_customer_token") && Number(value?.client?.id) === Number(storedClient.id);
      if (sameSession) setExperience(value);
      return sameSession ? value : null;
    } catch (error) {
      // A temporary Wi-Fi/API failure must never expel the guest. Only an
      // explicitly invalid or disabled session is cleared.
      if (version === sessionVersion.current && [401, 403].includes(error?.status)) {
        localStorage.removeItem("pp_customer_token");
        localStorage.removeItem("pp_customer_client");
        setClient(null);
        setExperience(null);
      }
      return null;
    }
  }
  function activateClient(value) { sessionVersion.current += 1; setExperience(null); setPaymentResult(null); setClient(value); }
  function showError(error) { setNotice(error.message || String(error)); }
  function go(next) { setScreen(next); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function requireIdentity(next) { setIdentityNext(next); go("identify"); }
  function continueWithCustomer(next) {
    const savedClient = JSON.parse(localStorage.getItem("pp_customer_client") || "null");
    const token = localStorage.getItem("pp_customer_token");
    if (client?.id || (token && savedClient?.id)) {
      if (!client?.id) setClient(savedClient);
      go(next);
      return;
    }
    requireIdentity(next);
  }
  function completeIdentity(value) { const next = identityNext || "home"; setIdentityNext(""); activateClient(value); go(next); }
  function resetExperience(next = "welcome") { sessionVersion.current += 1; localStorage.removeItem("pp_customer_token"); localStorage.removeItem("pp_customer_client"); ["pp_customer_selection", "pp_customer_identity_draft", "pp_customer_identity_next", "pp_customer_recovery_document", "pp_customer_recovery_code"].forEach((key) => sessionStorage.removeItem(key)); setClient(null); setExperience(null); setSelection(null); setPaymentResult(null); setIdentityDraft(initialIdentity); setIdentityNext(""); setRecoveryDocument(""); setRecoveryCode(""); setNotice(""); go(next); }

  return (
    <div className={`customer-app ${screen === "welcome" ? "welcome-active" : ""} ${screen === "experience" ? "qr-experience-active" : ""} ${screen === "requests" ? "concierge-active" : ""} ${screen === "success" && ["PISCINA", "HOSPEDAJE"].includes(selection?.service?.code) ? "payment-success-active" : ""}`}>
      {notice ? <div className="toast" onClick={() => setNotice("")}>{notice}</div> : null}
      {screen === "welcome" ? <ModernWelcome catalog={catalog} onRegister={() => { setIdentityMode("register"); setIdentityDraft(initialIdentity); setIdentityNext("home"); go("identify"); }} onLogin={() => { setIdentityMode("login"); setIdentityNext("home"); go("identify"); }} onVerify={() => go("recover")} onService={(service) => { setSelection({ service }); if (client?.id) go("experience-flow"); else { setIdentityMode("login"); setIdentityNext("experience-flow"); go("identify"); } }} /> : null}
      {screen === "identify" ? <Identify initialMode={identityMode} form={identityDraft} setForm={setIdentityDraft} onBack={() => go(identityNext === "checkout" || identityNext === "event-confirmation" ? "experience-flow" : "welcome")} onRecover={() => go("recover")} onDone={completeIdentity} reservationFlow={identityNext === "checkout" || identityNext === "event-confirmation"} /> : null}
      {screen === "recover" ? <RecoverReservation documentNumber={recoveryDocument} setDocumentNumber={setRecoveryDocument} reservationCode={recoveryCode} setReservationCode={setRecoveryCode} onBack={() => go(client ? "home" : "welcome")} onDone={(value) => { activateClient(value); setRecoveryCode(""); go("reservations"); }} /> : null}
      {screen === "home" && client ? <ModernHome client={client} catalog={catalog} experience={experience} onBack={() => go("welcome")} onService={(service) => { setSelection({ service }); go("experience-flow"); }} onExperience={() => go("experience")} onReservations={() => go("reservations")} onExit={() => resetExperience("welcome")} /> : null}
      {screen === "experience-flow" ? <ExperienceFlow service={selection?.service} catalog={catalog} hasExistingParking={Boolean((experience?.bookings || []).some((item) => (item.vehicles || []).length || item.parkingSpace || item.parkingSpaces?.length))} onBack={() => go("home")} onCheckout={(value) => { setSelection(value); continueWithCustomer("checkout"); }} onEventCheckout={(eventDraft) => { setSelection({ eventDraft }); continueWithCustomer("event-confirmation"); }} /> : null}
      {screen === "event-quote" ? <EventQuote catalog={catalog} onBack={() => go("home")} onDone={async (result) => { setPaymentResult({ event: result }); await refreshExperience(); go("event-success"); }} /> : null}
      {screen === "checkout" ? <Checkout selection={selection} catalog={catalog} onBack={() => go("experience-flow")} onPaid={async (result) => { setPaymentResult(result); await refreshExperience(); go("success"); }} /> : null}
      {screen === "event-confirmation" ? <EventConfirmation draft={selection?.eventDraft} onBack={() => go("experience-flow")} onPaid={async (result) => { setPaymentResult({ event: result }); await refreshExperience(); go("event-success"); }} /> : null}
      {screen === "balance-payment" ? <BalancePayment booking={selection?.booking} event={selection?.event} onBack={() => go(selection?.returnTo || "reservations")} onPaid={async () => { await refreshExperience(); setNotice("Pago registrado. Tu QR está listo para ser validado al ingresar."); go(selection?.returnTo || "reservations"); }} /> : null}
      {screen === "success" ? <PaymentSuccess result={paymentResult} selection={selection} onExperience={() => go("experience")} onAdd={() => go("home")} /> : null}
      {screen === "event-success" ? <EventSuccess event={paymentResult?.event || paymentResult} onReservations={() => go("reservations")} onAdd={() => go("home")} /> : null}
      {screen === "reservations" ? <MyReservations experience={experience} catalog={catalog} onBack={() => go("home")} onService={(service) => { setSelection({ service }); go("experience-flow"); }} onPay={(booking) => { setSelection({ booking, returnTo: "reservations" }); go("balance-payment"); }} onPayEvent={(event) => { setSelection({ event, returnTo: "reservations" }); go("balance-payment"); }} onAdd={() => go("home")} /> : null}
      {screen === "experience" ? <Experience experience={experience} onBack={() => go(selection?.returnTo === "reservations" ? "reservations" : "home")} onPay={(booking) => { setSelection({ booking, returnTo: "experience" }); go("balance-payment"); }} onOrders={async () => { await refreshExperience(); go("orders"); }} onRequest={() => go("requests")} onAdd={() => go("home")} /> : null}
      {screen === "orders" ? <Orders catalog={catalog} experience={experience} onBack={() => go("experience")} onPlaced={async () => { await refreshExperience(); go("experience"); }} /> : null}
      {screen === "requests" ? <Requests onBack={() => go("experience")} onDone={async () => { await refreshExperience(); go("experience"); }} /> : null}
      {screen === "directory" ? <Directory onBack={() => go("home")} /> : null}
      {!["welcome", "identify", "recover", "experience", "requests", "experience-flow", "checkout", "event-confirmation", "balance-payment", "success", "event-quote", "event-success"].includes(screen) ? <BottomNav screen={screen} go={go} ordersEnabled={canPlaceOrders(experience)} hasClient={Boolean(client)} /> : null}
    </div>
  );
}

function RecoverReservation({ onBack, onDone, documentNumber, setDocumentNumber, reservationCode, setReservationCode }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event) { event.preventDefault(); setBusy(true); setError(""); try { const result = await request("/public/recover", { method: "POST", body: { documentNumber, reservationCode } }); localStorage.setItem("pp_customer_token", result.token); localStorage.setItem("pp_customer_client", JSON.stringify(result.client)); onDone(result.client); } catch (cause) { setError(cause.message); } finally { setBusy(false); } }
  return <main className="reservation-verification"><img className="reservation-verification-image" src="/images/experiences/hospedaje.webp" alt="Recepción de Park Plaza"/><div className="reservation-verification-veil"/><header className="reservation-verification-top"><button type="button" onClick={onBack}><ArrowLeft/>Volver</button><div className="reservation-verification-brand"><img src="/brand/park-plaza-mark.svg" alt="Park Plaza"/><span>PARK PLAZA<small>PUCALLPA</small></span></div><span>PP</span></header><section className="reservation-verification-copy"><small>EXPERIENCIA PARK PLAZA</small><h1>Verificación de reserva</h1><p>Confirma tu documento y el código de una reserva para proteger tus saldos, accesos y comprobantes.</p></section><form className="reservation-verification-card" onSubmit={submit}><div className="reservation-verification-notice"><LockKeyhole/><div><b>Acceso protegido</b><p>Verificaremos que la reserva realmente te pertenezca.</p></div></div><label><span>DNI o carnet de extranjería</span><input required value={documentNumber} autoComplete="username" onChange={(event) => setDocumentNumber(event.target.value)}/></label><label className="reservation-verification-password"><span>Código de reserva</span><div><input required value={reservationCode} autoCapitalize="characters" placeholder="Ejemplo: RES-0001" onChange={(event) => setReservationCode(event.target.value.toUpperCase())}/></div></label>{error ? <p className="error">{error}</p> : null}<button className="reservation-verification-submit" disabled={busy}><LockKeyhole/>{busy ? "Verificando…" : "Verificar mis reservas"}</button><p className="reservation-verification-help">El código figura en la confirmación de tu reserva. ¿Aún no reservaste? <button type="button" onClick={onBack}>Elige una experiencia</button></p></form></main>;
}

function Identify({ onBack, onDone, onRecover, form, setForm, reservationFlow, initialMode = "register" }) {
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState(reservationFlow ? "register" : initialMode);
  const [loginForm, setLoginForm] = useState({ documentNumber: "", reservationCode: "" });

  function changeMode(nextMode) {
    if (busy || googleBusy || nextMode === mode) return;
    setError("");
    setMode(nextMode);
  }

  async function useGoogle() {
    setGoogleBusy(true); setError("");
    try {
      const user = await signInWithGoogle();
      const names = (user.displayName || "").trim().split(/\s+/).filter(Boolean);
      const firstName = names.slice(0, 1).join("") || "Huésped";
      const lastName = names.slice(1).join(" ") || "Google";
      const googleDocument = `GOOGLE-${user.uid}`;
      const result = await request("/public/identify", { method: "POST", body: { documentType: "GOOGLE", documentNumber: googleDocument, firstName, lastName, phone: "", email: user.email || "" } });
      const googleClient = { ...result.client, avatarUrl: user.photoURL || "", authProvider: "GOOGLE" };
      localStorage.setItem("pp_customer_token", result.token);
      localStorage.setItem("pp_customer_client", JSON.stringify(googleClient));
      setForm({ ...form, documentType: "GOOGLE", documentNumber: googleDocument, firstName, lastName, email: user.email || "" });
      onDone(googleClient);
    } catch (cause) {
      if (cause?.code !== "auth/popup-closed-by-user") setError(cause?.status === 409 ? "Esta cuenta Google ya existe. Usa el acceso con Google para continuar." : cause?.message || "No pudimos continuar con Google.");
    } finally { setGoogleBusy(false); }
  }

  async function submit(event) {
    event.preventDefault();
    const documentNumber = form.documentNumber.trim();
    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    const phone = form.phone.trim();
    const email = form.email.trim();
    if (form.documentType === "DNI" && !/^\d{8}$/.test(documentNumber)) return setError("El DNI debe tener 8 dígitos.");
    if (form.documentType !== "DNI" && documentNumber.length < 6) return setError("Ingresa un documento válido.");
    if (!firstName || !lastName) return setError("Completa tus nombres y apellidos.");
    if (!/^\d{9}$/.test(phone)) return setError("El celular debe tener exactamente 9 dígitos.");
    setBusy(true); setError("");
    try {
      const result = await request("/public/identify", { method: "POST", body: { ...form, documentNumber, firstName, lastName, phone, email } });
      localStorage.setItem("pp_customer_token", result.token);
      localStorage.setItem("pp_customer_client", JSON.stringify(result.client));
      onDone(result.client);
    } catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }

  async function login(event) {
    event.preventDefault();
    const documentNumber = loginForm.documentNumber.trim();
    if (!documentNumber || !loginForm.reservationCode.trim()) return setError("Ingresa tu documento y código de reserva.");
    setBusy(true); setError("");
    try {
      const result = await request("/public/recover", { method: "POST", body: { documentNumber, reservationCode: loginForm.reservationCode } });
      localStorage.setItem("pp_customer_token", result.token);
      localStorage.setItem("pp_customer_client", JSON.stringify(result.client));
      onDone(result.client);
    } catch (cause) { setError(cause.message || "No pudimos iniciar tu sesión."); } finally { setBusy(false); }
  }

  const loginMode = mode === "login";
  const sceneTitle = loginMode ? "Vuelve a sentirte en casa" : reservationFlow ? "Confirma tu experiencia" : "Tu historia comienza aquí";
  const sceneSubtitle = loginMode ? "Reservas, pagos, pedidos y accesos. Verifica tus datos sin crear una contraseña." : "Registra tus datos y convierte cada visita en una experiencia hecha a tu medida.";

  return <main className={`identity-page identity-${mode}`}>
    <aside className="identity-scene">
      <div className="identity-photo"><img src="/images/landing/park-plaza-hero-desktop-v1.png" alt="Hotel Park Plaza"/></div>
      <div className="identity-brand"><img src="/brand/park-plaza-mark.svg" alt="Park Plaza"/><span><b>PARK PLAZA</b><small>LA MAGIA DE PUCALLPA</small></span></div>
      <button className="identity-back" type="button" onClick={onBack}><ArrowLeft/> Volver</button>
      <div className="identity-copy" key={mode}><small>{loginMode ? "BIENVENIDO DE NUEVO" : "UNA EXPERIENCIA SOLO TUYA"}</small><h1>{sceneTitle}</h1><p>{sceneSubtitle}</p><div><span><b>01</b> Seguro</span><span><b>02</b> Personal</span><span><b>03</b> Inolvidable</span></div></div>
      <span className="identity-signature"><Sparkles/> Pucallpa te espera</span>
    </aside>
    <section className="identity-panel">
      <div className="identity-shell">
        <div className="identity-mode-switch" role="tablist" aria-label="Acceso a Park Plaza"><i className={mode}/><button type="button" role="tab" aria-selected={loginMode} className={loginMode ? "active" : ""} onClick={() => changeMode("login")}>Mis reservas<small>Ya tengo un código</small></button><button type="button" role="tab" aria-selected={!loginMode} className={!loginMode ? "active" : ""} onClick={() => changeMode("register")}>Registrar visita<small>Primera experiencia</small></button></div>
        <div className="identity-form-stage" key={mode}>
          {loginMode ? <form className="identity-form identity-login-form" onSubmit={login}>
            <header><small>VERIFICACIÓN DE RESERVA</small><h2>Hola de nuevo</h2><p>Recupera tu experiencia sin contraseña.</p></header>
            <div className="identity-login-emblem"><LockKeyhole/><div><b>Tu información está protegida</b><small>Usa tu documento y el código incluido en la confirmación.</small></div></div>
            <div className="identity-fields"><Field label="Documento de identidad" value={loginForm.documentNumber} maxLength={15} autoComplete="username" onChange={(documentNumber) => setLoginForm({ ...loginForm, documentNumber })}/><Field label="Código de reserva" value={loginForm.reservationCode} maxLength={30} placeholder="Ejemplo: RES-0001" onChange={(reservationCode) => setLoginForm({ ...loginForm, reservationCode: reservationCode.toUpperCase() })}/></div>
            {error ? <p className="error">{error}</p> : null}
            <button className="primary identity-submit" disabled={busy}><span>{busy ? "Abriendo tu experiencia…" : "Entrar a Park Plaza"}<small>Continuar a mi espacio</small></span><ArrowRight/></button>
            <div className="identity-form-links"><button type="button" onClick={onRecover}>Abrir verificación guiada</button><button type="button" onClick={() => changeMode("register")}>Registrar una nueva visita</button></div>
          </form> : <form className="identity-form" onSubmit={submit}>
            <header><small>NUEVA CUENTA</small><h2>Hazlo tuyo</h2><p>Un registro breve. Una experiencia completamente personal.</p></header>
            <button type="button" className="google-signin" onClick={useGoogle} disabled={googleBusy || busy}><span aria-hidden="true">G</span><div><b>{googleBusy ? "Conectando…" : "Continuar con Google"}</b><small>La forma más rápida de comenzar</small></div><ChevronRight/></button>
            <div className="form-divider"><span>o registra tus datos</span></div>
            <div className="segments"><button type="button" className={form.documentType === "DNI" ? "active" : ""} onClick={() => setForm({ ...form, documentType: "DNI", documentNumber: "" })}><b>Peruano</b><small>DNI nacional</small></button><button type="button" className={form.documentType !== "DNI" ? "active" : ""} onClick={() => setForm({ ...form, documentType: "CE", documentNumber: "" })}><b>Extranjero</b><small>Carnet o pasaporte</small></button></div>
            <div className="identity-fields"><Field label={form.documentType === "DNI" ? "Número de DNI · 8 dígitos" : "Número de documento · máximo 15"} value={form.documentNumber} inputMode={form.documentType === "DNI" ? "numeric" : "text"} maxLength={form.documentType === "DNI" ? 8 : 15} onChange={(documentNumber) => setForm({ ...form, documentNumber: form.documentType === "DNI" ? documentNumber.replace(/\D/g, "").slice(0, 8) : documentNumber.slice(0, 15) })}/><div className="two"><Field label="Nombres" value={form.firstName} maxLength={60} onChange={(firstName) => setForm({ ...form, firstName })}/><Field label="Apellidos" value={form.lastName} maxLength={60} onChange={(lastName) => setForm({ ...form, lastName })}/></div><div className="two"><Field label="Celular · 9 dígitos" value={form.phone} inputMode="numeric" maxLength={9} onChange={(phone) => setForm({ ...form, phone: phone.replace(/\D/g, "").slice(0, 9) })}/><Field label="Correo para confirmaciones" type="email" value={form.email} maxLength={120} onChange={(email) => setForm({ ...form, email: email.slice(0, 120) })}/></div></div>
            {error ? <p className="error">{error}</p> : null}
            <button className="primary identity-submit" disabled={busy || googleBusy}><span>{busy ? "Registrando tus datos…" : "Registrar mis datos"}<small>Comenzar la experiencia</small></span><ArrowRight/></button>
          </form>}
        </div>
      </div>
    </section>
  </main>;
}

function JourneySteps({ current }) {
  return <div className="journey" aria-label={`Paso ${current} de 3`}>{["Elige", "Revisa", "Confirma"].map((label, index) => <span className={index + 1 <= current ? "done" : ""} key={label}><i>{index + 1 < current ? "✓" : index + 1}</i>{label}</span>)}</div>;
}

function Checkout({ selection, onBack, onPaid }) {
  const [mode, setMode] = useState("FULL");
  const [method, setMethod] = useState("YAPE");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cash = method === "CAJA HOTEL";
  const due = cash ? 0 : mode === "HALF" ? selection.total / 2 : selection.total;
  async function pay() { setBusy(true); setError(""); try { const result = await request("/public/bookings", { method: "POST", body: { serviceCode: selection.service.code, planCode: selection.planCode, planName: selection.planName, roomId: selection.room?.id, checkIn: selection.checkIn || selection.date, checkOut: selection.checkOut, date: selection.date, slot: selection.slot, people: selection.people, adults: selection.adults, children: selection.children, guests: selection.guests, extras: selection.extras, extrasTotal: selection.extrasTotal, preorderItems: selection.preorderItems, preferences: selection.preferences, parking: selection.parking, vehicles: selection.vehicles, parkingTotal: selection.parkingTotal, bundleCode: selection.bundleCode, bundleServices: selection.bundleServices, total: selection.total, payMode: mode, paymentMethod: method } }, true); await onPaid(result); } catch (cause) { setError(cause.message || "No se pudo registrar el pago"); } finally { setBusy(false); } }
  return <Page variant="checkout-page" title="Confirma tu experiencia" subtitle="Revisa cada concepto y decide cuánto deseas pagar ahora." onBack={onBack}><div className="checkout-studio"><JourneySteps current={3}/><section className="checkout-grid"><div className="checkout-options"><div className="card"><small className="checkout-kicker">FORMA DE RESERVA</small><h2>¿Cómo deseas reservar?</h2><button type="button" className={`pay-choice ${mode === "FULL" ? "selected" : ""}`} onClick={() => setMode("FULL")}><b>Pagar el total · S/ {Number(selection.total).toFixed(2)}</b><small>La reserva queda pagada. El QR estará listo, pero se activará cuando el personal valide tu ingreso.</small></button><button type="button" className={`pay-choice ${mode === "HALF" ? "selected" : ""}`} onClick={() => setMode("HALF")}><b>Reservar con 50% · S/ {(selection.total / 2).toFixed(2)}</b><small>Separa fecha, habitación o cupo. Podrás completar el saldo desde tu QR o tus reservas.</small></button></div><div className="card"><small className="checkout-kicker">PAGO SEGURO</small><h2>Elige tu método de pago</h2><PaymentMethods value={method} onChange={setMethod}/>{cash ? <Info icon={Banknote} title="Pago pendiente en Recepción" text="No se marcará como pagado hasta que Caja reciba y valide el efectivo. Podrás cambiar luego a un método digital."/> : null}</div></div><InvoiceSummary selection={selection} cash={cash} mode={mode}/></section>{error ? <p className="error">{error}</p> : null}<div className="checkout-action"><button className="primary wide" disabled={busy} onClick={pay}>{busy ? "Procesando…" : cash ? "Confirmar reserva pendiente de caja" : `Pagar S/ ${Number(due).toFixed(2)}`}</button></div><small className="center">Reserva segura · El acceso se valida al llegar al hotel.</small></div></Page>;
}

function EventConfirmation({ draft, onBack, onPaid }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  if (!draft) return <Page title="Confirma tu evento" subtitle="No encontramos la configuración del evento." onBack={onBack}/>;
  const due = draft.paymentMethod === "CAJA HOTEL" ? 0 : draft.payMode === "FULL" ? Number(draft.estimatedTotal || 0) : Number(draft.estimatedTotal || 0) / 2;
  async function submit() { setBusy(true); setError(""); try { const result = await request("/public/event-bookings", { method: "POST", body: draft }, true); await onPaid(result); } catch (cause) { setError(cause.message || "No se pudo registrar el evento"); } finally { setBusy(false); } }
  return <main className="event-review-studio"><img src="/images/experiences/eventos.webp" alt="Evento Park Plaza"/><div className="event-review-veil"/><header><button type="button" onClick={onBack}><ArrowLeft/>Volver</button><div><img src="/brand/park-plaza-mark.svg" alt="Park Plaza"/><span><b>PARK PLAZA</b><small>PUCALLPA</small></span></div><span>EVENTOS</span></header><section className="event-review-hero"><div><small>EVENTO PRIVADO</small><h1>Confirma tu evento</h1><p>Revisa la propuesta y registra la reserva cuando estés listo.</p></div><JourneySteps current={3}/></section><section className="event-review-panel"><div className="event-review-details"><small>RESUMEN DE CELEBRACIÓN</small><h2>{draft.name}</h2><div className="event-review-facts"><span><CalendarDays/><b>Fecha y horario</b><strong>{formatDate(draft.date)} · {draft.start}–{draft.end}</strong></span><span><Users/><b>Invitados</b><strong>{draft.guests} personas</strong></span><span><Sparkles/><b>Ambiente</b><strong>{draft.space?.name || "Ambiente seleccionado"}</strong></span><span><Check/><b>Montaje y temática</b><strong>{(draft.layouts || []).length} distribución(es) · {draft.theme || "Por definir"}</strong></span><span><ConciergeBell/><b>Banquete y bar</b><strong>{(draft.catering || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0)} productos</strong></span><span><Car/><b>Cochera</b><strong>{(draft.vehicles || []).length} vehículo(s)</strong></span></div></div><aside className="event-review-total"><img src="/images/experiences/eventos.webp" alt="Ambiente elegido"/><small>RESERVA DE EVENTO</small><div><span>Total estimado</span><b>S/ {Number(draft.estimatedTotal || 0).toFixed(2)}</b></div><div><span>Forma de reserva</span><strong>Adelanto obligatorio del 50%</strong></div><div className="event-review-due"><span>{draft.paymentMethod === "CAJA HOTEL" ? "Pago en Recepción" : "Pagas ahora"}</span><b>{draft.paymentMethod === "CAJA HOTEL" ? "Pendiente" : `S/ ${due.toFixed(2)}`}</b></div>{draft.paymentMethod === "CAJA HOTEL" ? <p>La fecha se bloqueará cuando Recepción valide el adelanto.</p> : <p>Tu reserva se registrará al confirmar este adelanto.</p>}</aside><div className="event-review-actions">{error ? <p className="error">{error}</p> : null}<button className="primary" disabled={busy} onClick={submit}>{busy ? "Registrando…" : draft.paymentMethod === "CAJA HOTEL" ? "Solicitar pago en Recepción" : `Confirmar evento · S/ ${due.toFixed(2)}`}<ChevronRight/></button></div></section></main>;
}

function BalancePayment({ booking, event, onBack, onPaid }) {
  const [method, setMethod] = useState("YAPE"); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const record = booking || event;
  if (!record) return <Page title="Pago de saldo" subtitle="No encontramos la reserva seleccionada." onBack={onBack}/>;
  async function pay() { if (method === "CAJA HOTEL") { onBack(); return; } setBusy(true); setError(""); try { await request(event ? `/public/events/${event.id}/pay-balance` : `/public/bookings/${booking.id}/pay-balance`, { method: "POST", body: { paymentMethod: method } }, true); await onPaid(); } catch (cause) { setError(cause.message); } finally { setBusy(false); } }
  if (event) return <EventBalancePayment record={record} method={method} setMethod={setMethod} busy={busy} error={error} onBack={onBack} onPay={pay}/>;
  return <Page title={event ? "Completa el pago de tu evento" : "Completa tu reserva"} subtitle={`${record.code} · Elige cómo pagar el saldo pendiente.`} onBack={onBack}><section className="card balance-card"><div className="balance-amount"><small>SALDO PENDIENTE</small><strong>S/ {Number(record.balance || 0).toFixed(2)}</strong><span>Al completar el pago, tu pase quedará listo para validación de ingreso.</span></div><PaymentMethods value={method} onChange={setMethod}/>{method === "CAJA HOTEL" ? <Info icon={Banknote} title="Paga en Recepción" text="El personal validará el efectivo y recién después preparará tu acceso."/> : null}{error ? <p className="error">{error}</p> : null}<button className="primary wide" disabled={busy} onClick={pay}>{busy ? "Registrando…" : method === "CAJA HOTEL" ? "Mantener pago en Recepción" : `Pagar S/ ${Number(record.balance || 0).toFixed(2)}`}</button></section></Page>;
}

function EventBalancePayment({ record, method, setMethod, busy, error, onBack, onPay }) { return <main className="event-balance-studio"><img src="/images/experiences/eventos.webp" alt="Evento Park Plaza"/><div className="event-balance-veil"/><header><button type="button" onClick={onBack}><ArrowLeft/>Volver</button><div><img src="/brand/park-plaza-mark.svg" alt="Park Plaza"/><span><b>PARK PLAZA</b><small>PUCALLPA</small></span></div><span>EVENTOS</span></header><section className="event-balance-hero"><small>EVENTO PRIVADO</small><h1>Completa el pago de tu evento</h1><p>{record.code} · Elige cómo pagar el saldo pendiente.</p></section><section className="event-balance-panel"><div className="event-balance-amount"><small>SALDO PENDIENTE</small><b>S/ {Number(record.balance || 0).toFixed(2)}</b><p>Al completar el pago, tu pase quedará listo para validación de ingreso.</p></div><div className="event-balance-methods"><h2>Elige tu método de pago</h2><PaymentMethods value={method} onChange={setMethod}/>{method === "CAJA HOTEL" ? <div className="event-balance-note"><Banknote/><span><b>Paga en Recepción</b><small>El personal validará el efectivo antes de preparar tu acceso.</small></span></div> : null}</div>{error ? <p className="error">{error}</p> : null}<button className="primary" disabled={busy} onClick={onPay}>{busy ? "Registrando…" : method === "CAJA HOTEL" ? "Mantener pago en Recepción" : `Pagar S/ ${Number(record.balance || 0).toFixed(2)}`}<ChevronRight/></button></section></main>; }

const paymentOptions = [{ id: "YAPE", label: "Yape", help: "Pago móvil", icon: Smartphone }, { id: "PLIN", label: "Plin", help: "Pago móvil", icon: Smartphone }, { id: "CAJA HOTEL", label: "Efectivo", help: "Solo en Recepción", icon: Banknote }];
function PaymentMethods({ value, onChange }) { return <div className="payment-methods">{paymentOptions.map(({ id, label, help, icon: Icon }) => <button type="button" className={value === id ? "selected" : ""} onClick={() => onChange(id)} key={id}><span className={`payment-logo ${id.toLowerCase().replace(" ", "-")}`}><Icon/></span><div><b>{label}</b><small>{help}</small></div><i>{value === id ? "✓" : ""}</i></button>)}</div>; }
function InvoiceSummary({ selection, cash, mode }) { const vehicles=selection.vehicles||[]; const roomImages={Simple:"/images/rooms/simple.webp",Matrimonial:"/images/rooms/matrimonial.webp",Doble:"/images/rooms/doble.webp",Triple:"/images/rooms/triple.webp",Suite:"/images/rooms/suite.webp"}; const roomImage=roomImages[selection.room?.type?.name]||"/images/rooms/simple.webp"; return <aside className="invoice-summary"><small>RESUMEN DE RESERVA</small>{selection.room ? <img className="invoice-room-image" src={roomImage} alt={`Habitación ${selection.room.type.name}`}/> : null}<h2>{selection.service.name}</h2>{selection.room ? <p>{selection.room.type.name} {selection.room.number} · {selection.nights} noche(s)</p> : <p>{selection.planName} · {selection.people} persona(s)</p>}<Row label="Servicio base" value={`S/ ${Number(selection.base || 0).toFixed(2)}`}/><Row label={`Extras (${selection.extras?.length || 0})`} value={`S/ ${Number(selection.extrasTotal || 0).toFixed(2)}`}/><Row label={`Cochera (${vehicles.length} vehículo${vehicles.length === 1 ? "" : "s"})`} value={`S/ ${Number(selection.parkingTotal || 0).toFixed(2)}`}/><Row total label="Total" value={`S/ ${Number(selection.total || 0).toFixed(2)}`}/>{!cash && mode === "HALF" ? <Row label="Saldo por completar después" value={`S/ ${Number(selection.total / 2).toFixed(2)}`}/> : null}<p className="invoice-note">El pago se registra aquí; el acceso se activa cuando el hotel valide tu llegada.</p></aside>; }

function EventQuote({ catalog, onBack, onDone }) {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const [form, setForm] = useState({ name: "Celebración", type: "CUMPLEAÑOS", spaceId: catalog.eventSpaces?.[0]?.id || 1, date: tomorrow, start: "18:00", end: "23:00", guests: 30, notes: "" }); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event) { event.preventDefault(); setBusy(true); setError(""); try { const result = await request("/public/event-quotes", { method: "POST", body: { ...form, spaceId: Number(form.spaceId), guests: Number(form.guests), startsAt: `${form.date}T${form.start}:00`, endsAt: `${form.date}T${form.end}:00` } }, true); onDone(result); } catch (cause) { setError(cause.message); } finally { setBusy(false); } }
  return <Page title="Cuéntanos sobre tu evento" subtitle="Primero confirmamos disponibilidad y necesidades; después recibes el precio final." onBack={onBack}><JourneySteps current={1}/><form className="card form" onSubmit={submit}><Info icon={Sparkles} title="Cotización sin compromiso" text="No realizaremos ningún cobro en este paso. El equipo revisará aforo, montaje y alimentación."/><div className="two"><Field label="Nombre del evento" value={form.name} onChange={(name) => setForm({ ...form, name })}/><Field label="Tipo" type="select" value={form.type} onChange={(type) => setForm({ ...form, type })} options={["CUMPLEAÑOS", "MATRIMONIO", "EMPRESARIAL", "OTRO"]}/></div><div className="two"><Field label="Fecha" type="date" value={form.date} onChange={(date) => setForm({ ...form, date })}/><Field label="Ambiente" type="select" value={form.spaceId} onChange={(spaceId) => setForm({ ...form, spaceId })} options={(catalog.eventSpaces || []).map((item) => ({ value: item.id, label: `${item.name} · hasta ${item.capacity}` }))}/></div><div className="two"><Field label="Hora de inicio" type="time" value={form.start} onChange={(start) => setForm({ ...form, start })}/><Field label="Hora de cierre" type="time" value={form.end} onChange={(end) => setForm({ ...form, end })}/></div><Field label="Número aproximado de invitados" type="number" value={form.guests} onChange={(guests) => setForm({ ...form, guests })}/><Field label="¿Qué necesitas? (montaje, comida, música...)" value={form.notes} onChange={(notes) => setForm({ ...form, notes })}/><PracticalInfo serviceCode="EVENTOS"/>{error ? <p className="error">{error}</p> : null}<button className="primary wide" disabled={busy}>{busy ? "Enviando…" : "Solicitar cotización"}</button></form></Page>;
}

function EventSuccess({ event, onReservations, onAdd }) {
  const cash = event?.status === "PENDIENTE_PAGO"; const paid = Number(event?.balance || 0) <= 0 && !cash;
  return <UnifiedPaymentSuccess serviceCode="EVENTOS" code={event?.code || "EVENTO PARK PLAZA"} pending={!paid} detail={cash ? "Recepción debe validar como mínimo el 50% para bloquear la fecha elegida." : paid ? "El evento quedó pagado y fue agregado a tu pase único." : `El adelanto bloqueó la fecha. Queda un saldo de S/ ${Number(event?.balance || 0).toFixed(2)}.`} onExperience={onReservations} onAdd={onAdd} primaryLabel="Ver seguimiento y comprobante"/>;
}

function PracticalInfo({ serviceCode }) {
  const data = serviceCode === "EVENTOS" ? ["Respuesta estimada: 30 minutos en horario de atención", "El aforo depende del ambiente seleccionado", "No se cobra hasta aprobar la propuesta"] : serviceCode === "PISCINA" ? ["Lleva ropa de baño y sandalias", "El QR valida exactamente el número de asistentes", "Llega 10 minutos antes de tu horario"] : serviceCode === "MIRADOR" ? ["Presenta el QR al llegar", "El acceso vale para la fecha y horario elegidos", "Menores deben ingresar con un adulto"] : ["Check-in desde las 3:00 p. m.", "Presenta documento y QR", "Cambios sujetos a disponibilidad"];
  return <div className="practical"><h3>Antes de continuar</h3>{data.map((item) => <p key={item}><Check/>{item}</p>)}</div>;
}

function MyReservations({ experience, catalog, onBack, onService, onPay, onPayEvent, onAdd }) {
  const bookings = experience?.bookings || [];
  const events = experience?.events || [];
  const invoices = experience?.invoices || [];
  const lodging = (catalog?.services || []).find((item) => item.code === "HOSPEDAJE");
  const [detail, setDetail] = useState(null);
  const [qrEntry, setQrEntry] = useState(null);
  const passFor = (item, event) => (experience?.passes || []).find((pass) => event ? Number(pass.eventId) === Number(item.id) || pass.entitlements?.some((entry) => Number(entry.eventId) === Number(item.id)) : Number(pass.bookingId) === Number(item.id) || pass.entitlements?.some((entry) => Number(entry.bookingId) === Number(item.id))) || null;

  return <main className="reservations-v3">
    <section className="reservations-v3-hero">
      <img src="/images/experiences/piscina.webp" alt="Atardecer en Park Plaza"/>
      <div className="reservations-v3-veil"/>
      <header className="reservations-v3-top"><button type="button" onClick={onBack}><ArrowLeft/>Volver</button><div className="reservations-v3-brand"><img src="/brand/park-plaza-mark.svg" alt="Park Plaza"/><span>PARK PLAZA<small>PUCALLPA</small></span></div><button className="reservations-v3-new" type="button" onClick={() => lodging ? onService(lodging) : onAdd()}>Nueva reserva <Plus/></button></header>
      <div className="reservations-v3-copy"><small>EXPERIENCIA PARK PLAZA</small><h1>Mis reservas</h1><p>Gestiona tus reservas y sigue cada paso de tu estadía.</p></div>
    </section>
    <section className="reservations-v3-content">
      <div className="reservations-v3-title"><span><CalendarDays/>TU ESTADÍA</span><StatusLegend/></div>
      {!bookings.length && !events.length ? <div className="empty-friendly"><CalendarDays/><h2>Aún no tienes reservas</h2><p>Elige hospedaje, piscina, mirador o diseña un evento.</p><button className="primary" onClick={onAdd}>Crear mi primera experiencia</button></div> : null}
      <div className="reservations-v3-list">{bookings.map((item) => <ReservationTimelineCard key={`booking-${item.id}`} item={item} onDetail={() => setDetail({ item, event: false })} onQr={() => setQrEntry({ item, event: false, pass: passFor(item, false) })} onPay={() => onPay(item)}/>) }{events.map((item) => <ReservationTimelineCard key={`event-${item.id}`} item={item} event onDetail={() => setDetail({ item, event: true })} onQr={() => setQrEntry({ item, event: true, pass: passFor(item, true) })} onPay={() => onPayEvent(item)}/>)}</div>
      {invoices.length ? <section className="customer-invoices"><div><small>COMPROBANTES ELECTRÓNICOS</small><h2>Mis boletas y facturas</h2><p>Recepción emitió estos comprobantes. Descarga cada PDF directamente desde tu reserva.</p></div><div>{invoices.map((invoice) => <article key={invoice.id}><span><FileText/></span><div><b>{invoice.fullNumber}</b><small>{invoice.type} · {new Date(invoice.issuedAt || invoice.createdAt).toLocaleDateString("es-PE")}</small></div><strong>S/ {Number(invoice.total || 0).toFixed(2)}</strong><button type="button" onClick={() => downloadCustomerInvoice(invoice).catch((error) => window.alert(error.message))}><Download/>PDF</button></article>)}</div></section> : null}
    </section>
    {detail ? <div className="reservation-detail-backdrop" role="dialog" aria-modal="true" aria-label="Detalle de reserva"><section className="reservation-detail"><button className="reservation-detail-close" onClick={() => setDetail(null)}>Cerrar</button><small>{detail.item.code}</small><h2>{detail.event ? detail.item.name : serviceName(detail.item.serviceCode).replace("tu ", "")}</h2><div><span><CalendarDays/><b>{formatDate(detail.event ? detail.item.startsAt : detail.item.date || detail.item.checkIn)}</b></span><span><Users/><b>{detail.event ? detail.item.guests : detail.item.people || detail.item.adults || 1} persona(s)</b></span>{!detail.event && detail.item.checkOut ? <span><Clock3/><b>Salida: {formatDate(detail.item.checkOut)}</b></span> : null}</div><Row label="Total" value={`S/ ${Number(detail.event ? detail.item.price : detail.item.total || 0).toFixed(2)}`}/><Row label="Pagado" value={`S/ ${Number(detail.event ? detail.item.advance : detail.item.paid || 0).toFixed(2)}`}/><Row label="Saldo pendiente" value={`S/ ${Number(detail.item.balance || 0).toFixed(2)}`}/></section></div> : null}
    {qrEntry ? <ReservationQrModal entry={qrEntry} onClose={() => setQrEntry(null)}/> : null}
  </main>;
}

async function downloadCustomerInvoice(invoice) {
  const response = await fetch(`${apiBaseUrl}/public/invoices/${invoice.id}/pdf`, { headers: { Authorization: `Bearer ${localStorage.getItem("pp_customer_token")}` } });
  if (!response.ok) throw new Error("No se pudo descargar el comprobante");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${invoice.fullNumber || "comprobante"}.pdf`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function ReservationTimelineCard({ item, event = false, onDetail, onQr, onPay }) {
  const date = event ? item.startsAt : item.date || item.checkIn;
  const value = new Date(`${String(date || "").slice(0, 10)}T12:00:00`);
  const validDate = !Number.isNaN(value.getTime());
  const pending = Number(item.balance || 0) > 0;
  const checkedIn = item.status === "CHECKED_IN" || item.accessStatus === "INGRESO_VALIDADO";
  const Icon = event ? ConciergeBell : item.serviceCode === "PISCINA" ? Waves : BedDouble;
  const title = event ? item.name : serviceName(item.serviceCode).replace("tu ", "");
  const total = Number(event ? item.price : item.total || 0);
  const paid = Number(event ? item.advance : item.paid || 0);
  return <article className={`reservation-timeline-card ${pending ? "pending" : "ready"}`}><div className="reservation-timeline-date"><b>{validDate ? value.getDate() : "—"}</b><span>{validDate ? value.toLocaleDateString("es-PE", { month: "short" }).replace(".", "") : "fecha"}</span><small>{validDate ? value.getFullYear() : ""}</small><i/><em>{event ? "Evento" : item.slot || "15:00"}</em></div><div className="reservation-timeline-service"><span><Icon/></span><div><small>{item.code}</small><h2>{title}</h2><p><Users/>{event ? item.guests : item.people || item.adults || 1} persona(s)</p></div></div><div className="reservation-timeline-price"><small>Total</small><b>S/ {total.toFixed(2)}</b><small>Pagado</small><strong>S/ {paid.toFixed(2)}</strong></div><div className="reservation-timeline-status"><b>{pending ? "PENDIENTE" : checkedIn ? "INGRESO VALIDADO" : "LISTO PARA INGRESO"}</b><p>{pending ? "Falta completar tu pago" : "Pago completo · listo para ingreso"}</p>{pending ? <button onClick={onPay}>Completar pago</button> : null}</div><div className="reservation-timeline-actions"><button onClick={onDetail}>Ver detalle <ArrowRight/></button><button onClick={onQr}><QrCode/>Ver mi QR</button></div></article>;
}

function ReservationQrModal({ entry, onClose }) {
  const title = entry.event ? entry.item.name : serviceName(entry.item.serviceCode).replace("tu ", "");
  const ready = Number(entry.item.balance || 0) <= 0;
  return <div className="reservation-qr-backdrop" role="dialog" aria-modal="true" aria-label={`QR de ${title}`}><section className="reservation-qr-modal"><button className="reservation-detail-close" onClick={onClose}>Cerrar</button><small>{entry.item.code}</small><h2>{title}</h2>{entry.pass ? <><img src={`${apiBaseUrl}/public/pass/${entry.pass.code}/qr`} alt={`Código QR de ${title}`}/><b>{ready ? "QR listo para ingreso" : "QR pendiente de pago"}</b><p>{ready ? "Presenta este QR únicamente para esta reserva al llegar." : "Esta reserva conserva su QR, pero se habilitará cuando completes el saldo pendiente."}</p><a href={`${apiBaseUrl}/public/pass/${entry.pass.code}/qr`} download={`Park-Plaza-${entry.item.code}.png`}><Download/> Descargar QR</a></> : <><span className="reservation-qr-placeholder"><QrCode/></span><b>QR en preparación</b><p>Esta reserva aún no tiene un pase generado. Actualiza la página o consulta en Recepción.</p></>}</section></div>;
}

function FriendlyStatus({ value }) { const labels = { PENDIENTE_PAGO: "Pago pendiente", LISTO_INGRESO: "Listo para ingreso", CONFIRMADA: "Confirmada", COTIZACION: "En cotización", ACTIVO: "Acceso activo", FINALIZADA: "Finalizada", CANCELADA: "Cancelada" }; return <span className={`friendly-status ${String(value || "").toLowerCase()}`}>{labels[value] || String(value || "").replaceAll("_", " ")}</span>; }
function StatusLegend() { return <div className="status-legend"><b>¿Qué significa cada estado?</b><span><i className="green"/>Confirmada: lista para usar</span><span><i className="gold-dot"/>Pendiente: falta una acción</span><span><i className="gray"/>Finalizada: ya terminó</span></div>; }
function formatDate(value) { if (!value) return "Fecha por confirmar"; return new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" }); }

function PaymentSuccess({ result, selection, onExperience, onAdd }) {
  const pending = result?.booking?.balance > 0;
  const serviceCode = selection?.service?.code || "MIRADOR";
  return <UnifiedPaymentSuccess serviceCode={serviceCode} code={result?.booking?.code || "RESERVA PARK PLAZA"} pending={pending} detail={pending ? `Pagaste S/ ${Number(result?.booking?.paid || 0).toFixed(2)}. Completa el saldo de S/ ${Number(result?.booking?.balance || 0).toFixed(2)} antes de ingresar.` : "Tu servicio está pagado y fue agregado a tu pase único."} onExperience={onExperience} onAdd={onAdd}/>;
}

function PoolPaymentSuccess({ result, pending, onExperience, onAdd }) {
  const code = result?.booking?.code || "RESERVA PARK PLAZA";
  return <main className="pool-payment-success"><img className="pool-payment-image" src="/images/experiences/piscina.webp" alt="Piscina Park Plaza"/><div className="pool-payment-veil"/><header className="pool-payment-brand"><img src="/brand/park-plaza-mark.svg" alt="Park Plaza"/><span><b>PARK PLAZA</b><small>PUCALLPA</small></span></header><div className="pool-payment-copy"><small>EXPERIENCIA PARK PLAZA</small><h1>{pending ? "¡Reserva asegurada!" : "¡Pago confirmado!"}</h1><p>Tu operación se registró correctamente.</p><i/></div><section className="pool-payment-card"><span className="pool-payment-check"><Check/></span><small>{code}</small><h2>Piscina</h2><p>{pending ? `Pagaste S/ ${Number(result?.booking?.paid || 0).toFixed(2)}. Completa el saldo antes de ingresar.` : "Tu servicio está pagado y fue agregado a tu pase único."}</p><div className={`pool-payment-access ${pending ? "pending" : "ready"}`}><QrCode/><div><b>{pending ? "QR pendiente de pago" : "QR listo para ingreso"}</b><small>{pending ? "Tu fecha y cupos están guardados. Completa el saldo para activar el ingreso." : "Recepción o el control del servicio validará tu entrada antes de habilitar consumos."}</small></div></div><button className="primary" onClick={onExperience}>{pending ? "Ver reserva y completar después" : "Ver mi pase y próximo paso"}<ChevronRight/></button><button className="pool-payment-add" onClick={onAdd}><Plus/>Agregar otra experiencia</button></section></main>;
}

function LodgingPaymentSuccess({ result, pending, onExperience, onAdd }) {
  const code = result?.booking?.code || "RESERVA PARK PLAZA";
  return <main className="lodging-payment-success"><img className="lodging-payment-image" src="/images/experiences/hospedaje.webp" alt="Habitación Park Plaza"/><div className="lodging-payment-veil"/><header className="lodging-payment-brand"><img src="/brand/park-plaza-mark.svg" alt="Park Plaza"/><span><b>PARK PLAZA</b><small>PUCALLPA</small></span></header><div className="lodging-payment-copy"><small>EXPERIENCIA PARK PLAZA</small><h1>{pending ? "¡Reserva asegurada!" : "¡Pago confirmado!"}</h1><i/><p>Tu operación se registró correctamente.</p></div><section className="lodging-payment-card"><span className="lodging-payment-check"><Check/></span><small>{code}</small><h2>Hospedaje</h2><p>{pending ? `Pagaste S/ ${Number(result?.booking?.paid || 0).toFixed(2)}. Completa el saldo antes de tu llegada.` : "Tu estadía está pagada y fue agregada a tu pase único."}</p><div className={`lodging-payment-access ${pending ? "pending" : "ready"}`}><QrCode/><div><b>{pending ? "QR pendiente de pago" : "QR listo para tu llegada"}</b><small>{pending ? "Tu habitación y fechas están reservadas. Completa el saldo para activar tu ingreso." : "Recepción validará tu llegada para habilitar tu habitación y los consumos."}</small></div></div><button className="primary" onClick={onExperience}>{pending ? "Ver reserva y completar después" : "Ver mi pase y próximo paso"}<ChevronRight/></button><button className="lodging-payment-add" onClick={onAdd}><Plus/>Agregar otra experiencia</button></section></main>;
}

function LookoutPaymentSuccess({ result, pending, onExperience, onAdd }) {
  const code = result?.booking?.code || "RESERVA PARK PLAZA";
  return <main className="lookout-payment-success"><img src="/images/experiences/mirador.webp" alt="Atardecer desde el Mirador Park Plaza"/><div className="lookout-payment-veil"/><section className="lookout-payment-panel"><header className="lookout-payment-brand"><img src="/brand/park-plaza-mark.svg" alt="Park Plaza"/><span><b>PARK PLAZA</b><small>PUCALLPA</small></span></header><div className="lookout-payment-identity"><span className="lookout-payment-check"><Check/></span><small>{code}</small><h2>Mirador</h2><i/><p>{pending ? `Pagaste S/ ${Number(result?.booking?.paid || 0).toFixed(2)}. Completa el saldo antes de tu visita.` : "Tu servicio está pagado y fue agregado a tu pase único."}</p></div><div className="lookout-payment-main"><small>EXPERIENCIA PARK PLAZA</small><h1>{pending ? "¡Reserva asegurada!" : "¡Pago confirmado!"}</h1><p>Tu operación se registró correctamente.</p><div className={`lookout-payment-access ${pending ? "pending" : "ready"}`}><QrCode/><div><b>{pending ? "QR pendiente de pago" : "QR listo para ingreso"}</b><small>{pending ? "Tu visita está reservada. Completa el saldo para activar el ingreso." : "Recepción o el control del servicio validará tu entrada antes de habilitar los consumos."}</small></div></div></div><div className="lookout-payment-actions"><button className="primary" onClick={onExperience}>{pending ? "Ver reserva y completar después" : "Ver mi pase y próximo paso"}<ChevronRight/></button><button type="button" onClick={onAdd}><Plus/>Agregar otra experiencia</button></div></section></main>;
}

function UnifiedPaymentSuccess({ serviceCode, code, pending, detail, onExperience, onAdd, primaryLabel }) {
  const config = {
    HOSPEDAJE: { title: "Hospedaje", image: "/images/experiences/hospedaje.webp", alt: "Habitación Park Plaza" },
    PISCINA: { title: "Piscina", image: "/images/experiences/piscina.webp", alt: "Piscina Park Plaza" },
    MIRADOR: { title: "Mirador", image: "/images/experiences/mirador.webp", alt: "Atardecer desde el Mirador Park Plaza" },
    EVENTOS: { title: "Eventos", image: "/images/experiences/eventos.webp", alt: "Evento Park Plaza" }
  }[serviceCode] || { title: "Experiencia", image: "/images/experiences/mirador.webp", alt: "Experiencia Park Plaza" };
  const accessTitle = pending ? "Pago pendiente" : "QR listo para ingreso";
  const accessCopy = pending ? "Tu reserva está registrada. Completa el saldo para habilitar el ingreso." : "Recepción o el control del servicio validará tu entrada antes de habilitar los consumos.";
  return <main className={`unified-payment-success ${serviceCode.toLowerCase()}-payment-success`}><img src={config.image} alt={config.alt}/><div className="unified-payment-veil"/><section className="unified-payment-panel"><header className="unified-payment-brand"><img src="/brand/park-plaza-mark.svg" alt="Park Plaza"/><span><b>PARK PLAZA</b><small>PUCALLPA</small></span></header><div className="unified-payment-identity"><span className="unified-payment-check"><Check/></span><small>{code}</small><h2>{config.title}</h2><i/><p>{detail}</p></div><div className="unified-payment-main"><small>EXPERIENCIA PARK PLAZA</small><h1>{pending ? "¡Reserva asegurada!" : "¡Pago confirmado!"}</h1><p>Tu operación se registró correctamente.</p><div className={`unified-payment-access ${pending ? "pending" : "ready"}`}><QrCode/><div><b>{accessTitle}</b><small>{accessCopy}</small></div></div></div><div className="unified-payment-actions"><button className="primary" onClick={onExperience}>{primaryLabel || (pending ? "Ver reserva y completar después" : "Ver mi pase y próximo paso")}<ChevronRight/></button><button type="button" onClick={onAdd}><Plus/>Agregar otra experiencia</button></div></section></main>;
}

function Experience({ experience, onBack, onPay, onOrders, onRequest, onAdd }) {
  const [connected, setConnected] = useState(realtime.connected);
  const [checkoutNotice, setCheckoutNotice] = useState("");
  const [expressCheckoutOpen, setExpressCheckoutOpen] = useState(false);
  useEffect(() => { const on = () => setConnected(true); const off = () => setConnected(false); realtime.on("connect", on); realtime.on("disconnect", off); return () => { realtime.off("connect", on); realtime.off("disconnect", off); }; }, []);
  const passes = experience?.passes || (experience?.pass ? [experience.pass] : []);
  if (!passes.length) return <Page title="Mi experiencia" subtitle="Aún no tienes reservas." onBack={onBack}><button className="primary" onClick={onAdd}>Elegir un servicio</button></Page>;
  const primaryPass = passes.find((pass) => pass.kind === "MASTER") || passes[0];
  const ordersEnabled = canPlaceOrders(experience);
  const activeStay = experience.bookings.find((item) => item.serviceCode === "HOSPEDAJE" && item.status === "CHECKED_IN" && item.stay?.status === "ACTIVA");
  const waitingCheckIn = experience.bookings.find((item) => item.serviceCode === "HOSPEDAJE" && item.paymentStatus === "PAGADO" && item.status === "CONFIRMADA" && !item.stay);
  const entitlements = passes.flatMap((pass) => pass.entitlements || []);
  const activeAccesses = entitlements.filter((item) => ["ACTIVO", "UTILIZADO"].includes(item.status));
  const customerRequests = experience.requests || [];
  const activeRequests = customerRequests.filter((item) => !["ATENDIDO", "RESUELTO", "CANCELADO"].includes(item.status));
  const passVisual = entitlements.some((item) => item.status === "ACTIVO") ? { label: "ACCESO ACTIVO", tone: "active", help: "Tu ingreso fue validado. Ya puedes usar los beneficios y consumos de este servicio." } : entitlements.some((item) => item.status === "UTILIZADO") ? { label: "INGRESO VALIDADO", tone: "active", help: "Tu entrada fue validada y los consumos de esta experiencia están disponibles." } : entitlements.some((item) => item.status === "LISTO_INGRESO") ? { label: "LISTO PARA INGRESO", tone: "ready", help: "El pago está completo. Presenta este QR para validar tu entrada." } : entitlements.some((item) => item.status === "PENDIENTE") ? { label: "PAGO PENDIENTE", tone: "pending", help: "Tu QR existe, pero falta completar un saldo." } : { label: "SIN ACCESOS VIGENTES", tone: "used", help: "Agrega una experiencia para volver a utilizar este mismo QR." };
  const groups = Object.values((experience.orders || []).reduce((acc, order) => { const key = order.groupCode || order.code; acc[key] ||= { key, groupCode: order.groupCode, orders: [] }; acc[key].orders.push(order); return acc; }, {})).sort((a, b) => String(b.orders[0]?.createdAt).localeCompare(String(a.orders[0]?.createdAt)));
  
  async function doCheckout(method, code) {
    try {
      await request(`/public/bookings/${activeStay.id}/checkout`, { method: "POST", body: { paymentMethod: method, paymentCode: code } }, true);
      setCheckoutNotice("Check-out Express completado. Tu habitación está en proceso de liberación.");
      setExpressCheckoutOpen(false);
    } catch (e) {
      setCheckoutNotice("Error al realizar Check-out: " + (e.message || "Contacte recepción"));
    }
  }

  return <main className="qr-experience"><header className="qr-experience-hero"><div className="qr-experience-top"><button type="button" className="qr-experience-back" onClick={onBack}><ArrowLeft/>Volver</button><div className="qr-experience-brand"><img src="/brand/park-plaza-mark.svg" alt="Park Plaza"/><span><b>PARK PLAZA</b><small>EXPERIENCIAS PARA RECORDAR</small></span></div><span className="qr-experience-avatar">PP</span></div><div className="qr-experience-copy"><small>EXPERIENCIA PARK PLAZA</small><h1>Mi experiencia</h1><p>Accesos y pedidos son procesos distintos. Aquí puedes seguir ambos sin confusiones.</p></div></header><section className="qr-experience-content">
    {checkoutNotice ? <div className="toast">{checkoutNotice}</div> : null}
    <div className={`realtime-strip ${connected ? "online" : "reconnecting"}`}><i/><div><b>{connected ? "Actualización en vivo activa" : "Reconectando actualización en vivo"}</b><small>{connected ? "Los cambios de Recepción, cocina y bar aparecerán aquí sin recargar." : "Mientras vuelve la conexión, el sistema comprobará los cambios automáticamente."}</small></div></div><section className="digital-pass qr-primary-pass"><div className="pass-head"><img src="/brand/park-plaza-mark.svg" alt="Park Plaza"/><div><small>{primaryPass.kind === "MASTER" ? "PASE MAESTRO · PAQUETE" : `PASE DE ${serviceName(primaryPass.serviceCode || primaryPass.entitlements?.[0]?.serviceCode || "SERVICIO").toUpperCase()}`}</small><h2>{experience.client.firstName} {experience.client.lastName}</h2><p>{primaryPass.code}</p></div><span className={passVisual.tone}>{passVisual.label}</span></div><img className="qr" src={`${apiBaseUrl}/public/pass/${primaryPass.code}/qr`} alt={`Código QR del pase ${primaryPass.code}`}/><div className="qr-pass-guidance"><p>Presenta este QR en recepción, restaurantes, bartender y en el check-out para validar tu acceso.</p><a className="pass-download" href={`${apiBaseUrl}/public/pass/${primaryPass.code}/qr`} download={`Park-Plaza-${primaryPass.code}.png`}><Download/> Descargar mi QR</a><small>{primaryPass.kind === "MASTER" ? "Este pase reúne exclusivamente los servicios de tu paquete promocional." : "Este QR corresponde únicamente al servicio indicado y se valida al ingresar."}</small></div></section>
    
    {waitingCheckIn ? <section className="customer-journey-state waiting"><div className="journey-state-head"><span><Clock3/></span><div><small>SIGUIENTE PASO</small><h3>Tu pago está completo · falta validar tu llegada</h3><p>Presenta el pase en Recepción. Después del check-in se habilitarán Restaurante, Bartender y el check-out.</p></div></div><div className="journey-state-steps"><span className="done"><CheckCircle2/>Reserva</span><span className="done"><CheckCircle2/>Pago</span><span className="current"><Clock3/>Check-in</span><span><ShoppingBag/>Pedidos</span></div><p className="journey-state-code">{waitingCheckIn.code} · Habitación {waitingCheckIn.room?.number || "asignada"}</p></section> : null}
    {activeAccesses.length ? <section className="customer-journey-state active"><div className="journey-state-head"><span><CheckCircle2/></span><div><small>ACCESO ACTIVO</small><h3>{activeStay ? "Check-in validado · servicios habilitados" : `${serviceName(activeAccesses[0].serviceCode)} validado · experiencia habilitada`}</h3><p>Ya puedes realizar pedidos y solicitar asistencia desde esta misma aplicación.</p></div></div><div className="journey-state-steps"><span className="done"><CheckCircle2/>Reserva</span><span className="done"><CheckCircle2/>Pago</span><span className="done"><CheckCircle2/>Ingreso</span><span className="current"><ShoppingBag/>Pedidos</span></div></section> : null}

    {activeStay ? (
      <section className="checkout-express-banner">
        <div className="flex-row">
          <div>
            <h3>Check-out Express</h3>
            <p>Sal del hotel sin pasar por recepción. Cobraremos consumos extra de tu saldo.</p>
          </div>
          <button className="primary compact" onClick={() => setExpressCheckoutOpen(true)}>Hacer check-out</button>
        </div>
        {expressCheckoutOpen && <ExpressCheckoutPanel onCancel={() => setExpressCheckoutOpen(false)} onConfirm={doCheckout} />}
      </section>
    ) : null}

    <section className="experience-section"><div className="section-title"><div><small>CONTROL DE INGRESO</small><h2>Servicios incluidos en tu QR</h2></div><span>{entitlements.reduce((sum, item) => sum + Number(item.people || 0), 0)} accesos reservados</span></div><div className="entitlements">{entitlements.map((item) => <article key={item.id}><span className={`status ${item.status.toLowerCase()}`}>{accessLabel(item.status)}</span><h3>{item.serviceCode}</h3><p>{item.date} · {item.slot}</p><b>{peopleLabel(item.people)}</b>{item.usedAt ? <small>Ingreso validado: {new Date(item.usedAt).toLocaleString("es-PE")}</small> : null}</article>)}</div></section>{experience.bookings.filter((item) => item.balance > 0).map((item) => <div className="payment-alert" key={item.id}><div><b>Completa {serviceName(item.serviceCode)}</b><p>Saldo pendiente S/ {item.balance}. El pago dejará el QR listo para validar tu ingreso.</p></div><button className="gold" onClick={() => onPay(item)}>Elegir método y pagar</button></div>)}<div className="actions-grid"><button onClick={onAdd}><Plus/>Agregar servicio</button><button disabled={!ordersEnabled} onClick={onOrders}><ShoppingBag/>{ordersEnabled ? "Hacer pedido" : "Pedidos al validar ingreso"}</button><button onClick={onRequest}><ConciergeBell/>Solicitar ayuda</button></div><section className="experience-section orders-section"><div className="section-title"><div><small>CONSUMOS</small><h2>Seguimiento de pedidos</h2></div><span>{groups.length} compra(s)</span></div>{groups.length ? groups.map((group) => <OrderGroup group={group} key={group.key}/>) : <div className="empty-order"><ShoppingBag/><p>Aún no hiciste pedidos. Cuando confirmes y pagues uno, verás aquí su avance en tiempo real.</p></div>}</section>

{customerRequests.length > 0 && <section className="experience-section requests-section"><div className="section-title"><div><small>ASISTENCIA</small><h2>Mis solicitudes</h2></div><span>{activeRequests.length ? `${activeRequests.length} en curso` : "Todas atendidas"}</span></div>{customerRequests.map((req) => <RequestGroup req={req} key={req.id}/>)}</section>}

</section></main>;
}

function ExpressCheckoutPanel({ onCancel, onConfirm }) {
  const [method, setMethod] = useState("EFECTIVO");
  const [code, setCode] = useState("");
  const methods = [
    { id: "YAPE", label: "Yape" },
    { id: "PLIN", label: "Plin" },
    { id: "EFECTIVO", label: "Dejar en Caja" }
  ];

  return <div className="card mt-4 p-4 border border-park-gold">
    <h3 className="text-park-gold-deep font-bold mb-2">Método de pago (Consumos Extra)</h3>
    <div className="flex flex-wrap gap-2 mb-4">
      {methods.map(m => (
        <button key={m.id} className={`px-3 py-1 rounded border ${method === m.id ? 'bg-park-gold text-white font-bold' : 'bg-gray-100 text-gray-700'}`} onClick={() => setMethod(m.id)}>{m.label}</button>
      ))}
    </div>
    {method !== "EFECTIVO" ? (
      <Field label={`Código de operación / celular (${method})`} value={code} onChange={setCode} />
    ) : (
      <p className="text-xs text-gray-600 mb-3">Si tienes consumos, por favor deja el efectivo exacto en la habitación o pasa un momento por caja antes de salir.</p>
    )}
    <div className="flex gap-2">
      <button className="flex-1 bg-gray-200 text-gray-800 font-bold py-2 rounded" onClick={onCancel}>Cancelar</button>
      <button className="flex-1 bg-park-gold text-white font-bold py-2 rounded" disabled={method !== 'EFECTIVO' && !code} onClick={() => onConfirm(method, code)}>Confirmar Salida</button>
    </div>
  </div>;
}

function OrderGroup({ group }) {
  const delivered = group.orders.every((item) => item.status === "ENTREGADO");
  const total = group.orders.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const [rated, setRated] = useState(false);

  async function rate(stars) {
    setRated(true);
    try { await request(`/public/orders/${group.orders[0]?.id}/rate`, { method: "POST", body: { stars } }, true); } catch(e){}
  }

  return <article className={`order-card ${delivered ? "delivered" : ""}`}>
    <div className="order-card-head"><div><small>{group.groupCode ? "PEDIDO COMBINADO" : "PEDIDO"}</small><h3>{group.groupCode || group.orders[0]?.code}</h3><p>{group.orders.map((item) => item.area === "BARTENDER" ? "Bar" : "Restaurante").join(" + ")} · S/ {total.toFixed(2)}</p></div><span className="font-bold text-xs">{delivered ? "Entregado" : "En curso"}</span></div>
    {group.orders.map((order) => <ProgressTracker type="order" order={order} key={order.id} />)}
    
    {delivered && !rated && (
      <div className="feedback-prompt"><small>¿Qué tal estuvo tu pedido?</small><div className="stars">{[1,2,3,4,5].map(s => <button key={s} onClick={() => rate(s)}>★</button>)}</div></div>
    )}
    {rated && <div className="feedback-thanks"><small>¡Gracias por tu calificación!</small></div>}
  </article>;
}

function RequestGroup({ req }) {
  const delivered = ["ATENDIDO", "RESUELTO"].includes(req.status);
  const accepted = Boolean(req.receptionAcceptedAt);
  return <article className={`order-card ${delivered ? "delivered" : ""}`}>
    <div className="order-card-head"><div><small>SOLICITUD</small><h3>{req.code}</h3><p>{req.type}</p></div><span className="font-bold text-xs">{delivered ? "Atendido" : accepted ? "Personal asignado" : "En espera de Recepción"}</span></div>
    <ProgressTracker type="request" order={req} />
  </article>;
}

function ProgressTracker({ type, order }) {
  const isOrder = type === "order";
  const steps = isOrder ? ["Recibido", "Preparando", "En camino", "Entregado"] : ["Recibido", "Asignado", "Atendido"];
  
  let current = 0;
  if (isOrder) {
    if (order.status === "EN_PREPARACION") current = 1;
    if (order.status === "LISTO") current = 2;
    if (order.status === "ENTREGADO") current = 3;
    if (order.status === "CANCELADO") current = 0;
  } else {
    if (order.status === "EN_CURSO") current = 1;
    if (["ATENDIDO", "RESUELTO"].includes(order.status)) current = 2;
    if (order.status === "CANCELADO") current = 0;
  }

  const iconsList = isOrder ? [ClipboardList, ChefHat, Bike, CheckCircle2] : [ClipboardList, Users, CheckCircle2];

  return <div style={{marginBottom: 16}}>
    {isOrder && <div className="mb-2"><b>{order.area === "BARTENDER" ? "Bar - " : "Restaurante - "}{order.code}</b><br/><small className="text-gray-400">{order.items?.map((item) => `${item.quantity}x ${item.name}`).join(", ")}</small></div>}
    {!isOrder && <div className="mb-2"><b>{order.description || "Asistencia solicitada"}</b></div>}
    
    <div className="tracker">
      {steps.map((label, i) => {
        const done = i <= current;
        const active = i === current;
        const Icon = iconsList[i];
        return <div key={label} className={`track-step ${done ? "done" : ""} ${active && !isOrder && i!==2 ? "active" : ""} ${active && isOrder && i!==3 ? "active" : ""}`}>
          <i><Icon size={14} /></i>
          <small>{label}</small>
        </div>;
      })}
    </div>
    {isOrder && order.status !== "ENTREGADO" && order.status !== "CANCELADO" && <p className="text-xs text-center mt-4 text-park-gold">Tiempo estimado: {order.estimatedMinutes} min</p>}
  </div>;
}

function Directory({ onBack }) {
  return (
    <Page title="Directorio y Servicios" subtitle="Todo lo que necesitas saber durante tu estadía en Park Plaza." onBack={onBack}>
      <div className="card">
        <h2><Wifi className="inline mr-2" size={20}/> Conexión Wi-Fi</h2>
        <div className="flex justify-between items-center mt-3 p-3 bg-[var(--card-glass)] border border-[rgba(255,255,255,0.1)] rounded-lg">
          <div><small className="text-gray-400 block mb-1">Red</small><p className="font-bold">ParkPlaza_Guest</p></div>
          <div><small className="text-gray-400 block mb-1">Contraseña</small><p className="font-bold text-park-gold">Plaza2026</p></div>
        </div>
      </div>
      <div className="card">
        <h2><Utensils className="inline mr-2" size={20}/> Horarios de Restaurante</h2>
        <Row label="Desayuno Buffet" value="06:30 - 10:00" />
        <Row label="Almuerzo" value="12:30 - 15:30" />
        <Row label="Cena / Bar" value="18:30 - 23:00" />
      </div>
      <div className="card">
        <h2><BookOpen className="inline mr-2" size={20}/> Información Útil</h2>
        <Row label="Check-out" value="12:00 m." />
        <Row label="Piscina" value="08:00 - 20:00" />
        <Row label="Recepción" value="24 horas" />
        <p className="mt-4 text-xs text-gray-400">Por favor, recuerda que el uso de la piscina requiere reserva previa desde la app para controlar el aforo y garantizar tu comodidad.</p>
      </div>
    </Page>
  );
}

function accessLabel(status) { return ({ ACTIVO: "ACCESO ACTIVO", LISTO_INGRESO: "LISTO PARA VALIDAR", PENDIENTE: "PAGO PENDIENTE", UTILIZADO: "INGRESO VALIDADO", FINALIZADO: "FINALIZADO", REVOCADO: "DESHABILITADO" })[status] || status; }
function peopleLabel(value) { const count = Number(value || 1); return count === 1 ? "Acceso para 1 persona" : `Acceso para ${count} personas`; }
function orderStatusLabel(status) { return ({ PENDIENTE: "Pedido recibido", EN_COCINA: "En cocina", PREPARANDO: "Preparando", LISTO: "Listo para entregar", ENTREGADO: "Entregado", CANCELADO: "Cancelado" })[status] || status; }
function orderSteps(area) { return area === "BARTENDER" ? ["Recibido", "Preparando", "Listo", "Entregado"] : ["Recibido", "En cocina", "Preparando", "Listo", "Entregado"]; }
function orderStepIndex(order) { const flow = order.area === "BARTENDER" ? ["PENDIENTE", "PREPARANDO", "LISTO", "ENTREGADO"] : ["PENDIENTE", "EN_COCINA", "PREPARANDO", "LISTO", "ENTREGADO"]; return Math.max(0, flow.indexOf(order.status)); }

function serviceName(code) { return ({ HOSPEDAJE: "tu hospedaje", PISCINA: "tu reserva de piscina", MIRADOR: "tu reserva de mirador", EVENTOS: "tu evento" })[code] || "tu servicio"; }
function menuAvailableFor(item, serviceCode) {
  const availability = Array.isArray(item?.availableFor) ? item.availableFor : String(item?.availableFor || "").split(/[\s,|]+/);
  return availability.map((value) => String(value).toUpperCase()).includes(String(serviceCode || "").toUpperCase());
}
function destinationLabel(serviceCode, booking) {
  if (serviceCode === "HOSPEDAJE") return `Habitación ${booking?.room?.number || booking?.roomId || "asignada"}`;
  if (serviceCode === "PISCINA") return `Piscina · ${booking?.slot || "horario validado"}`;
  if (serviceCode === "MIRADOR") return `Mirador · ${booking?.slot || "horario validado"}`;
  return serviceName(serviceCode);
}
function orderDestinations(experience) {
  const bookings = experience?.bookings || [];
  const activeEntitlements = activePassEntitlements(experience);
  const activeBookingIds = new Set(activeEntitlements.map((item) => Number(item.bookingId)).filter(Boolean));
  const destinations = [];
  const add = (booking, serviceCode) => {
    if (!booking || !serviceCode || ["CANCELADA", "FINALIZADA"].includes(booking.status)) return;
    const value = `booking:${booking.id}:${serviceCode}`;
    if (!destinations.some((item) => item.value === value)) destinations.push({ value, label: destinationLabel(serviceCode, booking) });
  };
  bookings.filter((booking) => booking.paymentStatus === "PAGADO" && (booking.status === "CHECKED_IN" || activeBookingIds.has(Number(booking.id)))).forEach((booking) => add(booking, booking.serviceCode));
  // La Llave Maestra se activa desde el check-in de hospedaje: el huésped puede
  // elegir si su pedido debe llegar a su habitación, Piscina o Mirador.
  activeEntitlements.filter((entry) => entry.includedByBundle && ["LISTO_INGRESO", "ACTIVO", "UTILIZADO"].includes(entry.status)).forEach((entry) => {
    const booking = bookings.find((item) => Number(item.id) === Number(entry.bookingId));
    if (booking?.status === "CHECKED_IN") add(booking, entry.serviceCode);
  });
  (experience?.events || []).filter((item) => item.status === "CONFIRMADO" && Number(item.balance || 0) <= 0 && item.accessStatus === "INGRESO_VALIDADO").forEach((item) => destinations.push({ value: `event:${item.id}:EVENTOS`, label: `Evento · ${item.name}` }));
  return destinations;
}
function activePassEntitlements(experience) { return (experience?.passes || (experience?.pass ? [experience.pass] : [])).flatMap((pass) => pass.entitlements || []).filter((item) => ["ACTIVO", "UTILIZADO"].includes(item.status)); }
function canPlaceOrders(experience) { const usedBookingIds=new Set(activePassEntitlements(experience).map((item)=>Number(item.bookingId)).filter(Boolean)); return Boolean(experience?.bookings?.some((item) => item.paymentStatus === "PAGADO" && (item.status === "CHECKED_IN" || usedBookingIds.has(Number(item.id))) && !["CANCELADA", "FINALIZADA"].includes(item.status)) || experience?.events?.some((item) => item.status === "CONFIRMADO" && Number(item.balance || 0) <= 0 && item.accessStatus === "INGRESO_VALIDADO")); }

function Orders({ catalog, experience, onBack, onPlaced }) {
  const destinations = useMemo(() => orderDestinations(experience), [experience]);
  const [area, setArea] = useState("TODOS"); const [category, setCategory] = useState("TODAS"); const [cart, setCart] = useState({}); const [busy, setBusy] = useState(false); const [notes, setNotes] = useState(""); const [destination, setDestination] = useState(""); const [paymentMethod, setPaymentMethod] = useState("YAPE"); const [error, setError] = useState("");
  useEffect(() => { if (!destinations.some((item) => item.value === destination)) setDestination(destinations[0]?.value || ""); }, [destinations, destination]);
  const [destinationKind, destinationId, destinationService] = destination.split(":"); const activeService = destinationKind === "booking" ? destinationService : destinationKind === "event" ? "EVENTOS" : null;
  const visibleByArea = (catalog.menu || []).filter((item) => item.salesEnabled === true && item.available === true && (area === "TODOS" || item.area === area) && (!activeService || menuAvailableFor(item, activeService)));
  const categories = [...new Set(visibleByArea.map((item) => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  const items = visibleByArea.filter((item) => category === "TODAS" || item.category === category);
  const selected = (catalog.menu || []).filter((item) => cart[item.id]);
  const total = selected.reduce((sum, item) => sum + item.price * cart[item.id], 0);
  async function place() { setBusy(true); setError(""); try { const [kind, id, serviceCode] = destination.split(":"); await request("/public/orders", { method: "POST", body: { notes, paymentMethod, serviceCode, bookingId: kind === "booking" ? Number(id) : null, eventId: kind === "event" ? Number(id) : null, items: selected.map((item) => ({ menuItemId: item.id, quantity: cart[item.id] })) } }, true); onPlaced(); } catch (cause) { setError(cause.message); } finally { setBusy(false); } }
  return <Page title="Carta Park Plaza" subtitle="Elige dónde recibirás el pedido. Cocina o bar lo reciben únicamente después de confirmar tu pago." onBack={onBack}><section className="card"><Field label="Servicio y punto de entrega" type="select" value={destination} options={destinations.length ? destinations : [{ value: "", label: "Aún no tienes un servicio habilitado" }]} onChange={(value) => { setDestination(value); setCart({}); }}/><small className="center">Solo aparecen servicios con pago e ingreso validados.</small></section>{!destinations.length ? <div className="empty-friendly"><ShoppingBag/><h2>Aún no puedes pedir</h2><p>Termina el pago y valida tu ingreso en Recepción o en el punto de acceso. Esta vista se actualizará automáticamente.</p><button className="primary" onClick={onBack}>Volver a mi experiencia</button></div> : <><div className="segments menu-segments">{[["TODOS", "Toda la carta"], ["RESTAURANTE", "Restaurante"], ["BARTENDER", "Bar"]].map(([value, label]) => <button key={value} className={area === value ? "active" : ""} onClick={() => { setArea(value); setCategory("TODAS"); }}>{label}</button>)}</div>{categories.length > 1 ? <div className="segments menu-segments">{[["TODAS", "Todas"], ...categories].map((entry) => { const [value, label] = Array.isArray(entry) ? entry : [entry, entry]; return <button key={value} className={category === value ? "active" : ""} onClick={() => setCategory(value)}>{label}</button>; })}</div> : null}<div className="visual-menu">{items.map((item) => <article className={!item.available ? "unavailable" : ""} key={item.id}><img src={item.image} alt={item.name}/><div className="menu-copy"><span>{item.category} · {item.area === "BARTENDER" ? "Bar" : "Cocina"}</span><h3>{item.name}</h3><p>{item.description}</p><div className="menu-tags">{(item.tags || []).map((tag) => <small key={tag}>{tag}</small>)}</div><p className="ingredients">{(item.ingredients || []).map((entry) => entry.name).join(" · ")}</p><b>S/ {item.price} · {item.prepMinutes} min</b></div><div className="qty"><button type="button" aria-label={`Quitar ${item.name}`} disabled={!item.available} onClick={() => setCart({ ...cart, [item.id]: Math.max(0, (cart[item.id] || 0) - 1) })}><Minus/></button><strong>{cart[item.id] || 0}</strong><button type="button" aria-label={`Agregar ${item.name}`} disabled={!item.available} onClick={() => setCart({ ...cart, [item.id]: (cart[item.id] || 0) + 1 })}><Plus/></button></div>{!item.available ? <span className="sold-out">Agotado</span> : null}</article>)}</div>{!items.length ? <div className="empty-friendly"><Utensils/><h2>No hay productos disponibles</h2><p>Administración debe habilitar platos o bebidas para este servicio.</p></div> : null}{selected.length ? <section className="cart-summary"><div className="cart-total"><span><b>{selected.reduce((sum, item) => sum + cart[item.id], 0)} productos</b><small>{selected.some((item) => item.area === "RESTAURANTE") && selected.some((item) => item.area === "BARTENDER") ? "Cocina y bar recibirán sus partes sincronizadas después del pago" : "El área responsable recibirá el pedido después del pago"}</small></span><strong>S/ {Number(total).toFixed(2)}</strong></div><Field label="Indicaciones para el equipo" value={notes} onChange={setNotes}/><h3>Pago inmediato</h3><PaymentMethods value={paymentMethod} onChange={setPaymentMethod}/>{paymentMethod === "CAJA HOTEL" ? <p className="error">Los pedidos desde la aplicación se pagan digitalmente. Para efectivo, solicita el pedido directamente en el área.</p> : null}{error ? <p className="error">{error}</p> : null}</section> : null}{total ? <button className="sticky primary" disabled={busy || !destination || paymentMethod === "CAJA HOTEL"} onClick={place}>{busy ? "Procesando pago…" : `Pagar y enviar pedido · S/ ${Number(total).toFixed(2)}`}</button> : null}</>}</Page>;
}

function Requests({ onBack, onDone }) { 
  const [type, setType] = useState(""); 
  const [description, setDescription] = useState(""); 
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send() { 
    setBusy(true);
    setError("");
    try {
      await request("/public/requests", { method: "POST", body: { type, description } }, true); 
      onDone(); 
    } catch(e) {
      setError(e.message || "No se pudo conectar. Intenta nuevamente.");
    } finally { setBusy(false); }
  } 

  const categories = [
    { value: "LIMPIEZA", label: "Limpieza extra", desc: "Aseo adicional de la habitación", icon: Sparkles },
    { value: "TOALLAS", label: "Toallas nuevas", desc: "Solicitar cambio o reposición", icon: Waves },
    { value: "MANTENIMIENTO", label: "Falla o avería", desc: "Aire, iluminación o infraestructura", icon: Home },
    { value: "CONSERJERIA", label: "Conserjería", desc: "Otras solicitudes para Recepción", icon: ConciergeBell }
  ];

  return <main className="concierge-studio">
    <header className="concierge-hero">
      <div className="concierge-hero-top">
        <button className="concierge-back" type="button" onClick={onBack}><ArrowLeft size={20}/>Volver</button>
        <img src="/brand/park-plaza-mark.svg" alt="Park Plaza" />
        <span className="concierge-avatar">PP</span>
      </div>
      <div className="concierge-copy">
        <small>EXPERIENCIA PARK PLAZA</small>
        <h1>Conserjería Digital</h1>
        <p>Tu solicitud llegará al momento al equipo responsable.<br/>Housekeeping o mantenimiento, sin llamadas ni esperas.</p>
      </div>
    </header>

    <section className="concierge-panel" aria-label="Nueva solicitud de conserjería">
      <div className="concierge-options">
        {categories.map(({ value, label, desc, icon: Icon }) => (
          <button className={type === value ? "concierge-option selected" : "concierge-option"} key={value} onClick={() => setType(value)}>
            <span className="concierge-option-icon"><Icon size={30}/></span>
            <b>{label}</b>
            <small>{desc}</small>
            {type === value ? <span className="concierge-check">✓</span> : null}
          </button>
        ))}
      </div>
      <div className="concierge-note">
        <span className="concierge-note-icon"><FileText size={25}/></span>
        <label>
          <b>Detalle u observación <small>(Opcional)</small></b>
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Escribe aquí tu solicitud o cualquier detalle adicional…" />
        </label>
        {error ? <p className="error">{error}</p> : null}
        <button className="concierge-submit" onClick={send} disabled={busy || !type}>{busy ? "Enviando solicitud…" : <>Enviar solicitud <ArrowRight size={20}/></>}</button>
      </div>
    </section>
  </main>;
}

function Extras({ selected, setSelected }) { const extras = [{ id: "TOALLA", name: "Toalla premium", price: 8 }, { id: "SNACK", name: "Snack de bienvenida", price: 18 }, { id: "DESAYUNO", name: "Desayuno", price: 24 }]; return <div className="card"><h2>Complementa tu experiencia</h2>{extras.map((item) => { const active = selected.some((entry) => entry.id === item.id); return <label className="check-line" key={item.id}><span><b>{item.name}</b><small>+ S/ {item.price}</small></span><input type="checkbox" checked={active} onChange={() => setSelected(active ? selected.filter((entry) => entry.id !== item.id) : [...selected, item])}/></label>; })}</div>; }
function Parking({ value, setValue }) { return <div className="card"><h2>Cochera y vehículos</h2><p>Vehículos menores no pagan. Autos y camionetas usan un espacio reservado.</p><div className="parking"><button className={value?.type === "MOTO" ? "selected" : ""} onClick={() => setValue({ type: "MOTO", plate: "", price: 0 })}>Moto · cortesía</button><button className={value?.type === "AUTO" ? "selected" : ""} onClick={() => setValue({ type: "AUTO", plate: "DEMO-01", price: 15 })}>Auto · S/ 15</button><button className={value?.type === "CAMIONETA" ? "selected" : ""} onClick={() => setValue({ type: "CAMIONETA", plate: "DEMO-02", price: 20 })}>Camioneta · S/ 20</button><button onClick={() => setValue(null)}>Sin cochera</button></div>{value ? <Field label="Placa" value={value.plate} onChange={(plate) => setValue({ ...value, plate })}/> : null}</div>; }
function Counter({ label, value, setValue }) { return <div className="counter"><span>{label}</span><div><button onClick={() => setValue(Math.max(1, value - 1))}><Minus/></button><b>{value}</b><button onClick={() => setValue(value + 1)}><Plus/></button></div></div>; }
function Page({ title, subtitle, onBack, children, variant = "" }) { return <main className={`page-shell ${variant}`}><header><div className="top-row">{onBack ? <button className="back" type="button" aria-label="Volver" onClick={onBack}><ArrowLeft/><span>Volver</span></button> : <span/>}<img src="/brand/park-plaza-mark.svg" alt="Park Plaza"/><span className="avatar" aria-label="Perfil Park Plaza">PP</span></div><small>EXPERIENCIA PARK PLAZA</small><h1>{title}</h1><p>{subtitle}</p></header><section className="page-content">{children}</section></main>; }
function Field({ label, value, onChange, type = "text", options = [], placeholder = "", maxLength, inputMode, autoComplete }) { return <label className="field"><span>{label}</span>{type === "select" ? <select value={value} onChange={(e) => onChange(e.target.value)}>{options.map((item) => { const option = typeof item === "object" ? item : { value: item, label: item }; return <option value={option.value} key={option.value}>{option.label}</option>; })}</select> : <input required type={type} value={value} placeholder={placeholder} maxLength={maxLength} inputMode={inputMode} autoComplete={autoComplete} onChange={(e) => onChange(e.target.value)}/>}</label>; }
function Info({ icon: Icon, title, text }) { return <div className="notice-card"><Icon/><div><b>{title}</b><small>{text}</small></div></div>; }
function Row({ label, value, total }) { return <div className={`row ${total ? "total" : ""}`}><span>{label}</span><b>{value}</b></div>; }
function BottomNav({ screen, go, ordersEnabled, hasClient }) { return <nav className="customer-nav" aria-label="Navegación del huésped"><button className={screen === "home" ? "active" : ""} onClick={() => go("home")}><Home/>Inicio</button>{hasClient ? <button className={screen === "reservations" ? "active" : ""} onClick={() => go("reservations")}><CalendarDays/>Reservas</button> : null}<button className={screen === "directory" ? "active" : ""} onClick={() => go("directory")}><Map/>Directorio</button>{hasClient ? <><button className={screen === "experience" ? "active" : ""} onClick={() => go("experience")}><QrCode/>Mi QR</button><button disabled={!ordersEnabled} className={screen === "orders" ? "active" : ""} onClick={() => go("orders")}><ShoppingBag/>Pedidos</button></> : null}</nav>; }
async function loadCatalog() {
  const catalog = await request("/public/catalog");
  const localize = (item) => ({ ...item, image: item.image || menuImages[item.code] });
  return { ...catalog, menu: (catalog.menu || []).map(localize), restaurantMenu: (catalog.restaurantMenu || []).map(localize) };
}
async function request(path, options = {}, authenticated = false) { const headers = { "Content-Type": "application/json" }; if (authenticated) headers.Authorization = `Bearer ${localStorage.getItem("pp_customer_token")}`; let response; try { response = await fetch(`${apiBaseUrl}${path}`, { ...options, cache: "no-store", headers, body: options.body ? JSON.stringify(options.body) : undefined }); } catch { const error = new Error("No pudimos conectar con el hotel. Revisa tu conexión e intenta nuevamente."); error.status = 0; throw error; } const data = await response.json().catch(() => null); if (!response.ok) { const error = new Error(data?.message || "No pudimos completar la operación"); error.status = response.status; throw error; } return data; }
