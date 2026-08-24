import { Search } from "lucide-react";

export function SearchInput({ value, onChange, placeholder = "Buscar..." }) {
  return (
    <label className="relative block">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-park-muted" size={18} />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none focus:border-park-green focus:ring-4 focus:ring-emerald-100"
      />
    </label>
  );
}
