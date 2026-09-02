import {
  ArrowLeftRight, BarChart3, BedDouble, BookOpen, Boxes, CalendarCheck, Camera, Car, ChefHat,
  CircleDollarSign, ClipboardCheck, ClipboardList, ContactRound, DollarSign, Factory, FileText, Image,
  FileWarning, KeyRound, LayoutDashboard, LockKeyhole, Package, Receipt, ScanLine, Settings, ShieldCheck,
  ShoppingCart, Sparkles, Trash2, UserCog, Users, Waves, Wine, Wrench, Scale
} from "lucide-react";

const adminMenu = [
  { label: "INICIO", items: [["Resumen", "/admin-panel", LayoutDashboard]] },
  { label: "RECEPCIÓN", items: [["Reservas", "/reservas", CalendarCheck], ["Llegadas y salidas", "/checkin", ScanLine], ["Clientes", "/clientes", ContactRound]] },
  { label: "CAJA", items: [["Atención", "/recepcion", ClipboardCheck], ["Pagos", "/pagos", Receipt], ["Emitir boleta o factura", "/facturacion", FileText], ["Mi cierre", "/admin-panel/mi-caja", DollarSign]] },
  { label: "SERVICIOS", items: [["Validar accesos", "/accesos", ShieldCheck], ["Piscina y mirador", "/piscina/ingresos", Waves], ["Eventos", "/eventos/reservas", CalendarCheck], ["Cochera", "/cochera", Car]] },
  { label: "HOTEL", items: [["Estado del hotel", "/hotel", BedDouble], ["Habitaciones", "/hotel/habitaciones", BedDouble], ["Limpieza", "/hotel/limpieza", Camera], ["Mantenimiento", "/hotel/mantenimiento", Wrench]] },
  { label: "GASTRONOMÍA", items: [["Restaurante", "/control-gastronomico/restaurante", ChefHat], ["Bar", "/control-gastronomico/bar", Wine]] }
];

// Superadmin: el dueño administra cada servicio de forma independiente, pero ve el dinero y la operación en conjunto.
const superAdminMenu = [
  { label: "INICIO", items: [["Resumen", "/superadmin", LayoutDashboard]] },
  { label: "CATÁLOGO", items: [["Servicios", "/admin/comercial", CircleDollarSign], ["Carta", "/admin/alimentos-bebidas", ChefHat], ["Contenido e imágenes", "/admin/contenido", Image]] },
  { label: "HOTEL", items: [["Inicio del hotel", "/hotel", BedDouble], ["Reservas", "/hotel/reservas", CalendarCheck], ["Llegadas y salidas", "/hotel/movimientos", ScanLine], ["Habitaciones", "/hotel/habitaciones", BedDouble], ["Limpieza", "/hotel/limpieza", Sparkles], ["Mantenimiento", "/hotel/mantenimiento", Wrench]] },
  { label: "PISCINA", items: [["Ingresos", "/piscina/ingresos", Waves], ["Validar QR", "/piscina/validar-qr", ShieldCheck]] },
  { label: "MIRADOR", items: [["Validar QR", "/accesos", ShieldCheck]] },
  { label: "EVENTOS", items: [["Reservas", "/eventos/reservas", CalendarCheck]] },
  { label: "GASTRONOMÍA", items: [["Restaurante", "/control-gastronomico/restaurante", ChefHat], ["Bar", "/control-gastronomico/bar", Wine]] },
  { label: "INVENTARIO", items: [["Inicio", "/admin/inventario", Boxes], ["Solicitudes de insumos", "/admin/solicitudes-stock", ClipboardList], ["Comprar y recibir", "/compras", ShoppingCart], ["Proveedores", "/proveedores", ContactRound], ["Distribuir insumos", "/transferencias", ArrowLeftRight], ["Ver existencias", "/inventario", Package], ["Insumos y unidades", "/inventario/catalogo", Scale], ["Preparación y porcionado", "/inventario/produccion", Factory], ["Turnos y cierres", "/inventario/turnos", LockKeyhole]] },
  { label: "FINANZAS", items: [["Pagos", "/pagos", Receipt], ["Facturación electrónica", "/facturacion", FileText], ["Caja", "/admin-panel/caja-central", DollarSign], ["Reportes", "/reportes", BarChart3]] },
  { label: "PERSONAL", items: [["Trabajadores", "/empleados", Users], ["Horarios", "/turnos", ClipboardList]] },
  { label: "CONFIGURACIÓN AVANZADA", items: [["Clientes", "/clientes", ContactRound], ["Usuarios", "/usuarios", UserCog], ["Auditoría", "/auditoria", ShieldCheck], ["Revisión de datos", "/admin/integridad", ShieldCheck], ["Ajustes", "/configuracion", Settings]] }
];

export const menuSectionsByRole = {
  ADMINISTRADOR: adminMenu,
  SUPERADMIN: superAdminMenu,
  RESTAURANTE: [
    { label: "INICIO", items: [["Mi turno", "/restaurante/dashboard", LayoutDashboard]] },
    { label: "PEDIDOS", items: [["Preparar pedidos", "/restaurante/pedidos", ChefHat]] },
    { label: "RECETAS", items: [["Ver recetas", "/restaurante/inventario/recetas", BookOpen]] },
    { label: "INVENTARIO", items: [["Solicitar insumos", "/restaurante/inventario/solicitudes", Package], ["Recibir insumos", "/restaurante/inventario/recepciones", ArrowLeftRight], ["Mi stock", "/restaurante/inventario/insumos", Boxes], ["Registrar merma", "/restaurante/inventario/mermas", Trash2], ["Cerrar turno", "/restaurante/inventario/cierre", ClipboardList]] }
  ],
  BARTENDER: [
    { label: "INICIO", items: [["Mi turno", "/bartender/dashboard", LayoutDashboard]] },
    { label: "PEDIDOS", items: [["Preparar bebidas", "/bartender/pedidos", Wine]] },
    { label: "RECETAS", items: [["Ver recetas", "/bartender/inventario/recetas", ClipboardCheck]] },
    { label: "INVENTARIO", items: [["Solicitar insumos", "/bartender/inventario/solicitudes", Package], ["Recibir insumos", "/bartender/inventario/recepciones", ArrowLeftRight], ["Mi stock", "/bartender/inventario/insumos", Boxes], ["Control de botellas", "/bartender/botellas", Wine], ["Registrar merma", "/bartender/inventario/mermas", Trash2], ["Cerrar turno", "/bartender/inventario/cierre", ClipboardList]] }
  ],
  LIMPIEZA: [
    { label: "OPERACIÓN DE LIMPIEZA", items: [["Alertas", "/limpieza", Sparkles], ["En atención", "/limpieza/en-atencion", ClipboardCheck], ["Historial", "/limpieza/historial", ClipboardList]] }
  ],
  MANTENIMIENTO: [
    { label: "OPERACIÓN DE MANTENIMIENTO", items: [["Alertas", "/mantenimiento", Sparkles], ["En atención", "/mantenimiento/reparacion", ClipboardCheck], ["Historial", "/mantenimiento/finalizados", ClipboardList]] }
  ],
  OPERATIVO: []
};

function flattenItems(items) { return items.flatMap((item) => Array.isArray(item) ? [item] : flattenItems(item.children || [])); }
export const menuByRole = Object.fromEntries(Object.entries(menuSectionsByRole).map(([role, sections]) => [role, sections.flatMap((section) => flattenItems(section.items))]));
export const routeTitles = Object.fromEntries(Object.values(menuSectionsByRole).flatMap((sections) => sections.flatMap((section) => flattenItems(section.items).map(([label, href]) => [href, label]))));
export const defaultRouteByRole = { ADMINISTRADOR: "/admin-panel", SUPERADMIN: "/superadmin", RESTAURANTE: "/restaurante/dashboard", BARTENDER: "/bartender/dashboard", LIMPIEZA: "/limpieza", MANTENIMIENTO: "/mantenimiento", OPERATIVO: "/403" };

export function permissionForHref(href = "") {
  if (href.startsWith("/admin-panel/mi-caja") || href.startsWith("/admin-panel/caja-central")) return "CAJA:VER";
  if (href.startsWith("/superadmin") || href.startsWith("/admin-panel")) return "DASHBOARD:VER";
  if (href.startsWith("/transferencias")) return "INVENTARIO:VER";
  if (href.startsWith("/admin/alimentos-bebidas")) return "INVENTARIO:VER";
  if (href.startsWith("/admin/contenido")) return "INVENTARIO:VER";
  if (href.startsWith("/admin/solicitudes-stock")) return "INVENTARIO:VER";
  if (href.startsWith("/control-gastronomico/restaurante")) return "RESTAURANTE:VER";
  if (href.startsWith("/control-gastronomico/bar")) return "BARTENDER:VER";
  if (href.startsWith("/restaurante")) return "RESTAURANTE:VER";
  if (href.startsWith("/bartender") || href.startsWith("/bar")) return "BARTENDER:VER";
  if (href.startsWith("/limpieza")) return "LIMPIEZA:VER";
  if (href.startsWith("/mantenimiento")) return "MANTENIMIENTO:VER";
  if (href.startsWith("/admin/limpieza")) return "RECEPCION:VER";
  if (href.startsWith("/incidencias")) return "REPORTES:VER";
  if (href.startsWith("/piscina")) return "RECEPCION:VER";
  if (href.startsWith("/eventos")) return "EVENTOS:VER";
  if (href.startsWith("/cochera")) return "COCHERA:VER";
  if (href.startsWith("/clientes")) return "CLIENTES:VER";
  if (href.startsWith("/hotel/clientes")) return "CLIENTES:VER";
  if (href.startsWith("/hotel")) return "HABITACIONES:VER";
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
