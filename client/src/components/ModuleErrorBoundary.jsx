import { Component } from "react";
import { TriangleAlert } from "lucide-react";

export class ModuleErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) { return { error }; }

  componentDidCatch(error, info) {
    console.error("ModuleErrorBoundary", {
      path: window.location.pathname,
      message: error?.message,
      componentStack: info?.componentStack
    });
  }

  componentDidUpdate(previousProps) {
    if (this.state.error && previousProps.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <div className="ax ax-inline">
      <section className="ax-box" role="alert">
        <span className="is-crit"><TriangleAlert /></span>
        <small>Error aislado en esta vista</small>
        <h2>Puedes seguir usando el menú</h2>
        <p>Tu sesión y los datos ya guardados se mantienen. Intenta cargar solo esta vista otra vez.</p>
        <footer><button className="ax-btn" onClick={() => this.setState({ error: null })}>Reintentar</button></footer>
      </section>
    </div>;
  }
}
