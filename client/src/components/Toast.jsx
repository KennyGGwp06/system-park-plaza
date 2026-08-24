export function Toast({ message, type = "success", onClose }) {
  if (!message) return null;
  const colors = type === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700";
  return (
    <div className={`fixed right-5 top-5 z-50 rounded-lg border px-4 py-3 text-sm font-bold shadow-soft ${colors}`}>
      <button className="mr-3" onClick={onClose} type="button">x</button>
      {message}
    </div>
  );
}
