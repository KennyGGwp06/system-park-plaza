import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../services/api";
import { realtime } from "../services/realtime";

function expectedShape(initialData) {
  if (Array.isArray(initialData)) return "array";
  if (initialData && typeof initialData === "object") return "object";
  return "any";
}

function hasExpectedShape(value, shape) {
  if (shape === "array") return Array.isArray(value);
  if (shape === "object") {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }
  return true;
}

export function useFetch(path, options = {}) {
  const enabled = options.enabled ?? true;
  const realtimeEnabled = options.realtime !== false;
  const pollInterval = Math.max(1500, Number(options.pollInterval ?? 5000));
  const initialData = options.initialData ?? null;
  const shape = expectedShape(initialData);
  const [data, setDataState] = useState(initialData);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);
  const mountedRef = useRef(false);
  const requestSequenceRef = useRef(0);
  const hasValidDataRef = useRef(hasExpectedShape(initialData, shape));
  const lastLoadRef = useRef(0);

  const setData = useCallback((nextValue) => {
    setDataState((currentValue) => {
      const resolved = typeof nextValue === "function" ? nextValue(currentValue) : nextValue;
      if (hasExpectedShape(resolved, shape)) {
        hasValidDataRef.current = true;
        return resolved;
      }
      return currentValue;
    });
  }, [shape]);

  const load = useCallback(async () => {
    if (!enabled) return undefined;
    const requestSequence = ++requestSequenceRef.current;
    lastLoadRef.current = Date.now();
    if (!hasValidDataRef.current) setLoading(true);
    try {
      const result = await api(path);
      if (!hasExpectedShape(result, shape)) {
        throw new TypeError(`Respuesta inválida de ${path}: se esperaba ${shape === "array" ? "una lista" : "un objeto"}`);
      }
      if (!mountedRef.current || requestSequence !== requestSequenceRef.current) return result;
      hasValidDataRef.current = true;
      setDataState(result);
      setError(null);
      return result;
    } catch (err) {
      if (mountedRef.current && requestSequence === requestSequenceRef.current) setError(err);
      return undefined;
    } finally {
      if (mountedRef.current && requestSequence === requestSequenceRef.current) setLoading(false);
    }
  }, [path, enabled, shape]);

  useEffect(() => {
    mountedRef.current = true;
    if (enabled) load();
    else setLoading(false);
    return () => {
      mountedRef.current = false;
      requestSequenceRef.current += 1;
    };
  }, [enabled, load]);

  useEffect(() => {
    if (!enabled || !realtimeEnabled) return undefined;
    let timer;
    // Un cambio en el servidor llega a todas las pantallas a la vez: cada una espera un poco al azar
    // (0,3 a 0,8 s) para no pedir todas en el mismo instante.
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      clearTimeout(timer);
      timer = setTimeout(load, 300 + Math.random() * 500);
    };
    const refreshOnReturn = () => {
      if (document.visibilityState === "visible") refresh();
    };
    realtime.on("state:changed", refresh);
    // El botón "Actualizar" de la cabecera pide a todas las pantallas abiertas que vuelvan a leer.
    window.addEventListener("parkplaza:refresh", load);
    realtime.on("connect", refresh);
    document.addEventListener("visibilitychange", refreshOnReturn);
    // Socket.IO gives the immediate update. This lightweight background check
    // guarantees convergence even when a proxy/firewall silently drops events.
    // It never clears the current data or shows a loading screen.
    // Con el tiempo real conectado, el respaldo pregunta como mucho cada 30 s (escalabilidad, Fase 0).
    const fallback = window.setInterval(() => {
      if (realtime.connected && Date.now() - lastLoadRef.current < Math.max(pollInterval, 30000)) return;
      refresh();
    }, pollInterval);
    return () => {
      clearTimeout(timer);
      clearInterval(fallback);
      document.removeEventListener("visibilitychange", refreshOnReturn);
      realtime.off("state:changed", refresh);
      window.removeEventListener("parkplaza:refresh", load);
      realtime.off("connect", refresh);
    };
  }, [enabled, load, pollInterval, realtimeEnabled]);

  const safeData = hasExpectedShape(data, shape) ? data : initialData;
  return { data: safeData, loading, error, reload: load, setData };
}
