import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

class OperationsErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="center-screen" role="alert">
          <section className="startup-error">
            <strong>La estación no pudo cargarse.</strong>
            <p>Tu sesión y los datos registrados se conservan. Recarga solo esta pantalla para continuar.</p>
            <button className="primary" type="button" onClick={() => window.location.reload()}>Reintentar</button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById("root")).render(
  <OperationsErrorBoundary>
    <App />
  </OperationsErrorBoundary>
);
