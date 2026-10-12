import { Component } from "react";
import { TriangleAlert } from "lucide-react";

export class AppErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) { return { error }; }

  componentDidCatch(error, info) { console.error("Park Plaza view error", error, info); }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="ax ax-screen">
        <section className="ax-box" role="alert">
          <span className="is-crit"><TriangleAlert /></span>
          <small>No pudimos mostrar esta vista</small>
          <h1>El resto del sistema sigue disponible</h1>
          <p>Actualiza la pantalla. Si el problema continúa, vuelve al inicio; los datos ya registrados se conservan.</p>
          <footer>
            <button className="ax-btn ax-btn--line" onClick={() => { this.setState({ error: null }); window.location.assign("/"); }}>Ir al inicio</button>
            <button className="ax-btn" onClick={() => window.location.reload()}>Actualizar</button>
          </footer>
        </section>
      </main>
    );
  }
}
