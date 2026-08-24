import { Component } from "react";

export class AppErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) { return { error }; }

  componentDidCatch(error, info) { console.error("Park Plaza view error", error, info); }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="grid min-h-screen place-items-center bg-park-bg p-5">
        <section className="w-full max-w-xl rounded-card border border-red-200 bg-white p-7 text-center shadow-card">
          <p className="text-xs font-black uppercase text-park-danger">No pudimos mostrar esta vista</p>
          <h1 className="mt-2 font-display text-2xl font-semibold text-park-dark">El resto del sistema sigue disponible</h1>
          <p className="mt-3 text-sm text-park-muted">Actualiza la pantalla. Si el problema continúa, vuelve al inicio y conserva los datos ya registrados.</p>
          <div className="mt-6 flex justify-center gap-2">
            <button className="rounded-button border border-park-border px-4 py-2 font-black text-park-green" onClick={() => { this.setState({ error: null }); window.location.assign("/"); }}>Ir al inicio</button>
            <button className="rounded-button bg-park-green px-4 py-2 font-black text-white" onClick={() => window.location.reload()}>Actualizar</button>
          </div>
        </section>
      </main>
    );
  }
}
