import { ClipboardList, History, LayoutDashboard, Sparkles, Wrench } from "lucide-react";

const view = (label, href, icon, badge) => [label, href, icon, badge];

// Estaciones de Limpieza y Mantenimiento, 2026-09-26: viven en el ERP con la misma identidad que Recepción, Cocina y
// Bar (antes eran una app aparte en el puerto 4174). Cada una: Mi turno, su trabajo (por hacer y en curso) e Historial.
export const OPS_STATIONS = {
  LIMPIEZA: {
    area: "LIMPIEZA", base: "/limpieza", name: "Limpieza", brand: "Operaciones · Limpieza", icon: Sparkles,
    api: "/cleaning/tasks", noun: "tarea", nouns: "tareas", Nouns: "Tareas", work: "limpiar",
    modules: [
      { label: "Mi jornada", items: [view("Mi turno", "/limpieza", LayoutDashboard)] },
      { label: "Mis tareas", items: [view("Tareas", "/limpieza/tareas", Sparkles, "open"), view("Historial", "/limpieza/historial", History)] }
    ]
  },
  MANTENIMIENTO: {
    area: "MANTENIMIENTO", base: "/mantenimiento", name: "Mantenimiento", brand: "Operaciones · Mantenimiento", icon: Wrench,
    api: "/maintenance/reports", noun: "trabajo", nouns: "trabajos", Nouns: "Trabajos", work: "reparar",
    modules: [
      { label: "Mi jornada", items: [view("Mi turno", "/mantenimiento", LayoutDashboard)] },
      { label: "Mis trabajos", items: [view("Trabajos", "/mantenimiento/trabajos", Wrench, "open"), view("Historial", "/mantenimiento/historial", ClipboardList)] }
    ]
  }
};

export const OPS_LEGACY_REDIRECTS = {
  "/limpieza/en-atencion": "/limpieza/tareas?vista=curso",
  "/limpieza/pendientes": "/limpieza/tareas",
  "/limpieza/finalizadas": "/limpieza/historial",
  "/limpieza/evidencias": "/limpieza/historial",
  "/limpieza/incidencias": "/limpieza/historial",
  "/mantenimiento/reparacion": "/mantenimiento/trabajos?vista=curso",
  "/mantenimiento/finalizados": "/mantenimiento/historial",
  "/mantenimiento/evidencias": "/mantenimiento/historial"
};

// Estados comunes a las dos áreas: qué está por hacer, en curso o cerrado.
export const CLEAN_DONE = ["FINALIZADA", "DANOS_REPORTADOS"];
export const JOB_DONE = ["SOLUCIONADO", "RESUELTO"];
export const isDone = (area, row) => (area === "LIMPIEZA" ? CLEAN_DONE : JOB_DONE).includes(row.status);
export const isRunning = (area, row) => (area === "LIMPIEZA" ? row.status === "EN_LIMPIEZA" : ["EN_REPARACION", "EN_REVISION"].includes(row.status));
export const isWaiting = (row) => Boolean(row.requiresReceptionAcceptance && !row.receptionAcceptedAt);
export const isUrgent = (row) => ["ALTA", "CRITICA"].includes(row.priority);
export const finishedAt = (row) => row.finishedAt || row.resolvedAt || row.updatedAt || null;
