import { CalendarDays, LogOut, Menu } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { routeTitles } from "../constants/menu";

export function Navbar({ onMenu }) {
  const location = useLocation();
  const { user, logout } = useAuth();
  const title = routeTitles[location.pathname] || "Modulo ERP";
  const today = new Intl.DateTimeFormat("es-PE", { dateStyle: "medium" }).format(new Date());
  const userName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Usuario";
  const userRole = user?.role || "ERP";

  return (
    <header className="sticky top-0 z-30 flex min-h-[76px] items-center gap-4 border-b border-park-border/80 bg-white/95 px-4 shadow-sm backdrop-blur lg:mb-6 lg:px-8">
      <button className="grid h-10 w-10 place-items-center rounded-xl hover:bg-slate-100/50 transition-colors lg:hidden text-park-dark" onClick={onMenu} type="button" aria-label="Abrir menú de navegación">
        <Menu size={22} />
      </button>
      <div className="min-w-0">
        <h2 className="font-sans text-lg font-black leading-tight text-park-dark sm:text-2xl drop-shadow-sm">{title}</h2>
        <p className="hidden truncate text-sm font-semibold text-park-muted sm:block">Hotel Park Plaza / Sistema ERP hotelero</p>
      </div>
      <div className="ml-auto" />
      <div className="hidden h-11 items-center gap-2 border-l border-park-border/70 px-5 text-sm font-black text-park-dark lg:flex">
        <CalendarDays size={17} className="text-park-green" />
        {today}
      </div>
      <div className="hidden h-11 items-center gap-3 border-l border-park-border/70 pl-5 md:flex">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-park-green text-sm font-black text-white shadow-sm">
          {userName.slice(0, 1).toUpperCase()}
        </span>
        <span className="leading-tight pr-2">
          <span className="block text-sm font-black text-park-dark">{userName}</span>
          <span className="block text-[10px] font-black uppercase tracking-wider text-park-green">{userRole}</span>
        </span>
      </div>
      <button className="grid h-11 w-11 place-items-center rounded-xl border border-red-100/50 bg-white/60 text-park-danger shadow-sm backdrop-blur-sm transition-all hover:bg-red-50 hover:scale-[1.05]" onClick={logout} type="button" title="Cerrar sesion" aria-label="Cerrar sesión">
        <LogOut size={20} />
      </button>
    </header>
  );
}
