import { useEffect, useState } from "react";

/** Hora y fecha de Lima que avanzan solas; se usa en el ingreso del personal y en el reloj de asistencia. */
export function LimaClock({ withSeconds = false }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const time = new Intl.DateTimeFormat("es-PE", { hour: "2-digit", minute: "2-digit", ...(withSeconds ? { second: "2-digit" } : {}), hour12: false, timeZone: "America/Lima" }).format(now);
  const day = new Intl.DateTimeFormat("es-PE", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Lima" }).format(now);
  return <time dateTime={now.toISOString()}><b>{time}</b>{day}</time>;
}
