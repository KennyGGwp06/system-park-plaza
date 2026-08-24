import { Link } from "react-router-dom";

export function Forbidden() {
  return (
    <div className="grid min-h-[70vh] place-items-center">
      <div className="rounded-panel border border-slate-200 bg-white p-8 text-center shadow-soft">
        <h1 className="text-4xl font-black text-park-danger">403</h1>
        <p className="mt-2 font-bold text-park-dark">No tienes permisos para acceder a este modulo.</p>
        <Link className="mt-5 inline-flex rounded-lg bg-park-green px-4 py-2 font-bold text-white" to="/dashboard">Volver al dashboard</Link>
      </div>
    </div>
  );
}
