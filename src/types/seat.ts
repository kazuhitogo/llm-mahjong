/** 席（プレイヤーの位置）。0:起家(東), 1:南, 2:西, 3:北 */
export type Seat = 0 | 1 | 2 | 3;

/** 風（場風・自風用）。E:東 S:南 W:西 N:北 */
export type Wind = 'E' | 'S' | 'W' | 'N';

export const ALL_SEATS: readonly Seat[] = [0, 1, 2, 3];
export const ALL_WINDS: readonly Wind[] = ['E', 'S', 'W', 'N'];

/** 席 → 自風（起家=東として、相対回転は別関数） */
export function seatWind(seat: Seat, dealerSeat: Seat): Wind {
  const idx = (seat - dealerSeat + 4) % 4;
  return ALL_WINDS[idx]!;
}

/** 次の席（下家） */
export function nextSeat(seat: Seat): Seat {
  return ((seat + 1) % 4) as Seat;
}
