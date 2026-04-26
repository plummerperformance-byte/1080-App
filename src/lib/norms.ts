import type { Norm, Athlete } from "@/types/database";

export type Rank = "Poor" | "Fair" | "Good" | "Great" | "Elite" | "n/a";

export const RANK_BG: Record<Rank, string> = {
  Poor: "bg-rank-poor",
  Fair: "bg-rank-fair",
  Good: "bg-rank-good",
  Great: "bg-rank-great",
  Elite: "bg-rank-elite",
  "n/a": "bg-gray-100",
};

export type AthleteContext = {
  sport: Athlete["sport"];
  level: Athlete["level"];
  sex: Athlete["sex"];
  position_group: Athlete["position_group"] | null;
};

export function selectNorm(
  norms: Norm[],
  metricName: string,
  ctx: AthleteContext,
): Norm | null {
  const candidates = norms.filter((n) => n.metric_name === metricName);
  if (candidates.length === 0) return null;
  let best: Norm | null = null;
  let bestScore = -1;
  for (const n of candidates) {
    let score = 0;
    if (n.sport === ctx.sport) score += 8;
    if (n.level === ctx.level) score += 4;
    if (n.sex === ctx.sex) score += 2;
    if (n.position_group === ctx.position_group) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = n;
    }
  }
  return best;
}

export function rankValue(value: number | null | undefined, norm: Norm | null): Rank {
  if (!norm || value == null) return "n/a";
  const { poor_max, fair_max, good_max, great_max, higher_is_better } = norm;
  if (poor_max == null || fair_max == null || good_max == null || great_max == null) {
    return "n/a";
  }
  if (higher_is_better) {
    if (value < poor_max) return "Poor";
    if (value < fair_max) return "Fair";
    if (value < good_max) return "Good";
    if (value < great_max) return "Great";
    return "Elite";
  }
  // Lower-is-better — for split times etc.
  if (value > poor_max) return "Poor";
  if (value > fair_max) return "Fair";
  if (value > good_max) return "Good";
  if (value > great_max) return "Great";
  return "Elite";
}
