import {
  BarChart3,
  BedDouble,
  CalendarCheck,
  Car,
  ChefHat,
  CircleDollarSign,
  ClipboardCheck,
  Coffee,
  DollarSign,
  FileText,
  LayoutDashboard,
  LockKeyhole,
  Package,
  Receipt,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  UserCog,
  Users,
  Waves,
  Wine,
  Wrench,
  Scale
  ,ArrowLeftRight
  ,ScanLine
  ,ContactRound
  ,CalendarClock
  ,Boxes
  ,Trash2
  ,CheckCircle2
  ,Camera
  ,FileWarning
} from "lucide-react";

export const menuSectionsByRole = {
  ADMINISTRADOR: [
    {
      label: "Hoy · prioridad alta",
      items: [
        ["Inicio y alertas", "/admin-panel", LayoutDashboard],
        ["Caja y cierre diario", "/admin-panel/caja-central", DollarSign],
        ["Incidencias", "/incidencias", Wrench]
      ]
    },
    {
      label: "Operación",
      items: [
        ["Recepción y reservas", "/recepcion", ClipboardCheck],
        ["Alimentos y bebidas", "/admin/alimentos-bebidas", ChefHat],
        ["Limpieza y mantenimiento", "/admin/limpieza/resumen", CheckCircle2]
      ]
    },
    {
      label: "Ventas e inventario",
      items: [
        ["Precios y tarifas", "/admin/comercial", CircleDollarSign],
        ["Carta, recetas e insumos", "/inventario", Package],
        ["Compras y abastecimiento", "/compras", ShoppingCart],
        ["Cierres y transferencias", "/inventario/turnos", LockKeyhole]
      ]
    },
    {
      label: "Equipo y control avanzado",
      items: [
        ["Personal y turnos", "/empleados", Users],
        ["Usuarios y permisos", "/usuarios", UserCog],
        ["Reportes e indicadores", "/dashboard", BarChart3],
        ["Integridad y auditoría", "/admin/integridad", ShieldCheck]
      ]
    }
  ],
  RECEPCION: [
    {
      label: "Centro de atención",
      items: [
        ["Mi jornada", "/recepcion", LayoutDashboard],
        ["Validar ingreso", "/accesos", ScanLine],
        ["Llegadas y salidas", "/checkin", ShieldCheck]
      ]
    },
    {
      label: "Atención al huésped",
      items: [
        ["Reservas y clientes", "/reservas?nueva=1", CalendarCheck],
        ["Check-out", "/checkout", Receipt],
        ["Operación y cochera", "/recepcion", Waves]
      ]
    },
    {
      label: "Soporte y caja",
      items: [
        ["Pagos", "/pagos", DollarSign],
        ["Soporte y mantenimiento", "/incidencias", Wrench]
      ]
    }
  ],
  RESTAURANTE: [
    {
      label: "Restaurante · mi operación",
      items: [
        ["Operación y pedidos", "/restaurante/pedidos", ChefHat],
        ["Mi turno", "/restaurante/dashboard", LayoutDashboard],
        ["Manual y porciones", "/restaurante/inventario/recetas", ClipboardCheck],
        ["Mi inventario", "/restaurante/inventario/insumos", Boxes],
        ["Registrar merma", "/restaurante/inventario/mermas", Trash2],
        ["Cerrar y cuadrar", "/restaurante/inventario/cierre", CheckCircle2]
      ]
    }
  ],
  BARTENDER: [
    {
      label: "Bar · mi operación",
      items: [
        ["Operación y pedidos", "/bartender/pedidos", Wine],
        ["Mi turno", "/bartender/dashboard", LayoutDashboard],
        ["Manual y medidas", "/bartender/inventario/recetas", ClipboardCheck],
        ["Mi inventario", "/bartender/inventario/insumos", Boxes],
        ["Registrar merma", "/bartender/inventario/mermas", Trash2],
        ["Cerrar y cuadrar", "/bartender/inventario/cierre", CheckCircle2]
      ]
    }
  ],
  LIMPIEZA: [
    {
      label: "Operación de limpieza",
      items: [
        ["Mi turno", "/limpieza/dashboard", LayoutDashboard],
        ["Tareas por atender", "/limpieza/pendientes", ClipboardCheck],
        ["Evidencias y cierre", "/limpieza/finalizadas", CheckCircle2],
        ["Galería de evidencias", "/limpieza/evidencias", Camera],
        ["Novedades y mantenimiento", "/limpieza/incidencias", FileWarning]
      ]
    }
  ]
};

function flattenItems(items) {
  return items.flatMap((item) => {
    if (Array.isArray(item)) return [item];
    return [[item.label, item.href, item.icon], ...(item.children || [])];
  });
}

export const menuByRole = Object.fromEntries(
  Object.entries(menuSectionsByRole).map(([role, sections]) => [role, sections.flatMap((section) => flattenItems(section.items))])
);

export const routeTitles = Object.fromEntries(
  Object.values(menuSectionsByRole).flatMap((sections) => sections.flatMap((section) => flattenItems(section.items).map(([label, href]) => [href, label])))
);

export const defaultRouteByRole = {
  ADMINISTRADOR: "/admin-panel",
  RECEPCION: "/recepcion",
  RESTAURANTE: "/restaurante/dashboard",
  BARTENDER: "/bartender/dashboard",
  LIMPIEZA: "/limpieza/dashboard"
};

export function permissionForHref(href) {
  if (href.startsWith("/transferencias")) return "INVENTARIO:VER";
  if (href.startsWith("/admin/alimentos-bebidas")) return "INVENTARIO:VER";
  if (href.startsWith("/admin/restaurante") || href.startsWith("/restaurante")) return "RESTAURANTE:VER";
  if (href.startsWith("/admin/bartender") || href.startsWith("/bartender") || href.startsWith("/bar")) return "BARTENDER:VER";
  if (href.startsWith("/admin/limpieza") || href.startsWith("/limpieza")) return "LIMPIEZA:VER";
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
  if (href.startsWith("/consumos") || href.startsWith("/operaciones") || href.startsWith("/cocina")) return "PEDIDOS:VER";
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
  if (href.startsWith("/configuracion")) return "CONFIGURACION:VER";
  if (href.startsWith("/dashboard")) return "DASHBOARD:VER";
  if (href.startsWith("/accesos")) return "ACCESOS:VER";
  if (href.startsWith("/empleados")) return "EMPLEADOS:VER";
  if (href.startsWith("/turnos") || href.startsWith("/planilla")) return "TURNOS:VER";
  return null;
}
