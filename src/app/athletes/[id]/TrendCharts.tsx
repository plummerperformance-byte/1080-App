"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type TrendPoint = {
  date: string;
  maxV: number | null;
  f0: number | null;
  v0: number | null;
  pmax: number | null;
  s10: number | null;
  s40: number | null;
};

const charts: { key: keyof TrendPoint; label: string; unit: string; color: string }[] = [
  { key: "maxV", label: "Max V", unit: "m/s", color: "#EF4444" },
  { key: "f0", label: "F₀ (rel)", unit: "N/kg", color: "#1F2937" },
  { key: "v0", label: "V₀", unit: "m/s", color: "#10B981" },
  { key: "pmax", label: "Pmax (rel)", unit: "W/kg", color: "#F59E0B" },
  { key: "s10", label: "10m split", unit: "s", color: "#3B82F6" },
  { key: "s40", label: "40m split", unit: "s", color: "#8B5CF6" },
];

export default function TrendCharts({ data }: { data: TrendPoint[] }) {
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {charts.map((c) => {
        const points = data
          .map((d) => ({ date: d.date, value: d[c.key] as number | null }))
          .filter((d) => d.value != null);
        return (
          <div key={c.key} className="rounded-md border border-gray-100 p-3">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ppa-muted">
              {c.label} ({c.unit})
            </div>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={points}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} domain={["auto", "auto"]} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke={c.color}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      })}
    </div>
  );
}
