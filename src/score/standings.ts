import type { Seat } from '../types/seat.js';
import type { RuleConfig } from '../types/state.js';

export interface FinalStanding {
  seat: Seat;
  rank: 1 | 2 | 3 | 4;
  rawScore: number;
  /** oka + uma 込みの最終スコア（単位: 千点） */
  finalScore: number;
}

/**
 * 終局スコアからランクとオカウマ込み最終スコアを計算する。
 * 同点の場合は座席番号が小さい方が上位。
 */
export function computeStandings(
  scores: readonly [number, number, number, number],
  config: Pick<RuleConfig, 'startingPoints' | 'returnPoints' | 'uma'>,
): FinalStanding[] {
  const oka = ((config.returnPoints - config.startingPoints) * 4) / 1000;

  // rank: 同点なら seat 昇順で上位
  const order = ([0, 1, 2, 3] as Seat[]).sort((a, b) => {
    if (scores[b] !== scores[a]) return scores[b] - scores[a];
    return a - b;
  });

  return order.map((seat, idx) => {
    const rank = (idx + 1) as 1 | 2 | 3 | 4;
    const diff = (scores[seat] - config.returnPoints) / 1000;
    const uma = config.uma[idx]!;
    const extra = rank === 1 ? oka : 0;
    return {
      seat,
      rank,
      rawScore: scores[seat],
      finalScore: Math.round((diff + uma + extra) * 10) / 10,
    };
  });
}
