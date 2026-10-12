import { BookOpen, ChefHat, ClipboardCheck, Factory, GlassWater, LayoutDashboard, PackagePlus, Boxes, Wine } from "lucide-react";

const view = (label, href, icon, badge) => [label, href, icon, badge];

// Estación de Restaurante (cocina), 2026-09-26: 7 módulos sin duplicados. La cocina prepara pedidos, sigue las
// recetas (solo lectura), controla su stock y sus mermas, pide y recibe insumos y cierra su día. No ve costos ni precios.
// "Registrar merma" y "Recibir insumos" ya no son pantallas aparte: viven en "Mi stock" y en "Pedir y recibir".
export const KITCHEN_MODULES = [
  {
    label: "Cocina",
    icon: ChefHat,
    items: [
      view("Mi turno", "/restaurante/dashboard", LayoutDashboard),
      view("Pedidos", "/restaurante/pedidos", ChefHat, "orders")
    ]
  },
  {
    label: "Recetas",
    icon: BookOpen,
    items: [
      view("Recetario", "/restaurante/inventario/recetas", BookOpen),
      view("Preparación y porcionado", "/restaurante/produccion", Factory)
    ]
  },
  {
    label: "Insumos",
    icon: Boxes,
    items: [
      view("Mi stock y mermas", "/restaurante/inventario/insumos", Boxes),
      view("Pedir y recibir", "/restaurante/inventario/solicitudes", PackagePlus, "incoming"),
      view("Cierre del día", "/restaurante/inventario/cierre", ClipboardCheck)
    ]
  }
];

export const KITCHEN_LEGACY_REDIRECTS = {
  "/restaurante": "/restaurante/dashboard",
  "/cocina/estacion": "/restaurante/pedidos",
  "/restaurante/inventario/mermas": "/restaurante/inventario/insumos?merma=1",
  "/restaurante/inventario/recepciones": "/restaurante/inventario/solicitudes?vista=recibir"
};

// Estación de Bar, 2026-09-26: la misma estación que la cocina (mismas pantallas y reglas) con lo propio de la barra:
// "Control de botellas" (abrir, servir, medir y cerrar cada botella) en lugar de "Preparación y porcionado".
export const BAR_MODULES = [
  {
    label: "Barra",
    icon: Wine,
    items: [
      view("Mi turno", "/bartender/dashboard", LayoutDashboard),
      view("Pedidos", "/bartender/pedidos", GlassWater, "orders")
    ]
  },
  {
    label: "Recetas",
    icon: BookOpen,
    items: [
      view("Recetario", "/bartender/inventario/recetas", BookOpen),
      view("Control de botellas", "/bartender/botellas", Wine, "bottles")
    ]
  },
  {
    label: "Insumos",
    icon: Boxes,
    items: [
      view("Mi stock y mermas", "/bartender/inventario/insumos", Boxes),
      view("Pedir y recibir", "/bartender/inventario/solicitudes", PackagePlus, "incoming"),
      view("Cierre del día", "/bartender/inventario/cierre", ClipboardCheck)
    ]
  }
];

export const BAR_LEGACY_REDIRECTS = {
  "/bartender": "/bartender/dashboard",
  "/bar/estacion": "/bartender/pedidos",
  "/bartender/inventario/mermas": "/bartender/inventario/insumos?merma=1",
  "/bartender/inventario/recepciones": "/bartender/inventario/solicitudes?vista=recibir"
};

// Lo que cambia entre Cocina y Bar. Las pantallas leen esto de useKitchen().station en vez de rutas y textos fijos.
export const STATIONS = {
  RESTAURANTE: {
    area: "RESTAURANTE", base: "/restaurante", ordersApi: "/restaurante", name: "Cocina", brand: "Cocina · Restaurante", modules: KITCHEN_MODULES,
    item: "plato", items: "platos", Items: "Platos", measure: "pesar", avisos: "Avisos de cocina", icon: ChefHat, stock: "cocina",
    stages: [["PENDIENTE", "Nuevos", "Acepta o rechaza", "EN_COCINA", "Aceptar"], ["EN_COCINA", "Aceptados", "En espera de fuego", "PREPARANDO", "Empezar preparación"], ["PREPARANDO", "En preparación", "Pesa según la receta", "LISTO", "Marcar listo"], ["LISTO", "Listos", "Esperan entrega", "ENTREGADO", "Confirmar entrega"]]
  },
  BARTENDER: {
    area: "BARTENDER", base: "/bartender", ordersApi: "/bartender", name: "Bar", brand: "Bar · Barra", modules: BAR_MODULES,
    item: "bebida", items: "bebidas", Items: "Bebidas", measure: "medir", avisos: "Avisos del bar", icon: GlassWater, stock: "la barra",
    stages: [["PENDIENTE", "Nuevos", "Acepta o rechaza", "PREPARANDO", "Aceptar y preparar"], ["PREPARANDO", "En preparación", "Mide según la receta", "LISTO", "Marcar listo"], ["LISTO", "Listos", "Esperan entrega", "ENTREGADO", "Confirmar entrega"]]
  }
};
