import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Navbar } from "./Navbar";
import { TrainingAssistant } from "../components/TrainingAssistant";
import { ModuleErrorBoundary } from "../components/ModuleErrorBoundary";

export function AppLayout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="min-h-screen min-w-0 overflow-x-hidden bg-park-bg text-park-black selection:bg-park-green selection:text-white">
      <Sidebar open={open} onClose={() => setOpen(false)} />
      {open ? <button className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden transition-opacity" onClick={() => setOpen(false)} type="button" aria-label="Cerrar menu" /> : null}
      <div className="min-w-0 overflow-x-hidden lg:pl-[17.5rem] transition-all duration-300">
        <Navbar onMenu={() => setOpen(true)} />
        <main className="min-w-0 overflow-x-hidden px-4 pb-8 pt-2 sm:px-6 lg:px-8 lg:pt-0 animate-in fade-in duration-500">
          <TrainingAssistant />
          <div className="mx-auto max-w-[1600px]">
            <ModuleErrorBoundary resetKey={location.pathname}><Outlet /></ModuleErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  );
}
