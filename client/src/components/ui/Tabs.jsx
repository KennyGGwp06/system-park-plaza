export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="inline-flex rounded-card border border-park-border bg-white p-1 shadow-card">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          className={`rounded-button px-4 py-2 text-sm font-semibold transition ${value === tab.value ? "bg-park-green text-white" : "text-park-muted hover:bg-park-bg hover:text-park-black"}`}
          onClick={() => onChange(tab.value)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
