import { ClipboardList, History, LogOut, Sparkles } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const navigation = [
  ["Alertas", "/limpieza/dashboard", Sparkles],
  ["En atención", "/limpieza/pendientes", ClipboardList],
  ["Historial", "/limpieza/finalizadas", History]
];

/**
 * Estación aislada para el trabajador: no hereda el menú ni las acciones del ERP.
 * Está pensada primero para teléfono y conserva una navegación lateral en escritorio.
 */
export function WorkerStationLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-[#f5f8f6] text-[#10251c]">
      <header className="sticky top-0 z-20 border-b border-[#dbe7df] bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#c9a95d] bg-[#0b2b20] font-serif text-lg font-bold text-[#f2d58f]">P</span>
            <div className="min-w-0"><p className="truncate font-serif text-lg font-bold">Park Plaza</p><p className="text-[10px] font-black uppercase tracking-[.12em] text-[#6d7d74]">Estación de limpieza</p></div>
          </div>
          <button className="grid h-10 w-10 place-items-center rounded-xl border border-[#dbe7df] text-[#315444]" onClick={logout} title="Cerrar sesión" type="button" aria-label="Cerrar sesión"><LogOut size={18} /></button>
        </div>
      </header>

      <div className="mx-auto flex min-h-[calc(100vh-65px)] max-w-6xl">
        <aside className="hidden w-56 shrink-0 border-r border-[#dbe7df] bg-[#0b2b20] px-3 py-5 text-white md:block">
          <p className="px-3 text-xs font-black text-[#f2d58f]">{user?.firstName} {user?.lastName}</p>
          <p className="mb-6 px-3 text-[10px] font-bold uppercase tracking-wider text-white/55">Limpieza</p>
          <nav className="grid gap-1">{navigation.map(([label, href, Icon]) => <StationLink key={href} label={label} href={href} Icon={Icon} />)}</nav>
        </aside>
        <main className="min-w-0 flex-1 px-4 pb-24 pt-5 sm:px-6 md:pb-8"><div className="mx-auto max-w-4xl"><Outlet /></div></main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-[#dbe7df] bg-white pb-[max(.4rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_24px_rgba(16,37,28,.08)] md:hidden">
        {navigation.map(([label, href, Icon]) => <StationLink compact key={href} label={label} href={href} Icon={Icon} />)}
      </nav>
    </div>
  );
}

function StationLink({ label, href, Icon, compact = false }) {
  return <NavLink to={href} className={({ isActive }) => `flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-black transition ${compact ? "mx-1 flex-col gap-1" : "justify-start"} ${isActive ? "bg-[#d6ad3d] text-[#10251c]" : compact ? "text-[#63746b]" : "text-white/70 hover:bg-white/10 hover:text-white"}`}><Icon size={compact ? 18 : 17} /><span>{label}</span></NavLink>;
}
