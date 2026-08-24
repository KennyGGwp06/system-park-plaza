export const apiBaseUrl = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export const apiOrigin = apiBaseUrl.replace(/\/api\/?$/, "");
