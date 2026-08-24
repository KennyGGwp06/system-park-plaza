import { apiBaseUrl } from "../config/api";

export function getToken() {
  return localStorage.getItem("hotel_park_plaza_token");
}

export function setToken(token) {
  localStorage.setItem("hotel_park_plaza_token", token);
}

export function clearToken() {
  localStorage.removeItem("hotel_park_plaza_token");
}

export async function api(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    cache: "no-store",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.message || "Error de comunicacion con el servidor");
    error.status = response.status;
    error.details = data?.details;
    error.fieldErrors = data?.fieldErrors || {};
    throw error;
  }
  return data;
}
