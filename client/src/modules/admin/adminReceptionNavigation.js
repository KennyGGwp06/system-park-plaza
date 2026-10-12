import {
  Banknote, CalendarRange, CarFront, ContactRound, DoorOpen, Gauge, LayoutDashboard, LayoutGrid,
  PartyPopper, QrCode, ReceiptText, RotateCcw, SprayCan, Users, Wallet, Wrench
} from "lucide-react";

const view = (label, href, icon, badge) => [label, href, icon, badge];

// Espacio de trabajo del Admin de recepción (revisado 2026-09-26): 16 módulos sin duplicados.
// Un recepcionista con poderes: atiende llegadas y salidas, vende y cobra, verifica pagos, emite comprobantes,
// pide devoluciones, controla accesos, coordina Limpieza y Mantenimiento, y rinde su caja al dueño.
// `badge` enlaza el contador en vivo de /api/reception/desk.
export const ADMIN_RECEPTION_MODULES = [
  {
    label: "Operación del día",
    icon: LayoutDashboard,
    items: [
      view("Tablero del turno", "/admin-panel", LayoutDashboard),
      view("Llegadas y salidas", "/admin-panel/movimientos", DoorOpen, "movements"),
      view("Habitaciones", "/admin-panel/habitaciones", LayoutGrid)
    ]
  },
  {
    label: "Reservas",
    icon: CalendarRange,
    items: [
      view("Agenda de reservas", "/admin-panel/reservas", CalendarRange),
      view("Eventos", "/eventos/reservas", PartyPopper),
      view("Clientes", "/clientes", ContactRound)
    ]
  },
  {
    label: "Accesos",
    icon: QrCode,
    items: [
      view("Control de accesos", "/admin-panel/accesos", QrCode),
      view("Aforo en vivo", "/admin-panel/aforo", Gauge),
      view("Cochera", "/admin-panel/cochera", CarFront)
    ]
  },
  {
    label: "Caja",
    icon: Wallet,
    items: [
      view("Cobros pendientes", "/admin-panel/cobros", Wallet, "verifications"),
      view("Pagos y comprobantes", "/admin-panel/pagos", ReceiptText),
      view("Mi caja y cierre", "/admin-panel/mi-caja", Banknote),
      view("Devoluciones", "/admin-panel/devoluciones", RotateCcw)
    ]
  },
  {
    label: "Coordinación",
    icon: Users,
    items: [
      view("Personal en turno", "/admin-panel/personal-en-turno", Users),
      view("Limpieza", "/admin/limpieza/resumen", SprayCan),
      view("Mantenimiento", "/incidencias", Wrench)
    ]
  }
];

// Rutas que ya no están en el menú: llevan al módulo que las reemplaza (así ningún enlace se rompe).
export const RECEPTION_LEGACY_REDIRECTS = {
  "/checkin": "/admin-panel/movimientos?vista=llegadas",
  "/checkout": "/admin-panel/movimientos?vista=salidas",
  "/recepcion": "/admin-panel",
  "/hotel": "/admin-panel/habitaciones",
  "/hotel/habitaciones": "/admin-panel/habitaciones",
  "/habitaciones": "/admin-panel/habitaciones",
  "/hotel/movimientos": "/admin-panel/movimientos",
  "/hotel/reservas": "/admin-panel/reservas?servicio=HOSPEDAJE",
  "/reservas": "/admin-panel/reservas?servicio=HOSPEDAJE",
  "/eventos/mirador": "/admin-panel/reservas?servicio=MIRADOR",
  "/eventos/terraza": "/admin-panel/reservas?servicio=TERRAZA",
  "/eventos/calendario": "/eventos/reservas",
  "/accesos": "/admin-panel/accesos",
  "/piscina/ingresos": "/admin-panel/accesos?vista=piscina",
  "/piscina/validar-qr": "/admin-panel/accesos",
  "/piscina/clientes-activos": "/admin-panel/accesos?vista=piscina",
  "/piscina/reportes": "/admin-panel/accesos?vista=piscina",
  "/cochera": "/admin-panel/cochera",
  "/pagos": "/admin-panel/pagos",
  "/facturacion": "/admin-panel/pagos",
  "/consumos": "/admin-panel/movimientos?vista=encasa",
  "/admin-panel/caja-central": "/admin-panel/mi-caja"
};
