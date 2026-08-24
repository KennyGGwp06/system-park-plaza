export function Modal({ open, title, children, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-2xl rounded-2xl bg-white/95 backdrop-blur-md p-6 shadow-modal animate-in zoom-in-95 duration-200 border border-white">
        <div className="mb-5 flex items-center justify-between border-b border-park-border/50 pb-3">
          <h2 className="text-xl font-black text-park-dark drop-shadow-sm">{title}</h2>
          <button className="rounded-xl px-3 py-1.5 text-sm font-bold text-park-muted transition-colors hover:bg-slate-100/50 hover:text-park-dark" onClick={onClose} type="button">Cerrar</button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto pr-2 sidebar-scroll">
          {children}
        </div>
      </div>
    </div>
  );
}

