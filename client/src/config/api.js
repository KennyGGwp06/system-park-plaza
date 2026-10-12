// Vite y Nginx redirigen /api al backend. Mantener el mismo origen evita que
// los puertos locales alternativos sean bloqueados por CORS.
export const apiBaseUrl = import.meta.env.VITE_API_URL || "/api";

export const apiOrigin = apiBaseUrl.replace(/\/api\/?$/, "");
