import {
  ArrowLeftRight, BarChart3, BedDouble, BookOpen, Boxes, CalendarCheck, Camera, Car, ChefHat,
  CircleDollarSign, ClipboardCheck, ClipboardList, ContactRound, DollarSign, Factory, FileText,
  FileWarning, KeyRound, LayoutDashboard, LockKeyhole, Package, Receipt, ScanLine, Settings, ShieldCheck,
  ShoppingCart, Sparkles, Trash2, UserCog, Users, Waves, Wine, Wrench, Scale
} from "lucide-react";

const adminMenu = [
  { label: "INICIO", items: [["Resumen", "/admin-panel", LayoutDashboard]] },
  { label: "RECEPCIÓN", items: [["Reservas", "/reservas", CalendarCheck], ["Llegadas y salidas", "/checkin", ScanLine], ["Clientes", "/clientes", ContactRound]] },
  { label: "CAJA", items: [["Atención", "/recepcion", ClipboardCheck], ["Pagos", "/pagos", Receipt], ["Mi cierre", "/admin-panel/mi-caja", DollarSign]] },
  { label: "SERVICIOS", items: [["Validar accesos", "/accesos", ShieldCheck], ["Piscina y mirador", "/piscina/ingresos", Waves], ["Eventos", "/eventos/reservas", CalendarCheck], ["Cochera", "/cochera", Car]] },
  { label: "HOTEL", items: [["Habitaciones", "/habitaciones", BedDouble], ["Limpieza", "/admin/limpieza/resumen", Camera], ["Mantenimiento", "/incidencias", Wrench]] },
  { label: "GASTRONOMÍA", items: [["Restaurante", "/control-gastronomico/restaurante", ChefHat], ["Bar", "/control-gastronomico/bar", Wine]] }
];

// Superadmin: el dueño administra cada servicio de forma independiente, pero ve el dinero y la operación en conjunto.
const superAdminMenu = [
  { label: "INICIO", items: [["Resumen", "/superadmin", LayoutDashboard]] },
  { label: "CATÁLOGO", items: [["Servicios", "/admin/comercial", CircleDollarSign], ["Carta", "/admin/alimentos-bebidas", ChefHat]] },
  { label: "HOTEL", items: [["Reservas", "/reservas", CalendarCheck], ["Llegadas y salidas", "/checkin", ScanLine], ["Habitaciones", "/habitaciones", BedDouble], ["Limpieza", "/admin/limpieza/resumen", Sparkles], ["Mantenimiento", "/incidencias", Wrench]] },
  { label: "PISCINA", items: [["Ingresos", "/piscina/ingresos", Waves], ["Validar QR", "/piscina/validar-qr", ShieldCheck]] },
  { label: "MIRADOR", items: [["Validar QR", "/accesos", ShieldCheck]] },
  { label: "EVENTOS", items: [["Reservas", "/eventos/reservas", CalendarCheck]] },
  { label: "GASTRONOMÍA", items: [["Restaurante", "/control-gastronomico/restaurante", ChefHat], ["Bar", "/control-gastronomico/bar", Wine]] },
  { label: "INVENTARIO", items: [["Existencias", "/admin/inventario", Boxes], ["Compras", "/compras", ShoppingCart], ["Transferencias", "/transferencias", ArrowLeftRight], ["Producción", "/inventario/produccion", Factory], ["Cierres", "/inventario/turnos", LockKeyhole]] },
  { label: "FINANZAS", items: [["Pagos", "/pagos", Receipt], ["Caja", "/admin-panel/caja-central", DollarSign], ["Reportes", "/reportes", BarChart3]] },
  { label: "PERSONAL", items: [["Trabajadores", "/empleados", Users], ["Horarios", "/turnos", ClipboardList]] },
  { label: "SISTEMA", items: [["Clientes", "/clientes", ContactRound], ["Usuarios", "/usuarios", UserCog], ["Auditoría", "/auditoria", ShieldCheck], ["Integridad", "/admin/integridad", ShieldCheck], ["Ajustes", "/configuracion", Settings]] }
];

export const menuSectionsByRole = {
  ADMINISTRADOR: adminMenu,
  SUPERADMIN: superAdminMenu,
  RESTAURANTE: [
    { label: "INICIO", items: [["Mi turno", "/restaurante/dashboard", LayoutDashboard]] },
    { label: "PEDIDOS", items: [["Preparar pedidos", "/restaurante/pedidos", ChefHat]] },
    { label: "RECETAS", items: [["Ver recetas", "/restaurante/inventario/recetas", BookOpen]] },
    { label: "INVENTARIO", items: [["Mi stock", "/restaurante/inventario/insumos", Boxes], ["Registrar merma", "/restaurante/inventario/mermas", Trash2], ["Cerrar turno", "/restaurante/inventario/cierre", ClipboardList]] }
  ],
  BARTENDER: [
    { label: "INICIO", items: [["Mi turno", "/bartender/dashboard", LayoutDashboard]] },
    { label: "PEDIDOS", items: [["Preparar bebidas", "/bartender/pedidos", Wine]] },
    { label: "RECETAS", items: [["Ver recetas", "/bartender/inventario/recetas", ClipboardCheck]] },
    { label: "INVENTARIO", items: [["Mi stock", "/bartender/inventario/insumos", Boxes], ["Registrar merma", "/bartender/inventario/mermas", Trash2], ["Cerrar turno", "/bartender/inventario/cierre", ClipboardList]] }
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
export const defaultRouteByRole = { ADMINISTRADOR: "/admin-panel", SUPERADMIN: "/superadmin", RESTAURANTE: "/restaurante", BARTENDER: "/bartender", LIMPIEZA: "/limpieza", MANTENIMIENTO: "/mantenimiento", OPERATIVO: "/403" };

export function permissionForHref(href = "") {
  if (href.startsWith("/superadmin") || href.startsWith("/admin-panel")) return "ADMINISTRADOR:VER";
  if (href.startsWith("/transferencias")) return "INVENTARIO:VER";
  if (href.startsWith("/admin/alimentos-bebidas")) return "INVENTARIO:VER";
  if (href.startsWith("/control-gastronomico")) return "ADMINISTRADOR:VER";
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
