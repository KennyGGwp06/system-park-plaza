const tones = {
  success: "border-park-green/20 bg-park-green-soft text-park-dark",
  warning: "border-park-gold/30 bg-park-gold-soft text-park-black",
  danger: "border-park-danger/20 bg-park-danger-soft text-park-danger",
  info: "border-park-border bg-white text-park-black"
};

export function Alert({ tone = "info", title, children }) {
  return (
    <div className={`rounded-card border p-4 text-sm ${tones[tone]}`}>
      {title ? <strong className="mb-1 block font-semibold">{title}</strong> : null}
      {children}
    </div>
  );
}
