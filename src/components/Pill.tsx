import { type RankBand, RANK_BG } from "@/lib/norms";

export function Pill({ band }: { band: RankBand }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold text-ppa-navy ${RANK_BG[band]}`}
    >
      {band}
    </span>
  );
}
