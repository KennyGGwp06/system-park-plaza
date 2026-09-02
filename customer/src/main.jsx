import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { CustomerErrorBoundary } from "./CustomerErrorBoundary";
import "./styles.css";
import "./responsive.css";

// Cuando se publica una nueva versión, una pestaña antigua puede pedir un
// fragmento JS que ya no existe. Recargamos una vez para tomar los archivos nuevos.
window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  window.location.reload();
});

sessionStorage.removeItem("pp_customer_asset_retry");

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <CustomerErrorBoundary><App /></CustomerErrorBoundary>
  </StrictMode>
);
