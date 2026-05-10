import type { Seat } from '../types/seat.js';
import type { AgariResult } from './calculator.js';

export interface ScoreDelta {
  seat: Seat;
  delta: number;
}

/** ツモ和了の点数移動を計算する */
export function computeTsumoPayout(
  winner: Seat,
  dealerSeat: Seat,
  result: AgariResult,
  honba: number,
  riichiSticks: number,
): ScoreDelta[] {
  const seats = [0, 1, 2, 3] as Seat[];
  const deltas: ScoreDelta[] = [];
  const isWinnerDealer = winner === dealerSeat;

  if (isWinnerDealer) {
    // 親の自摸: 子全員が outgoing_ten[0] + honba*100 を払う
    const perPayer = result.outgoingScore[0] + honba * 100;
    for (const s of seats) {
      if (s === winner) continue;
      deltas.push({ seat: s, delta: -perPayer });
    }
    deltas.push({ seat: winner, delta: perPayer * 3 + riichiSticks * 1000 });
  } else {
    // 子の自摸: 親が outgoing_ten[0] + honba*100, 子が outgoing_ten[1] + honba*100
    const dealerPay = result.outgoingScore[0] + honba * 100;
    const nonDealerPay = result.outgoingScore[1] + honba * 100;
    let winnerGain = riichiSticks * 1000;
    for (const s of seats) {
      if (s === winner) continue;
      const pay = s === dealerSeat ? dealerPay : nonDealerPay;
      deltas.push({ seat: s, delta: -pay });
      winnerGain += pay;
    }
    deltas.push({ seat: winner, delta: winnerGain });
  }

  return deltas;
}

/** ロン和了の点数移動を計算する */
export function computeRonPayout(
  winner: Seat,
  loser: Seat,
  result: AgariResult,
  honba: number,
  riichiSticks: number,
): ScoreDelta[] {
  const payment = result.score + honba * 300;
  return [
    { seat: loser, delta: -payment },
    { seat: winner, delta: payment + riichiSticks * 1000 },
  ];
}

/** ダブロン時: 供託は放銃者から見て最も近いプレイヤーが取る */
export function riichiSticksWinner(winners: Seat[], loser: Seat): Seat {
  // 下家 → 対面 → 上家の順 (loser+1, loser+2, loser+3)
  for (let i = 1; i <= 3; i++) {
    const s = ((loser + i) % 4) as Seat;
    if (winners.includes(s)) return s;
  }
  return winners[0]!;
}
