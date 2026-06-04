import { Mulberry32 } from '../wall/rng.js';
import type { Seat } from '../types/seat.js';

/** 席決め結果。seatToPlayer[seat] = playerIndex (0-3) */
export type SeatAssignment = [Seat, Seat, Seat, Seat];

/**
 * 東南西北の牌をシャッフルして各プレイヤーに配る席決め。
 * 同じ seed からは同じ結果を返す。
 */
export function assignSeats(seed: number): SeatAssignment {
  const rng = new Mulberry32(seed ^ 0x5ea7_dead);
  const arr: SeatAssignment = [0, 1, 2, 3];
  rng.shuffle(arr);
  return arr;
}
