import { Pill } from "./Pill";
import type { RankBand } from "@/lib/norms";

export function RankCard({
  label,
  value,
  unit,
  band,
  sub,
}: {
  label: string;
  value: string;
  unit?: string;
  band: RankBand;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between">
        <div className="text-xs uppercase tracking-wide text-ppa-muted">
          {label}
        </div>
        <Pill band={band} />
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="tabular text-3xl font-semibold">{value}</span>
        {unit ? <span className="text-sm text-ppa-muted">{unit}</span> : null}
      </div>
      {sub ? <div className="mt-1 text-xs text-ppa-muted">{sub}</div> : null}
    </div>
  );
}
