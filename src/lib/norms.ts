import type {
  LevelEnum,
  Norm,
  PositionGroupEnum,
  SexEnum,
  SportEnum,
} from "@/types/database";

export type RankBand = "Poor" | "Fair" | "Good" | "Great" | "Elite" | "n/a";

export type AthleteContext = {
  sport: SportEnum;
  level: LevelEnum;
  sex: SexEnum;
  position_group: PositionGroupEnum;
};

/**
 * Pick the best-matching norm for a given metric and athlete context.
 * Score: +8 sport, +4 level, +2 sex, +1 position_group. Highest wins.
 * Returns null if no norm for the metric exists at all.
 */
export function selectNorm(
  norms: readonly Norm[],
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
    if (n.position_group == null || n.position_group === ctx.position_group) score += 1;
    if (score > bestScore) {
      best = n;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Map a value onto the Poor/Fair/Good/Great/Elite ladder defined by a norm.
 * Bands use < (not ≤) for higher-is-better, > for lower-is-better — matches
 * the algorithm described in the SPEC.
 */
export function rankValue(
  value: number | null | undefined,
  norm: Norm | null | undefined,
): RankBand {
  if (!norm || value == null || !Number.isFinite(value)) return "n/a";
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
  if (value > poor_max) return "Poor";
  if (value > fair_max) return "Fair";
  if (value > good_max) return "Good";
  if (value > great_max) return "Great";
  return "Elite";
}

export const RANK_BG: Record<RankBand, string> = {
  Poor: "bg-rank-poor",
  Fair: "bg-rank-fair",
  Good: "bg-rank-good",
  Great: "bg-rank-great",
  Elite: "bg-rank-elite",
  "n/a": "bg-gray-200",
};
