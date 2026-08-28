import {
  AlertCircle, ArrowLeftRight, BarChart3, BedDouble, BookOpen, Boxes, CalendarCheck, CalendarClock, Camera, Car, ChefHat,
  CircleDollarSign, ClipboardCheck, ClipboardList, ContactRound, DollarSign, Factory, FileText,
  FileWarning, KeyRound, LayoutDashboard, LockKeyhole, Package, Receipt, ScanLine, Settings, ShieldCheck,
  ShoppingCart, Sparkles, Trash2, UserCog, Users, Waves, Wine, Wrench, Scale
} from "lucide-react";

const adminMenu = [
  { label: "CENTRO ADMIN RECEPCIÓN", items: [["Mi centro de control", "/admin-panel", LayoutDashboard]] },
  { label: "ATENCIÓN Y COBROS", items: [
    { label: "Huéspedes y reservas", icon: BedDouble, children: [["Reservas", "/reservas", CalendarCheck], ["Llegadas y salidas", "/checkin", ScanLine], ["Clientes", "/clientes", ContactRound]] },
    { label: "Caja de recepción", icon: DollarSign, children: [["Recepción en vivo", "/recepcion", ClipboardCheck], ["Pagos registrados", "/pagos", Receipt], ["Mi caja y cierre", "/admin-panel/mi-caja", DollarSign]] }
  ] },
  { label: "SERVICIOS Y ACCESOS", items: [
    { label: "Validación del cliente", icon: ShieldCheck, children: [["Validar QR y accesos", "/accesos", ShieldCheck], ["Hospedaje", "/habitaciones", BedDouble]] },
    { label: "Servicios contratados", icon: Waves, children: [["Piscina y mirador", "/piscina/ingresos", Waves], ["Eventos", "/eventos/reservas", CalendarCheck], ["Cochera", "/cochera", Car]] }
  ] },
  { label: "COORDINACIÓN HOTELERA", items: [
    { label: "Habitaciones y soporte", icon: Sparkles, children: [["Evidencias por WhatsApp", "/admin/limpieza/resumen", Camera], ["Incidencias y mantenimiento", "/incidencias", Wrench]] },
    { label: "Restaurante y bar", icon: ChefHat, children: [["Monitor de restaurante", "/admin/restaurante/pedidos", ChefHat], ["Monitor de bar", "/admin/bartender/pedidos", Wine], ["Entrega a cocina y bar", "/transferencias", ArrowLeftRight]] }
  ] },
  { label: "PERSONAL DE TURNO", items: [
    { label: "Coordinación de personal", icon: Users, children: [["Personal activo", "/empleados", Users], ["Turnos programados", "/turnos", ClipboardList]] }
  ] }
];

// Superadmin: control total agrupado por procesos reales, no por pantallas aisladas.
const superAdminMenu = [
  { label: "CENTRO SUPERADMIN", items: [["Resumen integral", "/superadmin", LayoutDashboard]] },
  { label: "GOBIERNO Y SEGURIDAD", items: [{ label: "Control del sistema", icon: ShieldCheck, children: [["Usuarios y permisos", "/usuarios", UserCog], ["Auditoría", "/auditoria", ShieldCheck], ["Integridad de datos", "/admin/integridad", ShieldCheck], ["Configuración", "/configuracion", Settings]] }] },
  { label: "OPERACIÓN HOTELERA", items: [{ label: "Huéspedes y habitaciones", icon: BedDouble, children: [["Reservas y huéspedes", "/reservas", CalendarCheck], ["Llegadas y salidas", "/checkin", ScanLine], ["Clientes", "/clientes", ContactRound], ["Habitaciones y evidencias", "/admin/limpieza/resumen", Sparkles], ["Incidencias y mantenimiento", "/incidencias", Wrench]] }] },
  { label: "SERVICIOS Y EXPERIENCIA", items: [{ label: "Oferta, tarifas y accesos", icon: CircleDollarSign, children: [["Precios y tarifas", "/admin/comercial", CircleDollarSign], ["Habitaciones y tarifas", "/habitaciones", BedDouble], ["Piscina y mirador", "/piscina/ingresos", Waves], ["Eventos y ambientes", "/eventos/reservas", CalendarCheck], ["Cochera y tarifas", "/cochera", Car]] }] },
  { label: "RESTAURANTE Y BAR", items: [{ label: "Carta y operación", icon: ChefHat, children: [["Carta, precios y recetas", "/admin/alimentos-bebidas", ChefHat], ["Pedidos de restaurante", "/admin/restaurante/pedidos", ChefHat], ["Pedidos de bar", "/admin/bartender/pedidos", Wine]] }] },
  { label: "INVENTARIO, PERSONAL Y FINANZAS", items: [
    { label: "Inventario y abastecimiento", icon: Boxes, children: [["Inventario central", "/admin/inventario", Boxes], ["Compras y proveedores", "/compras", ShoppingCart], ["Transferencias", "/transferencias", ArrowLeftRight], ["Producción y porcionado", "/inventario/produccion", Factory], ["Cierres de inventario", "/inventario/turnos", LockKeyhole]] },
    { label: "Personal y control financiero", icon: Users, children: [["Personal y turnos", "/empleados", Users], ["Programación y planilla", "/turnos", ClipboardList], ["Pagos y cajas", "/admin-panel/caja-central", DollarSign], ["Reportes globales", "/reportes", BarChart3]] }
  ] }
];

export const menuSectionsByRole = {
  ADMINISTRADOR: adminMenu,
  SUPERADMIN: superAdminMenu,
  RESTAURANTE: [
    {
      label: "Centro de Restaurante",
      items: [
        ["Mi turno", "/restaurante/dashboard", LayoutDashboard],
        ["Alertas operativas", "/restaurante/dashboard", AlertCircle]
      ]
    },
    {
      label: "Pedidos y producción",
      items: [
        ["Cola de pedidos", "/restaurante/pedidos", ChefHat],
        ["Preparación y entrega", "/restaurante/pedidos", ChefHat]
      ]
    },
    {
      label: "Recetas y porciones",
      items: [
        ["Manual técnico", "/restaurante/inventario/recetas", BookOpen],
        ["Ficha del plato", "/restaurante/inventario/recetas", BookOpen]
      ]
    },
    {
      label: "Mi inventario de turno",
      items: [
        ["Stock asignado", "/restaurante/inventario/insumos", Boxes],
        ["Registrar merma", "/restaurante/inventario/mermas", Trash2],
        ["Cerrar y cuadrar", "/restaurante/inventario/cierre", ClipboardList]
      ]
    }
  ],
  BARTENDER: [
    { label: "Centro de Bar", items: [["Mi turno", "/bartender/dashboard", LayoutDashboard], ["Alertas operativas", "/bartender/dashboard", AlertCircle]] },
    { label: "Pedidos y preparación", items: [["Cola de bebidas", "/bartender/pedidos", Wine], ["Preparación y entrega", "/bartender/pedidos", Wine]] },
    { label: "Recetas y medidas", items: [["Manual técnico", "/bartender/inventario/recetas", ClipboardCheck], ["Porciones y medidas", "/bartender/inventario/recetas", Scale]] },
    { label: "Mi inventario de turno", items: [["Stock asignado", "/bartender/inventario/insumos", Boxes], ["Registrar merma", "/bartender/inventario/mermas", Trash2], ["Cerrar y cuadrar", "/bartender/inventario/cierre", ClipboardList]] }
  ],
  OPERATIVO: []
};

function flattenItems(items) { return items.flatMap((item) => Array.isArray(item) ? [item] : flattenItems(item.children || [])); }
export const menuByRole = Object.fromEntries(Object.entries(menuSectionsByRole).map(([role, sections]) => [role, sections.flatMap((section) => flattenItems(section.items))]));
export const routeTitles = Object.fromEntries(Object.values(menuSectionsByRole).flatMap((sections) => sections.flatMap((section) => flattenItems(section.items).map(([label, href]) => [href, label]))));
export const defaultRouteByRole = { ADMINISTRADOR: "/admin-panel", SUPERADMIN: "/superadmin", RESTAURANTE: "/restaurante", BARTENDER: "/bartender", OPERATIVO: "/403" };

export function permissionForHref(href = "") {
  if (href.startsWith("/superadmin") || href.startsWith("/admin-panel")) return "ADMINISTRADOR:VER";
  if (href.startsWith("/transferencias")) return "INVENTARIO:VER";
  if (href.startsWith("/admin/alimentos-bebidas")) return "INVENTARIO:VER";
  if (href.startsWith("/admin/restaurante") || href.startsWith("/restaurante")) return "RESTAURANTE:VER";
  if (href.startsWith("/admin/bartender") || href.startsWith("/bartender") || href.startsWith("/bar")) return "BARTENDER:VER";
  if (href.startsWith("/admin/limpieza")) return "RECEPCION:VER";
  if (href.startsWith("/incidencias")) return "REPORTES:VER";
  if (href.startsWith("/piscina")) return "RECEPCION:VER";
  if (href.startsWith("/eventos")) return "EVENTOS:VER";
  if (href.startsWith("/cochera")) return "COCHERA:VER";
  if (href.startsWith("/clientes")) return "CLIENTES:VER";
  if (href.startsWith("/habitaciones")) return "HABITACIONES:VER";
  if (href.startsWith("/reservas")) return "RESERVAS:VER";
  if (href.startsWith("/checkin")) return "CHECK_IN:VER";
  if (href.startsWith("/checkout")) return "CHECK_OUT:VER";
  if (href.startsWith("/recepcion")) return "RECEPCION:VER";
  if (href.startsWith("/inventario")) return "INVENTARIO:VER";
  if (href.startsWith("/compras")) return "COMPRAS:VER";
  if (href.startsWith("/proveedores")) return "PROVEEDORES:VER";
  if (href.startsWith("/pagos")) return "PAGOS:VER";
  if (href.startsWith("/facturacion")) return "FACTURACION:VER";
  if (href.startsWith("/caja")) return "CAJA:VER";
  if (href.startsWith("/usuarios")) return "USUARIOS:VER";
  if (href.startsWith("/roles")) return "ROLES:VER";
  if (href.startsWith("/reportes")) return "REPORTES:VER";
  if (href.startsWith("/auditoria")) return "AUDITORIA:VER";
  if (href.startsWith("/accesos")) return "ACCESOS:VER";
  if (href.startsWith("/empleados")) return "EMPLEADOS:VER";
  return null;
}
