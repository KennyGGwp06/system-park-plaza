export function openClientAccessPage(page, fallback) {
  if (document.querySelector(".sa-proposal")) {
    const destinations = {
      pases: { area: "admision", page: "qr" },
      llegadas: { area: "admision", page: "llegadas" },
      "reservas-globales": { area: "reservas", page: "general" },
      "clientes-todos": { area: "clientes", page: "directorio" }
    };
    const destination = destinations[page] || { area: "clientes", page: "directorio" };
    window.dispatchEvent(new CustomEvent("parkplaza:superadmin-navigate", { detail: destination }));
    return;
  }
  if (fallback) window.location.assign(fallback);
}
