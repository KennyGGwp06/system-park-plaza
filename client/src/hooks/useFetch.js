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
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      clearTimeout(timer);
      timer = setTimeout(load, 100);
    };
    const refreshOnReturn = () => {
      if (document.visibilityState === "visible") refresh();
    };
    realtime.on("state:changed", refresh);
    realtime.on("connect", refresh);
    document.addEventListener("visibilitychange", refreshOnReturn);
    // Socket.IO gives the immediate update. This lightweight background check
    // guarantees convergence even when a proxy/firewall silently drops events.
    // It never clears the current data or shows a loading screen.
    const fallback = window.setInterval(refresh, pollInterval);
    return () => {
      clearTimeout(timer);
      clearInterval(fallback);
      document.removeEventListener("visibilitychange", refreshOnReturn);
      realtime.off("state:changed", refresh);
      realtime.off("connect", refresh);
    };
  }, [enabled, load, pollInterval, realtimeEnabled]);

  const safeData = hasExpectedShape(data, shape) ? data : initialData;
  return { data: safeData, loading, error, reload: load, setData };
}
