import type { ReactNode } from "react";

export function Row({
  label,
  value,
  sub,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
}) {
  return (
    <div className="flex items-baseline justify-between border-b border-gray-100 py-2 last:border-0">
      <div>
        <div className="text-sm text-ppa-muted">{label}</div>
        {sub ? <div className="text-xs text-ppa-muted/80">{sub}</div> : null}
      </div>
      <div className="tabular text-right text-sm font-medium">{value}</div>
    </div>
  );
}
