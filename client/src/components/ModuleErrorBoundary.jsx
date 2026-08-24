import { Component } from "react";

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
    return <section className="rounded-card border border-red-200 bg-white p-6 shadow-card" role="alert">
      <p className="text-xs font-black uppercase text-park-danger">Error aislado en este módulo</p>
      <h2 className="mt-2 text-xl font-black text-park-dark">Puedes continuar usando el menú</h2>
      <p className="mt-2 text-sm text-park-muted">Tu sesión y los datos ya guardados se mantienen. Intenta recargar solo esta vista.</p>
      <button className="mt-5 rounded-button bg-park-green px-4 py-2 font-black text-white" onClick={() => this.setState({ error: null })}>Reintentar módulo</button>
    </section>;
  }
}
