export function Input({ label, error, className = "", id, ...props }) {
  const inputId = id || props.name || props.placeholder;
  return (
    <label className={`block ${className}`} htmlFor={inputId}>
      {label ? <span className="mb-1.5 block text-sm font-semibold text-park-dark drop-shadow-sm">{label}</span> : null}
      <input
        id={inputId}
        className={`h-10 w-full rounded-xl border bg-white/90 px-3 text-sm text-park-dark outline-none transition-all duration-200 placeholder:text-park-muted shadow-sm hover:border-park-green/50 focus:border-park-green focus:ring-2 focus:ring-park-green/20 focus:bg-white focus:shadow-md ${error ? "border-park-danger focus:ring-park-danger/20" : "border-park-border"}`}
        {...props}
      />
      {error ? <span className="mt-1 block text-xs font-semibold text-park-danger">{error}</span> : null}
    </label>
  );
}

