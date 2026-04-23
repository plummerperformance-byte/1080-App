export function Metric({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-ppa-muted">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="tabular text-2xl font-semibold">{value}</span>
        {unit ? <span className="text-sm text-ppa-muted">{unit}</span> : null}
      </div>
    </div>
  );
}
