export function LoadingSpinner({ label = "Cargando datos..." }) {
  return (
    <div className="ax-loading" role="status">
      <i aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
