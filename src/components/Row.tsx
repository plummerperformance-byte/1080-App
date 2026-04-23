import type { ReactNode } from "react";
import type { RankBand } from "@/lib/norms";
import { Pill } from "./Pill";

export function Row({
  label,
  value,
  sub,
  band,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  /** Optional rank band; renders a Pill between the label and the value. */
  band?: RankBand;
}) {
  return (
    <div className="flex items-baseline justify-between border-b border-gray-100 py-2 last:border-0">
      <div className="flex items-baseline gap-2">
        <div>
          <div className="text-sm text-ppa-muted">{label}</div>
          {sub ? <div className="text-xs text-ppa-muted/80">{sub}</div> : null}
        </div>
        {band && band !== "n/a" ? <Pill band={band} /> : null}
      </div>
      <div className="tabular text-right text-sm font-medium">{value}</div>
    </div>
  );
}
