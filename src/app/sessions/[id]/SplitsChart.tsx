"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const ELITE_REFERENCE = { s10: 1.85, s20: 2.95, s30: 3.95, s40: 4.95 };

export default function SplitsChart({
  splits,
}: {
  splits: { s10: number | null; s20: number | null; s30: number | null; s40: number | null };
}) {
  const data = [
    { split: "10m", athlete: splits.s10, elite: ELITE_REFERENCE.s10 },
    { split: "20m", athlete: splits.s20, elite: ELITE_REFERENCE.s20 },
    { split: "30m", athlete: splits.s30, elite: ELITE_REFERENCE.s30 },
    { split: "40m", athlete: splits.s40, elite: ELITE_REFERENCE.s40 },
  ];

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
          <XAxis dataKey="split" />
          <YAxis label={{ value: "Time (s)", angle: -90, position: "insideLeft" }} />
          <Tooltip />
          <Legend />
          <Bar dataKey="athlete" fill="#EF4444" name="Athlete" />
          <Bar dataKey="elite" fill="#9CA3AF" name="Elite reference" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
