// App del cliente de Park Plaza (JS nativo). Si una pestaña antigua pide un archivo de una versión anterior que ya
// no existe, recarga una vez para tomar la versión publicada.
window.addEventListener("vite:preloadError", (event) => {
  const previous = Number(sessionStorage.getItem("pp_customer_asset_retry") || 0);
  if (Date.now() - previous > 60000) { event.preventDefault(); sessionStorage.setItem("pp_customer_asset_retry", String(Date.now())); window.location.reload(); }
});
import("./app/boot.js").then(({ bootApp }) => bootApp());
