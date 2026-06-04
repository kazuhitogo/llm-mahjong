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
  config: Pick<RuleConfig, 'returnPoints' | 'uma'>,
): FinalStanding[] {
  // rank: 同点なら seat 昇順で上位
  const order = ([0, 1, 2, 3] as Seat[]).sort((a, b) => {
    if (scores[b] !== scores[a]) return scores[b] - scores[a];
    return a - b;
  });

  const returnPts = config.returnPoints / 1000;

  // 2〜4位: 100点切り捨て
  const nonFirst = order.slice(1).map((seat, i) => ({
    seat,
    rank: (i + 2) as 2 | 3 | 4,
    rawScore: scores[seat],
    finalScore: Math.trunc(scores[seat] / 1000) - returnPts + config.uma[i + 1]!,
  }));

  // 1位: 端数を全部吸収してゼロサムを保証
  const firstFinal = -(nonFirst.reduce((s, p) => s + p.finalScore, 0));
  const first: FinalStanding = {
    seat: order[0]!,
    rank: 1,
    rawScore: scores[order[0]!],
    finalScore: firstFinal,
  };

  return [first, ...nonFirst];
}
