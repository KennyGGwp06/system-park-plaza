const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function hotelDateKey(value) { return String(value || "").slice(0, 10); }

export function currentHotelDateKey() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function formatHotelDate(value, fallback = "Sin fecha") {
  const key = hotelDateKey(value);
  if (!key) return fallback;
  const [year, month, day] = key.split("-").map(Number);
  if (![year, month, day].every(Number.isFinite)) return fallback;
  return new Date(year, month - 1, day, 12).toLocaleDateString("es-PE");
}

export function formatHotelTime(value, dateOnlyTime = "03:00 p. m.") {
  if (!value) return "Sin hora";
  if (DATE_ONLY.test(String(value))) return dateOnlyTime;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Sin hora" : parsed.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
}

export function isHotelToday(value) { return hotelDateKey(value) === currentHotelDateKey(); }
