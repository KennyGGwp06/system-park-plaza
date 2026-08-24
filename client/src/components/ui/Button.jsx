import { Loader2 } from "lucide-react";

const variants = {
  primary: "bg-park-green text-white shadow-[0_5px_16px_rgba(0,0,0,0.22)] hover:bg-park-green-hover hover:shadow-[0_8px_22px_rgba(0,0,0,0.2)] active:scale-95 focus-visible:ring-park-green",
  secondary: "border border-park-border bg-white text-park-black shadow-sm hover:bg-slate-50 hover:shadow-md active:scale-95 focus-visible:ring-park-green",
  gold: "bg-park-gold text-park-black shadow-[0_4px_14px_rgba(245,166,35,0.39)] hover:bg-park-gold-hover hover:shadow-[0_6px_20px_rgba(245,166,35,0.23)] active:scale-95 focus-visible:ring-park-gold",
  danger: "bg-park-danger text-white shadow-[0_4px_14px_rgba(231,76,60,0.39)] hover:bg-park-danger-hover hover:shadow-[0_6px_20px_rgba(231,76,60,0.23)] active:scale-95 focus-visible:ring-park-danger",
  ghost: "text-park-dark hover:bg-park-green-soft active:scale-95 focus-visible:ring-park-green"
};

const sizes = {
  sm: "h-9 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-sm"
};

export function Button({ as: Component = "button", children, icon: Icon, loading = false, variant = "primary", size = "md", className = "", disabled, ...props }) {
  const isDisabled = disabled || loading;
  return (
    <Component
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60 ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={Component === "button" ? isDisabled : undefined}
      {...props}
    >
      {loading ? <Loader2 className="animate-spin" size={16} /> : Icon ? <Icon size={16} /> : null}
      {children}
    </Component>
  );
}
