import { Component } from "react";

export class CustomerErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { console.error("Customer experience error", error); }
  render() {
    if (!this.state.error) return this.props.children;
    return <main className="customer-recovery"><section><p>EXPERIENCIA PARK PLAZA</p><h1>No pudimos abrir esta sección</h1><span>Tu reserva y tu sesión siguen protegidas. Intenta nuevamente o vuelve al inicio.</span><div><button onClick={() => this.setState({ error: null })}>Reintentar</button><button onClick={() => window.location.assign("/")}>Ir al inicio</button></div></section></main>;
  }
}
