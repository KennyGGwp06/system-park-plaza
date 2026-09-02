import { useEffect, useRef, useState } from "react";
import { ArrowLeft, BedDouble, CalendarDays, Car, Check, ChevronRight, Clock3, Minus, Plus, Sparkles, SunMedium, UserPlus, Users, Waves, X } from "lucide-react";
import { apiBaseUrl } from "./config/api";

const roomImages = {
  Simple: "/images/rooms/simple.webp",
  Matrimonial: "/images/rooms/matrimonial.webp",
  Doble: "/images/rooms/doble.webp",
  Triple: "/images/rooms/triple.webp",
  Suite: "/images/rooms/suite.webp"
};

export function ExperienceFlow({ service, catalog, hasExistingParking = false, onBack, onCheckout, onEventCheckout }) {
  if (!service) return null;
  if (service.code === "HOSPEDAJE") return <LodgingFlow service={service} catalog={catalog} hasExistingParking={hasExistingParking} onBack={onBack} onCheckout={onCheckout}/>;
  if (service.code === "PISCINA") return <PoolFlowEnhanced service={service} catalog={catalog} hasExistingParking={hasExistingParking} onBack={onBack} onCheckout={onCheckout}/>;
  if (service.code === "MIRADOR") return <LookoutFlowEnhanced service={service} catalog={catalog} hasExistingParking={hasExistingParking} onBack={onBack} onCheckout={onCheckout}/>;
  return <EventFlowEnhanced catalog={catalog} hasExistingParking={hasExistingParking} onBack={onBack} onCheckout={onEventCheckout}/>;
}

function LodgingFlow({ service, catalog, hasExistingParking, onBack, onCheckout }) {
  const initialDate = today(); 
  const [checkIn, setCheckIn] = useState(initialDate); 
  const [checkOut, setCheckOut] = useState(addDays(initialDate, 1)); 
  const [calendarFrom, setCalendarFrom] = useState(initialDate);
  const [availability, setAvailability] = useState([]); 
  const [rooms, setRooms] = useState([]); 
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0); 
  const [plan, setPlan] = useState(catalog.plans?.HOSPEDAJE?.[0]); 
  const [extras, setExtras] = useState([]); 
  const [vehicles, setVehicles] = useState([]); 
  const [guests, setGuests] = useState([]);
  const [viewingRoom, setViewingRoom] = useState(null);
  const [roomType, setRoomType] = useState("TODAS");
  const [masterBundle, setMasterBundle] = useState(false);

  useEffect(() => { api(`/public/availability/HOSPEDAJE?from=${calendarFrom}`).then(setAvailability); }, [calendarFrom]);
  useEffect(() => { api(`/public/rooms?checkIn=${checkIn}&checkOut=${checkOut}`).then(setRooms); }, [checkIn, checkOut]);
  useEffect(() => {
    const lodgingPlans = catalog.plans?.HOSPEDAJE || [];
    setPlan((current) => lodgingPlans.find((item) => item.code === current?.code) || lodgingPlans[0] || null);
  }, [catalog.plans]);

  const nights = Math.max(1, daysBetween(checkIn, checkOut)); 
  const people = adults + children; 
  const breakfast = plan?.code === "DESAYUNO" ? people * Number(plan.perPerson || 0) * nights : 0; 
  const extrasTotal = extras.reduce((sum, item) => sum + item.price, 0); 
  const parkingTotal = vehicles.reduce((sum, vehicle) => sum + Number(vehicle.price || 0), 0); 
  const base = Number(viewingRoom?.price || 0) * nights + breakfast; 
  const poolBundlePrice = adults * Number(catalog.plans?.PISCINA?.find((item) => item.code === "ADULTO")?.price || 0) + children * Number(catalog.plans?.PISCINA?.find((item) => item.code === "NINO")?.price || 0);
  const lookoutBundlePrice = Number(catalog.plans?.MIRADOR?.[0]?.price || 0) * people;
  const bundleDiscount = masterBundle ? Math.round((poolBundlePrice + lookoutBundlePrice) * 0.1 * 100) / 100 : 0;
  const bundleTotal = masterBundle ? poolBundlePrice + lookoutBundlePrice - bundleDiscount : 0;
  const total = base + extrasTotal + parkingTotal + bundleTotal;
  const roomTypes = ["TODAS", ...new Set(rooms.map((item) => item.type.name))];
  const visibleRooms = roomType === "TODAS" ? rooms : rooms.filter((item) => item.type.name === roomType);

  function next() {
    if (!viewingRoom || !plan) return;

    onCheckout({ service, planCode: plan.code, planName: plan.name, room: viewingRoom, date: checkIn, checkIn, checkOut, slot: "15:00", people, adults, children, guests: normalizedGuests(guests, adults, children), nights, extras, parking: vehicles[0] || null, vehicles, preferences: {}, preorderItems: [], base, extrasTotal, parkingTotal, bundleCode: masterBundle ? "HOSPEDAJE_PISCINA_MIRADOR" : null, bundleServices: masterBundle ? [{ serviceCode: "PISCINA", date: checkIn, slot: "09:00", people }, { serviceCode: "MIRADOR", date: checkIn, slot: "16:30", people }] : [], bundleTotal, bundleDiscount, total }); 
  }

  return (
    <FlowPage icon={BedDouble} eyebrow="RESERVA DE HOSPEDAJE" title="Elige cómo quieres descansar" subtitle="Selecciona tus fechas y descubre nuestras habitaciones disponibles." onBack={onBack}>
      <Progress current={1}/>
      <DateAvailability days={availability} selected={checkIn} onSelect={(date) => { setCheckIn(date); if (checkOut <= date) setCheckOut(addDays(date, 1)); }} onWindowChange={setCalendarFrom}/>
      
      <section className="flow-card">
        <div className="flow-heading"><div><h2>Escoge tu habitación</h2><p>Filtra por tipo y abre cada opción para ver todos sus detalles.</p></div></div>
        <div className="room-filter" aria-label="Filtrar habitaciones por tipo">{roomTypes.map((type) => <button type="button" className={roomType === type ? "selected" : ""} onClick={() => setRoomType(type)} key={type}>{type === "TODAS" ? "Todas" : type}</button>)}</div>
        <div className="room-catalog">
          {visibleRooms.map((item) => (
            <button type="button" className="room-choice" onClick={() => {
              const capacity = Math.max(1, Number(item.capacity || 1));
              const nextChildren = Math.min(children, Math.max(0, capacity - 1));
              const nextAdults = Math.min(Math.max(1, adults), capacity - nextChildren);

              setChildren(nextChildren);
              setAdults(nextAdults);
              setViewingRoom(item);
            }} key={item.id}>
              <img src={item.imageUrl || roomImages[item.type.name] || roomImages.Simple} alt={item.type.name}/>
              <div>
                <small>HABITACIÓN {item.number}</small>
                <h3>{item.type.name}</h3>
                <p>{item.features.join(" · ")}</p>
                <span>Hasta {item.capacity} personas · Piso {item.floor}</span>
                <strong>S/ {item.price} por noche</strong>
              </div>
            </button>
          ))}
        </div>
        {!visibleRooms.length && <p className="availability-note" style={{marginTop: '1rem'}}>No hay habitaciones de este tipo disponibles para estas fechas.</p>}
      </section>

      {viewingRoom && (
        <div className="room-modal-overlay" onClick={() => setViewingRoom(null)}>
          <div className="room-modal" role="dialog" aria-modal="true" aria-label={`Detalle de habitación ${viewingRoom.number}`} onClick={e => e.stopPropagation()}>
            <button className="room-modal-close" type="button" aria-label="Cerrar detalle de habitación" onClick={() => setViewingRoom(null)}>
              <X size={16}/>
            </button>
            <div className="room-modal-body">
              <img className="room-modal-image" src={viewingRoom.imageUrl || roomImages[viewingRoom.type.name] || roomImages.Simple} alt={viewingRoom.type.name}/>
              <div className="room-modal-content">
                <small style={{ color: 'var(--primary)', fontWeight: 'bold' }}>HABITACIÓN {viewingRoom.number} · PISO {viewingRoom.floor}</small>
                <h2 style={{ margin: '0.5rem 0' }}>{viewingRoom.type.name}</h2>
                <p style={{ color: 'var(--text-light)', marginBottom: '1.5rem' }}>{viewingRoom.description || `Disfruta de nuestra habitación ${viewingRoom.type.name.toLowerCase()}, equipada con ${viewingRoom.features.join(", ")}. Perfecta para hasta ${viewingRoom.capacity} personas.`}</p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  <section>
                    <h3 style={{ fontSize: '1rem', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}><Clock3 size={18} style={{verticalAlign: 'text-bottom', marginRight: '0.5rem'}}/>Tu estadía</h3>
                    <div className="flow-two">
                      <Field label="Entrada" type="date" min={today()} value={checkIn} onChange={(v) => { setCheckIn(v); if(checkOut <= v) setCheckOut(addDays(v, 1)); }}/>
                      <Field label="Salida" type="date" min={addDays(checkIn, 1)} value={checkOut} onChange={setCheckOut}/>
                    </div>
                    <div className="flow-two" style={{ marginTop: '1rem' }}>
                      <Counter label="Adultos" value={adults} setValue={setAdults}/>
                      <Counter label="Niños" value={children} setValue={setChildren} min={0}/>
                    </div>
                    <GuestsEditor adults={adults} children={children} value={guests} onChange={setGuests}/>
                  </section>

                  <ChoiceSection title="Elige el beneficio de tu estadía" subtitle="Cada alternativa muestra lo que incluye tu reserva. Administración puede actualizar estas opciones." options={catalog.plans?.HOSPEDAJE || []} selected={plan?.code} onSelect={setPlan}/>

                  <section>
                    <h3 style={{ fontSize: '1rem', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}><Sparkles size={18} style={{verticalAlign: 'text-bottom', marginRight: '0.5rem'}}/>Mejora tu descanso</h3>
                    <div className="extras-grid" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div>
                        <h4 style={{ fontSize: '0.875rem', textTransform: 'uppercase', color: 'var(--text-light)', marginBottom: '0.5rem' }}>Extras del Hotel</h4>
                        {catalog.extrasByService?.HOSPEDAJE?.map((item) => { 
                          const active = extras.some((entry) => entry.id === item.id); 
                          return <label className="flow-check" key={item.id} style={{marginBottom: '0.5rem'}}><span><b>{item.name}</b><small>+ S/ {item.price}</small></span><input type="checkbox" checked={active} onChange={() => setExtras(active ? extras.filter((entry) => entry.id !== item.id) : [...extras, item])}/></label>; 
                        })}
                      </div>
                    </div>
                  </section>

                  <Parking catalog={catalog} value={vehicles} setValue={setVehicles} hasExistingParking={hasExistingParking}/>

                  <section className={`master-bundle ${masterBundle ? "selected" : ""}`}>
                    <div><small>OFERTA PARA HUÉSPEDES</small><h3>Llave Maestra Park Plaza</h3><p>Incluye tu hospedaje, Piscina y Mirador en un único QR. Puedes reservar cada servicio por separado si prefieres armar tu experiencia a tu manera.</p><span>Piscina desde 09:00 · Mirador desde 16:30</span></div>
                    <button type="button" onClick={() => setMasterBundle(!masterBundle)}>{masterBundle ? "Paquete incluido" : "Agregar paquete"}</button>
                    {masterBundle ? <strong>Incluyes Piscina + Mirador · ahorro S/ {bundleDiscount.toFixed(2)}</strong> : null}
                  </section>

                  <Summary lines={[[`${viewingRoom.type.name} ${viewingRoom.number} · ${nights} noche(s)`, base], [`Huéspedes · ${adults} adulto(s) y ${children} niño(s)`, 0], [`Mejoras · ${extras.length} seleccionada(s)`, extrasTotal], [`Cochera · ${vehicles.length} vehículo(s)`, parkingTotal], ...(masterBundle ? [["Llave Maestra · Piscina + Mirador", poolBundlePrice + lookoutBundlePrice], ["Ahorro del paquete", -bundleDiscount]] : [])]} total={total}/>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)' }}>
                  <button className="primary" type="button" disabled={!plan || people > viewingRoom.capacity} style={{ padding: '1rem 2rem', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '0.5rem', fontWeight: 'bold', cursor: !plan || people > viewingRoom.capacity ? 'not-allowed' : 'pointer', opacity: !plan || people > viewingRoom.capacity ? 0.5 : 1, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }} onClick={next}>
                    {!plan ? "Cargando opciones..." : people > viewingRoom.capacity ? "Excede capacidad máxima" : "Confirmar reserva de habitación"}
                    <ChevronRight size={20}/>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </FlowPage>
  );
}

function PoolFlow({ service, catalog, hasExistingParking, onBack, onCheckout }) {
  const [days, setDays] = useState([]); const [date, setDate] = useState(today()); const [calendarFrom, setCalendarFrom] = useState(today()); const [slot, setSlot] = useState("09:00"); const [adults, setAdults] = useState(1); const [children, setChildren] = useState(0); const [plan, setPlan] = useState(catalog.plans?.PISCINA?.[0]); const [extras, setExtras] = useState([]); const [vehicles, setVehicles] = useState([]);
  useEffect(() => { api(`/public/availability/PISCINA?from=${calendarFrom}`).then(setDays); }, [calendarFrom]); const selectedDay = days.find((item) => item.date === date) || days[0]; const people = plan?.code === "FAMILIAR" ? 4 : adults + children; const adultPrice = Number(catalog.plans?.PISCINA?.find((item) => item.code === "ADULTO")?.price || 0); const childPrice = Number(catalog.plans?.PISCINA?.find((item) => item.code === "NINO")?.price || 0); const base = plan?.code === "FAMILIAR" ? plan.price : adults * adultPrice + children * childPrice; const extrasTotal = extras.reduce((sum, item) => sum + item.price, 0); const parkingTotal = vehicles.reduce((sum, item) => sum + Number(item.price || 0), 0); const total = base + extrasTotal + parkingTotal;
  function next() { onCheckout({ service, planCode: plan.code, planName: plan.name, date, checkIn: date, checkOut: date, slot, people, adults, children, extras, parking: vehicles[0] || null, vehicles, preferences: { access: "Piscina" }, preorderItems: [], nights: 1, base, extrasTotal, parkingTotal, total }); }
  return <FlowPage icon={Waves} eyebrow="PASE DE PISCINA" title="Reserva tu horario sin hacer cola" subtitle="Después del pago, el control de ingreso validará tu QR y habilitará pedidos y consumos." onBack={onBack}><Progress current={1}/><DateAvailability days={days} selected={date} onSelect={(value) => { setDate(value); setSlot(""); }}/><section className="flow-card"><h2>Horario y cupos reales</h2><div className="slot-grid">{(selectedDay?.slots || []).map((item) => <button disabled={!item.available} className={slot === item.time ? "selected" : ""} onClick={() => setSlot(item.time)} key={item.time}><b>{item.time}</b><small>{item.remaining} cupos libres</small></button>)}</div></section><ChoiceSection title="Elige tu pase" options={catalog.plans?.PISCINA || []} selected={plan?.code} onSelect={setPlan}/>{plan?.code !== "FAMILIAR" ? <section className="flow-card"><h2>¿Quiénes ingresan?</h2><div className="flow-two"><Counter label={`Adultos · S/ ${adultPrice}`} value={adults} setValue={setAdults}/><Counter label={`Niños · S/ ${childPrice}`} value={children} setValue={setChildren} min={0}/></div></section> : <div className="flow-card family-note"><Users/><div><b>Pase para 4 personas</b><p>Incluye 2 adultos y 2 niños en un solo control de acceso.</p></div></div>}<Extras title="Comodidad en piscina" items={catalog.extrasByService?.PISCINA || []} selected={extras} setSelected={setExtras}/><Parking catalog={catalog} value={vehicles} setValue={setVehicles} hasExistingParking={hasExistingParking}/><Summary lines={[[`${plan?.name || "Pase"} · ${people} personas`, base], ["Complementos", extrasTotal], [`Cochera · ${vehicles.length} vehículo(s)`, parkingTotal]]} total={total}/><button className="flow-sticky" disabled={!slot || people > Number(selectedDay?.slots?.find((item) => item.time === slot)?.remaining || 0)} onClick={next}>Revisar y pagar piscina <ChevronRight/></button></FlowPage>;
}

function LookoutFlow({ service, catalog, hasExistingParking, onBack, onCheckout }) {
  const [days, setDays] = useState([]); const [date, setDate] = useState(today()); const [calendarFrom, setCalendarFrom] = useState(today()); const [slot, setSlot] = useState("16:30"); const [people, setPeople] = useState(2); const [plan, setPlan] = useState(catalog.plans?.MIRADOR?.[0]); const [extras, setExtras] = useState([]); const [cart, setCart] = useState({}); const [vehicles, setVehicles] = useState([]);
  useEffect(() => { api(`/public/availability/MIRADOR?from=${calendarFrom}`).then(setDays); }, [calendarFrom]); const selectedDay = days.find((item) => item.date === date) || days[0]; const preorderItems = (catalog.restaurantMenu || []).filter((item) => cart[item.id]).map((item) => ({ menuItemId: item.id, name: item.name, quantity: cart[item.id], price: item.price })); const menuTotal = preorderItems.reduce((sum, item) => sum + item.price * item.quantity, 0); const base = Number(plan?.price || 0) * people; const extrasTotal = extras.reduce((sum, item) => sum + item.price, 0) + menuTotal; const parkingTotal = vehicles.reduce((sum, item) => sum + Number(item.price || 0), 0); const total = base + extrasTotal + parkingTotal;
  function next() { onCheckout({ service, planCode: plan.code, planName: plan.name, date, checkIn: date, checkOut: date, slot, people, adults: people, children: 0, extras, parking: vehicles[0] || null, vehicles, preferences: {}, preorderItems, nights: 1, base, extrasTotal, parkingTotal, total }); }
  return <FlowPage icon={SunMedium} eyebrow="RESERVA DE MIRADOR" title="Tu mesa para el atardecer" subtitle="Escoge horario. Después de validar el ingreso podrás seguir comprando desde tu mesa." onBack={onBack}><Progress current={1}/><DateAvailability days={days} selected={date} onSelect={(value) => { setDate(value); setSlot(""); }}/><section className="flow-card"><h2>Hora de llegada</h2><div className="slot-grid">{(selectedDay?.slots || []).map((item) => <button disabled={!item.available} className={slot === item.time ? "selected" : ""} onClick={() => setSlot(item.time)} key={item.time}><b>{item.time}</b><small>{item.remaining} lugares</small></button>)}</div><Counter label="Personas en la mesa" value={people} setValue={setPeople}/></section><ChoiceSection title="Tipo de visita" options={catalog.plans?.MIRADOR || []} selected={plan?.code} onSelect={setPlan}/><MenuPicker title="Preordena tu consumo" subtitle="La cocina lo recibirá como pedido programado al completar el pago." menu={catalog.restaurantMenu || []} cart={cart} setCart={setCart}/><Extras title="Detalles para tu visita" items={catalog.extrasByService?.MIRADOR || []} selected={extras} setSelected={setExtras}/><Parking catalog={catalog} value={vehicles} setValue={setVehicles} hasExistingParking={hasExistingParking}/><Summary lines={[[`${plan?.name || "Acceso"} · ${people} personas`, base], ["Consumo y detalles", extrasTotal], [`Cochera · ${vehicles.length} vehículo(s)`, parkingTotal]]} total={total}/><button className="flow-sticky" disabled={!slot || people > Number(selectedDay?.slots?.find((item) => item.time === slot)?.remaining || 0)} onClick={next}>Revisar visita al mirador <ChevronRight/></button></FlowPage>;
}

function PoolFlowEnhanced({ service, catalog, hasExistingParking, onBack, onCheckout }) {
  const [days, setDays] = useState([]); const [date, setDate] = useState(today()); const [slot, setSlot] = useState("09:00"); const [adults, setAdults] = useState(1); const [children, setChildren] = useState(0); const [plan, setPlan] = useState(catalog.plans?.PISCINA?.[0]); const [extras, setExtras] = useState([]); const [vehicles, setVehicles] = useState([]);
  useEffect(() => { api(`/public/availability/PISCINA?from=${today()}`).then(setDays); }, []);
  const selectedDay = days.find((item) => item.date === date) || days[0]; const people = plan?.code === "FAMILIAR" ? 4 : adults + children; const adultPrice = Number(catalog.plans?.PISCINA?.find((item) => item.code === "ADULTO")?.price || 0); const childPrice = Number(catalog.plans?.PISCINA?.find((item) => item.code === "NINO")?.price || 0); const base = plan?.code === "FAMILIAR" ? plan.price : adults * adultPrice + children * childPrice; const extrasTotal = extras.reduce((sum, item) => sum + item.price, 0); const parkingTotal = vehicles.reduce((sum, item) => sum + Number(item.price || 0), 0); const total = base + extrasTotal + parkingTotal;
  function next() { onCheckout({ service, planCode: plan.code, planName: plan.name, date, checkIn: date, checkOut: date, slot, people, adults, children, extras, parking: vehicles[0] || null, vehicles, preferences: { access: "Piscina" }, preorderItems: [], nights: 1, base, extrasTotal, parkingTotal, total }); }
  return <FlowPage icon={Waves} eyebrow="PASE DE PISCINA" title="Un día de piscina a tu ritmo" subtitle="Elige hora, personas y comodidades. El control validará tu acceso cuando llegues." onBack={onBack}><Progress current={1}/><DateAvailability days={days} selected={date} onSelect={(value) => { setDate(value); setSlot(""); }}/><section className="flow-card"><h2>Elige tu horario</h2><p>Mostramos los cupos reales para que llegues sin esperas.</p><div className="slot-grid">{(selectedDay?.slots || []).map((item) => <button disabled={!item.available} className={slot === item.time ? "selected" : ""} onClick={() => setSlot(item.time)} key={item.time}><b>{item.time}</b><small>{item.remaining} cupos libres</small></button>)}</div></section><ChoiceSection title="Tu acceso a piscina" subtitle="Escoge el pase que se adapta a tu grupo." options={catalog.plans?.PISCINA || []} selected={plan?.code} onSelect={setPlan}/>{plan?.code !== "FAMILIAR" ? <section className="flow-card"><h2>¿Quiénes vienen?</h2><PeoplePresets people={people} onSelect={(value) => { setAdults(value); setChildren(0); }}/><div className="flow-two"><Counter label={`Adultos · S/ ${adultPrice}`} value={adults} setValue={setAdults}/><Counter label={`Niños · S/ ${childPrice}`} value={children} setValue={setChildren} min={0}/></div></section> : <div className="flow-card family-note"><Users/><div><b>Pase familiar para 4 personas</b><p>Incluye 2 adultos y 2 niños en un solo control de acceso.</p></div></div>}<Extras title="Haz tu día más cómodo" items={catalog.extrasByService?.PISCINA || []} selected={extras} setSelected={setExtras}/><Parking catalog={catalog} value={vehicles} setValue={setVehicles} hasExistingParking={hasExistingParking}/><Summary lines={[[`${plan?.name || "Pase"} · ${people} personas`, base], ["Comodidades", extrasTotal], [`Cochera · ${vehicles.length} vehículo(s)`, parkingTotal]]} total={total}/><button className="flow-sticky" disabled={!slot || people > Number(selectedDay?.slots?.find((item) => item.time === slot)?.remaining || 0)} onClick={next}>Revisar y pagar piscina <ChevronRight/></button></FlowPage>;
}

function LookoutFlowEnhanced({ service, catalog, hasExistingParking, onBack, onCheckout }) {
  const [days, setDays] = useState([]); const [date, setDate] = useState(today()); const [slot, setSlot] = useState("16:30"); const [people, setPeople] = useState(2); const [plan, setPlan] = useState(catalog.plans?.MIRADOR?.[0]); const [extras, setExtras] = useState([]); const [cart, setCart] = useState({}); const [vehicles, setVehicles] = useState([]);
  useEffect(() => { api(`/public/availability/MIRADOR?from=${today()}`).then(setDays); }, []);
  const selectedDay = days.find((item) => item.date === date) || days[0]; const preorderItems = (catalog.restaurantMenu || []).filter((item) => cart[item.id]).map((item) => ({ menuItemId: item.id, name: item.name, quantity: cart[item.id], price: item.price })); const menuTotal = preorderItems.reduce((sum, item) => sum + item.price * item.quantity, 0); const base = Number(plan?.price || 0) * people; const extrasTotal = extras.reduce((sum, item) => sum + item.price, 0) + menuTotal; const parkingTotal = vehicles.reduce((sum, item) => sum + Number(item.price || 0), 0); const total = base + extrasTotal + parkingTotal;
  function next() { onCheckout({ service, planCode: plan.code, planName: plan.name, date, checkIn: date, checkOut: date, slot, people, adults: people, children: 0, extras, parking: vehicles[0] || null, vehicles, preferences: {}, preorderItems, nights: 1, base, extrasTotal, parkingTotal, total }); }
  return <FlowPage icon={SunMedium} eyebrow="RESERVA DE MIRADOR" title="Diseña tu atardecer" subtitle="Reserva tu hora, define tu grupo y añade detalles si quieres una experiencia especial." onBack={onBack}><Progress current={1}/><DateAvailability days={days} selected={date} onSelect={(value) => { setDate(value); setSlot(""); }}/><section className="flow-card"><h2>Elige tu horario</h2><div className="slot-grid">{(selectedDay?.slots || []).map((item) => <button disabled={!item.available} className={slot === item.time ? "selected" : ""} onClick={() => setSlot(item.time)} key={item.time}><b>{item.time}</b><small>{item.remaining} lugares libres</small></button>)}</div><PeoplePresets people={people} onSelect={setPeople}/><Counter label="Personas" value={people} setValue={setPeople}/></section><ChoiceSection title="Tu acceso al mirador" subtitle="Elige la alternativa que mejor acompañe tu visita." options={catalog.plans?.MIRADOR || []} selected={plan?.code} onSelect={setPlan}/><MenuPicker title="Personaliza tu atardecer" subtitle="Puedes añadir platos y bebidas para que el equipo los tenga listos al llegar." menu={catalog.restaurantMenu || []} cart={cart} setCart={setCart}/><Extras title="Detalles para tu momento especial" items={catalog.extrasByService?.MIRADOR || []} selected={extras} setSelected={setExtras}/><Parking catalog={catalog} value={vehicles} setValue={setVehicles} hasExistingParking={hasExistingParking}/><Summary lines={[[`${plan?.name || "Acceso"} · ${people} personas`, base], ["Consumo y detalles", extrasTotal], [`Cochera · ${vehicles.length} vehículo(s)`, parkingTotal]]} total={total}/><button className="flow-sticky" disabled={!slot || people > Number(selectedDay?.slots?.find((item) => item.time === slot)?.remaining || 0)} onClick={next}>Revisar visita al mirador <ChevronRight/></button></FlowPage>;
}

function EventFlowEnhanced({ catalog, hasExistingParking, onBack, onCheckout }) {
  const initialDate = addDays(today(), 7); const [days, setDays] = useState([]); const [form, setForm] = useState({ name: "Mi celebración", type: "CUMPLEAÑOS", date: initialDate, start: "18:00", end: "23:00", guests: 40, spaceId: catalog.eventSpaces?.[0]?.id || 1, notes: "" }); const [layouts, setLayouts] = useState(["BANQUETE"]); const [addons, setAddons] = useState([]); const [theme, setTheme] = useState("Tropical amazónica"); const [menuQty, setMenuQty] = useState({}); const [protein, setProtein] = useState("TODOS"); const [vehicles, setVehicles] = useState([]); const [equipment, setEquipment] = useState([]);
  useEffect(() => { api(`/public/event-availability?from=${initialDate}`).then(setDays); }, []);
  const day = days.find((item) => item.date === form.date); const space = (day?.spaces || catalog.eventSpaces || []).find((item) => Number(item.id) === Number(form.spaceId)) || catalog.eventSpaces?.[0]; const themes = ({ CUMPLEAÑOS: ["Tropical amazónica", "Neón", "Elegante nocturna", "Infantil"], MATRIMONIO: ["Elegante nocturna", "Natural amazónica", "Romántica", "Boho"], EMPRESARIAL: ["Corporativa", "Elegante nocturna", "Natural amazónica"], ANIVERSARIO: ["Romántica", "Elegante nocturna", "Tropical amazónica"] })[form.type] || ["Personalizada", "Natural amazónica", "Tropical amazónica"];
  const allMenu = catalog.restaurantMenu || []; const food = allMenu.filter((item) => item.area !== "BARTENDER"); const drinks = allMenu.filter((item) => item.area === "BARTENDER"); const visibleFood = protein === "TODOS" ? food : food.filter((item) => `${item.name} ${item.description} ${(item.ingredients || []).map((entry) => entry.name).join(" ")}`.toUpperCase().includes(protein)); const catering = allMenu.filter((item) => menuQty[item.id]).map((item) => ({ menuItemId: item.id, name: item.name, quantity: Number(menuQty[item.id]), price: item.price })); const menuTotal = catering.reduce((sum, item) => sum + item.price * item.quantity, 0); const equipmentTotal = equipment.reduce((sum, item) => sum + item.price, 0); const parkingTotal = vehicles.reduce((sum, item) => sum + Number(item.price || 0), 0); const addonTotal = addons.length * 120; const estimatedTotal = Number(space?.basePrice || 0) + menuTotal + equipmentTotal + parkingTotal + addonTotal;
  const toggle = (value, setValue) => setValue((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  function submit() { onCheckout({ ...form, spaceId: Number(form.spaceId), guests: Number(form.guests), startsAt: `${form.date}T${form.start}:00`, endsAt: `${form.date}T${form.end}:00`, layout: layouts[0] || "BANQUETE", layouts, addons, theme, catering, equipment, vehicles, parkingCount: vehicles.filter((item) => item.type !== "MOTO").length, estimatedTotal, payMode: "HALF", paymentMethod: "YAPE" }); }
  return <FlowPage icon={Sparkles} eyebrow="EVENTO PRIVADO" title="Crea tu celebración" subtitle="Construye una propuesta a tu medida. Al final reservarás la fecha con el adelanto requerido." onBack={onBack}><Progress current={1}/><section className="flow-card event-calendar"><div className="flow-heading"><div><h2>Elige una fecha disponible</h2><p>Desliza para volver a días anteriores o avanzar. Los ambientes ocupados se indican en gris.</p></div></div><div className="event-date-grid">{days.map((item) => { const free = (item.spaces || []).filter((space) => space.available).length; return <button type="button" className={form.date === item.date ? "selected" : ""} disabled={!item.available} onClick={() => setForm({ ...form, date: item.date })} key={item.date}><small>{new Date(`${item.date}T12:00:00`).toLocaleDateString("es-PE", { weekday: "short" })}</small><b>{item.date.slice(-2)}</b><span>{item.available ? `${free} ambientes` : "Ocupado"}</span></button>; })}</div></section><section className="flow-card"><h2>Tu celebración</h2><div className="flow-two"><Field label="Nombre del evento" value={form.name} onChange={(name) => setForm({ ...form, name })}/><Field label="Tipo de celebración" type="select" value={form.type} onChange={(type) => { setForm({ ...form, type }); setTheme((({ CUMPLEAÑOS: "Tropical amazónica", MATRIMONIO: "Romántica", EMPRESARIAL: "Corporativa" })[type] || "Personalizada")); }} options={["CUMPLEAÑOS", "MATRIMONIO", "EMPRESARIAL", "ANIVERSARIO", "OTRO"]}/></div><div className="flow-three"><Field label="Fecha" type="date" value={form.date} min={addDays(today(), 1)} onChange={(date) => setForm({ ...form, date })}/><Field label="Inicio" type="time" value={form.start} onChange={(start) => setForm({ ...form, start })}/><Field label="Fin" type="time" value={form.end} onChange={(end) => setForm({ ...form, end })}/></div><Counter label="Invitados estimados" value={form.guests} setValue={(guests) => setForm({ ...form, guests })}/></section><section className="flow-card"><h2>Ambiente principal</h2><p>Terraza, Mirador y Salón son ambientes del hotel; no se cobran como servicios independientes.</p><div className="space-grid">{(day?.spaces || catalog.eventSpaces || []).map((item) => <button type="button" disabled={!item.available || form.guests > item.capacity} className={Number(form.spaceId) === Number(item.id) ? "selected" : ""} onClick={() => setForm({ ...form, spaceId: item.id })} key={item.id}><small>{item.available ? `HASTA ${item.capacity} PERSONAS` : "OCUPADO"}</small><h3>{item.name}</h3><p>{item.description}</p><span>{item.amenities?.join(" · ")}</span><strong>Base S/ {item.basePrice}</strong></button>)}</div></section><section className="flow-card"><h2>Espacios complementarios</h2><p>Si deseas, agrega Piscina o Mirador para tus invitados.</p><div className="choice-row">{["PISCINA", "MIRADOR"].map((item) => <button type="button" className={addons.includes(item) ? "selected" : ""} onClick={() => toggle(item, setAddons)} key={item}>{item === "PISCINA" ? "Acceso a piscina" : "Acceso al mirador"}<small>Complemento del evento</small></button>)}</div></section><section className="flow-card"><h2>Distribución del ambiente</h2><p>Puedes seleccionar más de una configuración para que el equipo prepare el montaje.</p><div className="choice-row">{(catalog.eventLayouts || []).map((item) => <button type="button" className={layouts.includes(item.code) ? "selected" : ""} onClick={() => toggle(item.code, setLayouts)} key={item.code}>{item.name || item.code}</button>)}</div></section><section className="flow-card"><h2>Temática sugerida</h2><p>La propuesta se adapta al tipo de celebración; podrás dejar indicaciones específicas al final.</p><div className="choice-row">{themes.map((item) => <button type="button" className={theme === item ? "selected" : ""} onClick={() => setTheme(item)} key={item}>{item}</button>)}</div></section><EventMenuPicker title="Platillos" subtitle="Filtra por insumo principal y abre cada plato para revisar su detalle." menu={visibleFood} cart={menuQty} setCart={setMenuQty} filter={protein} setFilter={setProtein}/><EventMenuPicker title="Bebidas" subtitle="Selecciona bebidas del bar para tu celebración." menu={drinks} cart={menuQty} setCart={setMenuQty}/><Extras title="Equipo de sonido y producción" items={catalog.eventEquipment || []} selected={equipment} setSelected={setEquipment}/><Parking catalog={catalog} value={vehicles} setValue={setVehicles} hasExistingParking={hasExistingParking}/><section className="flow-card"><h2>Indicaciones para el equipo</h2><p>Cuéntanos alergias, restricciones, momento de ingreso, decoración o cualquier detalle que deba preparar el personal.</p><Field label="Detalles de tu celebración" value={form.notes} onChange={(notes) => setForm({ ...form, notes })}/></section><Summary estimate lines={[[`Ambiente ${space?.name || "por definir"}`, Number(space?.basePrice || 0)], ["Platillos y bebidas", menuTotal], ["Equipo y producción", equipmentTotal], ["Complementos", addonTotal], ["Cochera", parkingTotal]]} total={estimatedTotal}/><button className="flow-sticky" disabled={!space || space.available === false || form.guests > Number(space?.capacity || 0)} onClick={submit}>Continuar a pago <ChevronRight/></button></FlowPage>;
}

function EventMenuPicker({ title, subtitle, menu, cart, setCart, filter, setFilter }) { const [detail, setDetail] = useState(null); const proteins = ["TODOS", "POLLO", "CHANCHO", "PESCADO"]; return <section className="flow-card"><h2>{title}</h2><p>{subtitle}</p>{setFilter ? <div className="room-filter">{proteins.map((item) => <button type="button" className={filter === item ? "selected" : ""} onClick={() => setFilter(item)} key={item}>{item === "TODOS" ? "Todos" : item}</button>)}</div> : null}<div className="dish-grid">{menu.map((item) => <article className="event-dish" key={item.id}><img className="event-menu-image" src={item.image || "/images/menu/ceviche.webp"} alt={item.name}/><div className="event-dish-copy"><h3>{item.name}</h3><p>{item.description}</p><button type="button" className="event-detail-button" onClick={() => setDetail(detail === item.id ? null : item.id)}>{detail === item.id ? "Ocultar detalle" : "Ver detalle"}</button>{detail === item.id ? <small className="event-detail">{(item.ingredients || []).map((entry) => entry.name).join(" · ") || "Consulta disponibilidad y preparación con el equipo."}</small> : null}<b>S/ {item.price}</b></div><div className="mini-counter"><button type="button" onClick={() => setCart({ ...cart, [item.id]: Math.max(0, Number(cart[item.id] || 0) - 1) })}><Minus/></button><strong>{cart[item.id] || 0}</strong><button type="button" onClick={() => setCart({ ...cart, [item.id]: Number(cart[item.id] || 0) + 1 })}><Plus/></button></div></article>)}</div></section>; }

function EventFlow({ catalog, onBack, onCheckout }) {
  const initialDate=addDays(today(),7); const [days,setDays]=useState([]); const [form,setForm]=useState({name:"Mi celebración",type:"CUMPLEAÑOS",date:initialDate,start:"18:00",end:"23:00",guests:40,spaceId:catalog.eventSpaces?.[0]?.id||1,layout:"BANQUETE",theme:"Natural amazónica",notes:""}); const [menuQty,setMenuQty]=useState({}); const [equipment,setEquipment]=useState([]); const [parkingCount,setParkingCount]=useState(0); const [paymentMethod,setPaymentMethod]=useState("YAPE"); const [payMode,setPayMode]=useState("HALF"); const [busy,setBusy]=useState(false); const [error,setError]=useState("");
  useEffect(()=>{api(`/public/event-availability?from=${form.date}`).then(setDays).catch((cause)=>setError(cause.message));},[form.date]);
  const day=days.find((item)=>item.date===form.date); const space=(day?.spaces||catalog.eventSpaces||[]).find((item)=>item.id===Number(form.spaceId))||catalog.eventSpaces?.[0]; const catering=(catalog.restaurantMenu||[]).filter((item)=>menuQty[item.id]).map((item)=>({menuItemId:item.id,name:item.name,quantity:Number(menuQty[item.id]),price:item.price})); const menuTotal=catering.reduce((sum,item)=>sum+item.price*item.quantity,0); const equipmentTotal=equipment.reduce((sum,item)=>sum+item.price,0); const estimatedTotal=Number(space?.basePrice||0)+menuTotal+equipmentTotal+parkingCount*15; const due=paymentMethod==="CAJA HOTEL"?0:estimatedTotal/2;
  function submit(){onCheckout({...form,spaceId:Number(form.spaceId),guests:Number(form.guests),startsAt:`${form.date}T${form.start}:00`,endsAt:`${form.date}T${form.end}:00`,catering,equipment,parkingCount,estimatedTotal,payMode:"HALF",paymentMethod});}
  return <FlowPage icon={Sparkles} eyebrow="EVENTO PRIVADO" title="Diseña una experiencia a tu medida" subtitle="Elige una fecha libre y personaliza ambiente, montaje, comida, bebidas y cochera." onBack={onBack}><Progress current={1}/><EventAvailability days={days} selected={form.date} onSelect={(date)=>setForm({...form,date})}/><section className="flow-card"><h2>Tu celebración</h2><div className="flow-two"><Field label="Nombre del evento" value={form.name} onChange={(name)=>setForm({...form,name})}/><Field label="Tipo" type="select" value={form.type} onChange={(type)=>setForm({...form,type})} options={["CUMPLEAÑOS","MATRIMONIO","EMPRESARIAL","ANIVERSARIO","GRADUACIÓN","REUNIÓN PRIVADA","OTRO"]}/></div><div className="flow-three"><Field label="Fecha" type="date" min={addDays(today(),1)} value={form.date} onChange={(date)=>setForm({...form,date})}/><Field label="Inicio" type="time" value={form.start} onChange={(start)=>setForm({...form,start})}/><Field label="Fin" type="time" value={form.end} onChange={(end)=>setForm({...form,end})}/></div><Counter label="Invitados estimados" value={form.guests} setValue={(guests)=>setForm({...form,guests})}/></section><section className="flow-card"><h2>Ambientes libres para esa fecha</h2><div className="space-grid">{(day?.spaces||catalog.eventSpaces||[]).map((item)=><button type="button" disabled={!item.available||form.guests>item.capacity} className={Number(form.spaceId)===item.id?"selected":""} onClick={()=>setForm({...form,spaceId:item.id})} key={item.id}><small>{item.available?`HASTA ${item.capacity} PERSONAS`:"OCUPADO"}</small><h3>{item.name}</h3><p>{item.description}</p><span>{item.amenities?.join(" · ")}</span><strong>{item.available?`Base S/ ${item.basePrice}`:"Elige otra fecha"}</strong></button>)}</div></section><ChoiceSection title="Distribución del ambiente" options={catalog.eventLayouts||[]} selected={form.layout} onSelect={(item)=>setForm({...form,layout:item.code})}/><section className="flow-card"><h2>Temática y estilo</h2><div className="choice-row">{["Natural amazónica","Elegante nocturna","Tropical","Infantil","Corporativa","Personalizada"].map((item)=><button type="button" className={form.theme===item?"selected":""} onClick={()=>setForm({...form,theme:item})} key={item}>{item}</button>)}</div></section><MenuPicker title="Platos y bebidas" subtitle="Indica cantidades. El sistema contrasta porciones e inventario con el número de invitados." menu={catalog.restaurantMenu||[]} cart={menuQty} setCart={setMenuQty}/><Extras title="Equipamiento y producción" items={catalog.eventEquipment||[]} selected={equipment} setSelected={setEquipment}/><section className="flow-card"><h2>Cochera para invitados</h2><p>Indica una cantidad preliminar; Recepción asignará los espacios y placas.</p><Counter label="Espacios solicitados · S/ 15" value={parkingCount} setValue={setParkingCount} min={0}/></section><section className="flow-card"><Field label="Indicaciones, restricciones alimentarias o detalles especiales" value={form.notes} onChange={(notes)=>setForm({...form,notes})}/></section><Summary lines={[[`Alquiler ${space?.name||"ambiente"}`,Number(space?.basePrice||0)],[`Alimentos · ${catering.reduce((sum,item)=>sum+item.quantity,0)} porciones`,menuTotal],["Equipamiento",equipmentTotal],[`Cochera · ${parkingCount} espacios`,parkingCount*15]]} total={estimatedTotal}/><section className="flow-card event-payment"><h2>Reserva la fecha</h2><div className="choice-row"><button type="button" className={payMode==="HALF"?"selected":""} onClick={()=>setPayMode("HALF")}><b>Adelanto 50%</b><small>S/ {(estimatedTotal/2).toFixed(2)}</small></button><button type="button" className={payMode==="FULL"?"selected":""} onClick={()=>setPayMode("FULL")}><b>Pago completo</b><small>S/ {estimatedTotal.toFixed(2)}</small></button></div><div className="event-methods">{[["YAPE","Yape"],["PLIN","Plin"],["TRANSFERENCIA","Transferencia"],["CAJA HOTEL","Efectivo en Recepción"]].map(([id,label])=><button type="button" className={paymentMethod===id?"selected":""} onClick={()=>setPaymentMethod(id)} key={id}>{label}</button>)}</div><p>{paymentMethod==="CAJA HOTEL"?"La fecha no quedará bloqueada hasta que Recepción valide el 50% en efectivo.":payMode==="FULL"?"El QR quedará listo para validación el día del evento.":"El adelanto bloquea la fecha. El QR seguirá pendiente hasta completar el saldo."}</p></section>{error?<p className="flow-error">{error}</p>:null}<button className="flow-sticky" disabled={busy||!space||space.available===false||form.guests>Number(space?.capacity||0)} onClick={submit}>{busy?"Registrando evento…":paymentMethod==="CAJA HOTEL"?"Solicitar pago en Recepción":`Pagar S/ ${due.toFixed(2)} y reservar`}<ChevronRight/></button></FlowPage>;
}

function FlowPage({ icon: Icon, eyebrow, title, subtitle, onBack, children }) { return <main className="experience-shell"><header className="experience-hero"><button className="flow-back" onClick={onBack}><ArrowLeft/></button><span className="flow-icon"><Icon/></span><small>{eyebrow}</small><h1>{title}</h1><p>{subtitle}</p></header><div className="experience-content">{children}</div></main>; }
function Progress({ current }) { return <div className="flow-progress">{["Configura", "Revisa", "Confirma"].map((item, index) => <span className={index + 1 <= current ? "active" : ""} key={item}><i>{index + 1}</i>{item}</span>)}</div>; }
function PeoplePresets({ people, onSelect }) {
  const options = [{ label: "Solo", value: 1 }, { label: "Pareja", value: 2 }, { label: "Familia", value: 4 }, { label: "Grupo", value: 6 }];
  return <div className="party-selector"><div className="party-selector-head"><div><b>¿Quiénes vienen?</b><span>El QR controla la cantidad exacta reservada.</span></div><strong><Users/> {people} {people === 1 ? "persona" : "personas"}</strong></div><div className="party-presets">{options.map((option) => <button type="button" className={people === option.value ? "selected" : ""} onClick={() => onSelect(option.value)} key={option.label}><b>{option.label}</b><small>{option.value} {option.value === 1 ? "persona" : "personas"}</small></button>)}</div></div>;
}

function DateAvailability({ days, selected, onSelect }) { 
  const pickerRef = useRef(null);
  const stripRef = useRef(null);
  const goBack = () => { const previous = addDays(selected, -1); if (previous >= today()) onSelect(previous); };
  const goForward = () => onSelect(addDays(selected, 1));
  useEffect(() => { stripRef.current?.querySelector(`[data-date="${selected}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" }); }, [selected]);
  return (
    <section className="flow-card">
      <div className="flow-heading">
        <div>
          <h2>Calendario disponible</h2>
          <p>Los cupos se actualizan con las reservas del sistema.</p>
        </div>
        <div className="calendar-actions"><button type="button" onClick={goBack} disabled={selected <= today()} aria-label="Ver día anterior">‹</button><button type="button" onClick={goForward} aria-label="Ver día siguiente">›</button><button type="button" onClick={() => pickerRef.current?.showPicker?.()} aria-label="Elegir fecha en calendario"><CalendarDays/></button><input ref={pickerRef} type="date" value={selected} min={today()} onChange={e => e.target.value && onSelect(e.target.value)}/></div>
      </div>
      <div className="date-strip" ref={stripRef} aria-label="Fechas disponibles. Desliza hacia los lados para ver más días.">
        {days.slice(0, 14).map((day) => (
          <button data-date={day.date} disabled={!day.available} className={selected === day.date ? "selected" : ""} onClick={() => onSelect(day.date)} key={day.date}>
            <small>{new Date(`${day.date}T12:00:00`).toLocaleDateString("es-PE", { weekday: "short" })}</small>
            <b>{day.date.slice(-2)}</b>
            <span>{day.available ? `${day.remaining} libres` : "Completo"}</span>
          </button>
        ))}
      </div>
    </section>
  ); 
}

function EventAvailability({ days, selected, onSelect }) {
  const pickerRef = useRef(null);
  return (
    <section className="flow-card event-calendar">
      <div className="flow-heading">
        <div><h2>Calendario de eventos</h2><p>Azul significa que queda al menos un ambiente; gris indica fecha ocupada.</p></div>
        <div className="calendar-actions"><button type="button" onClick={() => pickerRef.current?.showPicker?.()} aria-label="Abrir calendario de eventos"><CalendarDays/></button><input ref={pickerRef} type="date" value={selected} min={addDays(today(), 1)} onChange={(event) => event.target.value && onSelect(event.target.value)}/></div>
      </div>
      <div className="event-date-grid">
        {days.slice(0, 21).map((day) => { const free = (day.spaces || []).filter((space) => space.available).length; return <button type="button" disabled={!day.available} className={selected === day.date ? "selected" : ""} onClick={() => onSelect(day.date)} key={day.date}><small>{new Date(`${day.date}T12:00:00`).toLocaleDateString("es-PE", { weekday: "short" })}</small><b>{day.date.slice(-2)}</b><span>{day.available ? `${free} ambiente${free === 1 ? "" : "s"}` : "Ocupado"}</span></button>; })}
      </div>
    </section>
  );
}

function ChoiceSection({ title, subtitle = "Elige el plan que mejor se adapte a ti.", options, selected, onSelect }) { 
  return (
    <section className="flow-card">
      <div className="flow-heading">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </div>
      <div className="plan-grid">
        {options.map((item) => (
          <button className={selected === item.code ? "selected" : ""} onClick={() => onSelect(item)} key={item.code}>
            <small>BENEFICIO · {item.code}</small>
            <h3>{item.name}</h3>
            <p>{item.description || "Opción disponible para esta experiencia"}</p>
            <span className="plan-inclusion">Incluido en tu reserva</span>
            {item.price != null ? <strong>S/ {item.price}</strong> : null}
          </button>
        ))}
      </div>
    </section>
  ); 
}

function Extras({ title, items, selected, setSelected }) { return <section className="flow-card"><h2>{title}</h2>{items.map((item) => { const active = selected.some((entry) => entry.id === item.id); return <label className="flow-check" key={item.id}><span><b>{item.name}</b><small>+ S/ {item.price}</small></span><input type="checkbox" checked={active} onChange={() => setSelected(active ? selected.filter((entry) => entry.id !== item.id) : [...selected, item])}/></label>; })}</section>; }
function MenuPicker({ title, subtitle, menu, cart, setCart }) { return <section className="flow-card"><h2>{title}</h2><p>{subtitle}</p><div className="dish-grid">{menu.map((item) => <article key={item.id}><div><h3>{item.name}</h3><p>{item.description}</p><b>S/ {item.price} · {item.prepMinutes} min</b></div><div className="mini-counter"><button onClick={() => setCart({ ...cart, [item.id]: Math.max(0, Number(cart[item.id] || 0) - 1) })}><Minus/></button><strong>{cart[item.id] || 0}</strong><button onClick={() => setCart({ ...cart, [item.id]: Number(cart[item.id] || 0) + 1 })}><Plus/></button></div></article>)}</div></section>; }
function LegacyParking({ catalog, value = [], setValue, hasExistingParking = false }) {
  const [open, setOpen] = useState(Boolean(value.length));
  const prices = { MOTO: Number(catalog.parking?.motorcyclePrice || 0), AUTO: Number(catalog.parking?.carPrice || 15), CAMIONETA: Number(catalog.parking?.truckPrice || 20), MINIVAN: Number(catalog.parking?.vanPrice || 25) };
  const spaces = catalog.parking?.spaces || [];
  const occupiedSpaces = catalog.parking?.occupiedSpaces || [];
  const assigned = value.map((item) => Number(item.spaceId)).filter(Boolean);
  const add = (type) => { if (type !== "MOTO" && value.filter((item) => item.type !== "MOTO").length >= spaces.length) return; const firstSpace = spaces.find((space) => !assigned.includes(Number(space.id))); setValue([...value, { id: `${Date.now()}-${value.length}`, type, price: prices[type], plate: "", spaceId: type === "MOTO" ? null : firstSpace?.id || null }]); };
  const update = (index, patch) => setValue(value.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  if (hasExistingParking) return <section className="flow-card parking-builder"><div className="parking-empty"><b>Cochera ya registrada</b><br/>Tu cuenta ya tiene vehículos asociados a una reserva. Esta nueva experiencia no duplicará espacios ni placas.</div></section>;
  return <section className="flow-card parking-builder"><button type="button" className="parking-question" onClick={() => { setOpen(!open); if (open) setValue([]); }}><span><Car/><span><b>¿Llegarás con vehículo?</b><small>{spaces.length} espacios para vehículos mayores disponibles</small></span></span><strong>{open ? "Ocultar" : "Agregar cochera"}</strong></button>{open ? <div className="parking-expanded"><p>Las motos no pagan. Para cada vehículo mayor elige un espacio libre y registra su placa.</p><div className="parking-map"><b>Disponibilidad en tiempo real</b><span>Libres: {spaces.length ? spaces.map((space) => space.code).join(" · ") : "Sin espacios"}</span>{occupiedSpaces.length ? <small>Ocupados: {occupiedSpaces.join(" · ")}</small> : <small>Sin espacios ocupados en este momento.</small>}</div><div className="vehicle-types">{[["MOTO","Moto · gratis"],["AUTO",`Auto · S/ ${prices.AUTO}`],["CAMIONETA",`Camioneta · S/ ${prices.CAMIONETA}`],["MINIVAN",`Miniván · S/ ${prices.MINIVAN}`]].map(([type,label])=><button type="button" onClick={()=>add(type)} key={type}><Plus/>{label}</button>)}</div>{value.length ? <div className="vehicle-list">{value.map((vehicle,index)=><div key={vehicle.id}><span><Car/><b>{vehicle.type}</b><small>{vehicle.price ? `S/ ${vehicle.price}` : "Cortesía"}</small></span><input aria-label={`Placa del vehículo ${index+1}`} placeholder="Placa" value={vehicle.plate} onChange={(event)=>update(index,{plate:event.target.value.toUpperCase()})}/>{vehicle.type !== "MOTO" ? <select aria-label={`Espacio de cochera para vehículo ${index+1}`} value={vehicle.spaceId || ""} onChange={(event)=>update(index,{spaceId:Number(event.target.value)})}><option value="">Elige espacio</option>{spaces.filter((space)=>Number(space.id)===Number(vehicle.spaceId)||!assigned.includes(Number(space.id))).map((space)=><option key={space.id} value={space.id}>{space.code}</option>)}</select> : null}<button type="button" aria-label={`Quitar vehículo ${index+1}`} onClick={()=>setValue(value.filter((_,itemIndex)=>itemIndex!==index))}>×</button></div>)}</div> : <div className="parking-empty">No agregaste vehículos. Puedes continuar sin cochera.</div>}</div> : null}</section>;
}
function Parking({ catalog, value = [], setValue, hasExistingParking = false }) {
  const [open, setOpen] = useState(Boolean(value.length));
  const [vehicleType, setVehicleType] = useState("AUTO");
  const spaces = catalog.parking?.spaces || [];
  const occupied = catalog.parking?.occupiedSpaces || [];
  const prices = { MOTO: Number(catalog.parking?.motorcyclePrice || 0), AUTO: Number(catalog.parking?.carPrice || 15), CAMIONETA: Number(catalog.parking?.truckPrice || 20), MINIVAN: Number(catalog.parking?.vanPrice || 25) };
  const selected = (spaceId) => value.find((item) => Number(item.spaceId) === Number(spaceId));
  const toggleSpace = (space) => { const current = selected(space.id); if (current) { setValue(value.filter((item) => item !== current)); return; } setValue([...value, { id: `space-${space.id}`, type: vehicleType, price: prices[vehicleType], plate: "", spaceId: space.id }]); };
  const addMoto = () => setValue([...value, { id: `moto-${Date.now()}`, type: "MOTO", price: 0, plate: "", spaceId: null }]);
  const update = (id, patch) => setValue(value.map((item) => item.id === id ? { ...item, ...patch } : item));
  if (hasExistingParking) return <section className="flow-card parking-builder"><div className="parking-empty"><b>Cochera ya registrada</b><br/>Tus vehículos ya están asociados a esta cuenta. No volveremos a duplicar espacios ni placas.</div></section>;
  return <section className="flow-card parking-builder"><button type="button" className="parking-question" onClick={() => setOpen(!open)}><span><Car/><span><b>¿Llegarás con vehículo?</b><small>{spaces.length} espacios disponibles para vehículos mayores</small></span></span><strong>{open ? "Ocultar" : "Ver espacios"}</strong></button>{open ? <div className="parking-expanded"><p>Selecciona los espacios libres que necesitas. Por cada espacio se solicitará una placa.</p><div className="vehicle-types">{[["AUTO",`Auto · S/ ${prices.AUTO}`],["CAMIONETA",`Camioneta · S/ ${prices.CAMIONETA}`],["MINIVAN",`Miniván · S/ ${prices.MINIVAN}`]].map(([type,label])=><button type="button" className={vehicleType===type?"selected":""} onClick={()=>setVehicleType(type)} key={type}>{label}</button>)}<button type="button" onClick={addMoto}>+ Moto · gratis</button></div><div className="parking-space-grid">{spaces.map((space)=><button type="button" className={selected(space.id)?"selected":""} onClick={()=>toggleSpace(space)} key={space.id}><b>{space.code}</b><small>{selected(space.id)?"Seleccionado":"Libre"}</small></button>)}{occupied.map((code)=><span className="occupied-space" key={code}><b>{code}</b><small>Ocupado</small></span>)}</div>{value.length ? <div className="vehicle-list">{value.map((vehicle,index)=><div key={vehicle.id}><span><Car/><b>{vehicle.type}{vehicle.spaceId ? ` · ${spaces.find((space)=>Number(space.id)===Number(vehicle.spaceId))?.code||""}` : ""}</b><small>{vehicle.price ? `S/ ${vehicle.price}` : "Cortesía"}</small></span><input aria-label={`Placa del vehículo ${index+1}`} placeholder="Placa obligatoria" value={vehicle.plate} onChange={(event)=>update(vehicle.id,{plate:event.target.value.toUpperCase()})}/><button type="button" aria-label={`Quitar vehículo ${index+1}`} onClick={()=>setValue(value.filter((item)=>item.id!==vehicle.id))}>×</button></div>)}</div> : <div className="parking-empty">Aún no seleccionaste espacios. Puedes continuar sin cochera.</div>}</div> : null}</section>;
}

function GuestsEditor({ adults, children, value, onChange }) {
  const companionCount=Math.max(0,Number(adults)-1)+Number(children);
  if (!companionCount) return null;
  const update=(index,field,next)=>{const copy=Array.from({length:companionCount},(_,itemIndex)=>value[itemIndex]||{name:"",documentNumber:"",kind:itemIndex<Math.max(0,Number(adults)-1)?"ADULTO":"NIÑO"});copy[index]={...copy[index], [field]:next};onChange(copy);};
  return <div className="guest-editor"><div><UserPlus/><span><b>Acompañantes</b><small>Puedes completar los documentos ahora o presentarlos en Recepción.</small></span></div>{Array.from({length:companionCount},(_,index)=>{const adultIndex=Math.max(0,Number(adults)-1);const guest=value[index]||{name:"",documentNumber:"",kind:index<adultIndex?"ADULTO":"NIÑO"};return <section key={index}><strong>{index<adultIndex?`Adulto ${index+2}`:`Niño ${index-adultIndex+1}`}</strong><input placeholder="Nombre y apellido" value={guest.name||""} onChange={(event)=>update(index,"name",event.target.value)}/><input placeholder="Documento opcional" value={guest.documentNumber||""} onChange={(event)=>update(index,"documentNumber",event.target.value)}/></section>})}</div>;
}
function normalizedGuests(value, adults, children) { const companionCount=Math.max(0,Number(adults)-1)+Number(children); const adultCount=Math.max(0,Number(adults)-1); return Array.from({length:companionCount},(_,index)=>({ ...(value[index]||{}), kind:index<adultCount?"ADULTO":"NIÑO" })); }
function Summary({ lines, total, estimate }) { return <section className="flow-summary"><h2>{estimate ? "Estimación en vivo" : "Resumen en vivo"}</h2>{lines.map(([label, value]) => <div key={label}><span>{label}</span><b>S/ {Number(value || 0).toFixed(2)}</b></div>)}<div className="flow-total"><span>{estimate ? "Estimado" : "Total"}</span><b>S/ {Number(total || 0).toFixed(2)}</b></div></section>; }
function Counter({ label, value, setValue, min = 1 }) {
  const offersProfiles = label === "Personas en la mesa" || label === "Número de personas";
  return <div className="counter-block">{offersProfiles ? <PeoplePresets people={Number(value)} onSelect={setValue}/> : null}<div className="flow-counter"><span>{label}</span><div><button type="button" aria-label={`Quitar ${label}`} onClick={() => setValue(Math.max(min, Number(value) - 1))}><Minus/></button><b>{value}</b><button type="button" aria-label={`Agregar ${label}`} onClick={() => setValue(Number(value) + 1)}><Plus/></button></div></div></div>;
}
function Field({ label, value, onChange, type = "text", min, options = [] }) { return <label className="flow-field"><span>{label}</span>{type === "select" ? <select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((item) => <option key={item}>{item}</option>)}</select> : <input required type={type} min={min} value={value} onChange={(event) => onChange(event.target.value)}/>}</label>; }
function today() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
function addDays(value, amount) { return new Date(new Date(`${value}T12:00:00`).getTime() + amount * 86400000).toISOString().slice(0, 10); }
function daysBetween(start, end) { return Math.ceil((new Date(`${end}T12:00:00`) - new Date(`${start}T12:00:00`)) / 86400000); }
async function api(path, options = {}) { const headers = { "Content-Type": "application/json" }; if (options.authenticated) headers.Authorization = `Bearer ${localStorage.getItem("pp_customer_token")}`; const response = await fetch(`${apiBaseUrl}${path}`, { method: options.method || "GET", headers, body: options.body ? JSON.stringify(options.body) : undefined }); const data = await response.json().catch(() => null); if (!response.ok) throw new Error(data?.message || "No se pudo completar la operación"); return data; }
