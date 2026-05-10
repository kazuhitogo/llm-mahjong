import type { Action, DiscardAction, RiichiAction, TsumoAction, RonAction, PassAction } from '../types/action.js';
import type { GameState } from '../types/state.js';
import type { Seat } from '../types/seat.js';

/**
 * discard phase: 手牌の打牌候補を返す（重複種なし）。
 * tsumo / riichi は ScoreCalculator が必要なため engine 側で付加する。
 */
export function getDiscardCandidates(state: GameState, seat: Seat): DiscardAction[] {
  if (state.turn.seat !== seat) return [];
  if (state.turn.phase !== 'discard') return [];

  const player = state.players[seat];
  if (player.hand.length !== 14) return [];

  const seen = new Set<string>();
  const out: DiscardAction[] = [];

  // リーチ後は tsumogiri（手牌末尾 = ツモ牌）のみ
  if (player.riichi) {
    const last = player.hand[player.hand.length - 1]!;
    return [{ kind: 'discard', tile: last, tsumogiri: true }];
  }

  for (const t of player.hand) {
    if (seen.has(t)) continue;
    seen.add(t);
    out.push({ kind: 'discard', tile: t, tsumogiri: false });
  }
  return out;
}

/** call phase: 自分が pendingCalls に存在する場合の合法手 */
export function getCallCandidates(
  state: GameState,
  seat: Seat,
): Array<RonAction | PassAction> {
  if (state.turn.phase !== 'call') return [];
  const pending = state.pendingCalls.find(p => p.seat === seat && !p.responded);
  if (!pending) return [];
  const out: Array<RonAction | PassAction> = [];
  if (pending.canRon) out.push({ kind: 'ron' });
  out.push({ kind: 'pass' });
  return out;
}

/** 不正アクション時のフォールバック (discard phase 用) */
export function fallbackAction(state: GameState, seat: Seat): DiscardAction {
  const player = state.players[seat as 0 | 1 | 2 | 3];
  const last = player.hand[player.hand.length - 1];
  if (!last) throw new Error('fallbackAction: empty hand');
  return { kind: 'discard', tile: last, tsumogiri: true };
}

/** 与えられたアクションが discard phase の合法手集合に含まれるか */
export function isLegalDiscard(state: GameState, seat: Seat, action: Action): boolean {
  if (action.kind !== 'discard') return false;
  const player = state.players[seat as 0 | 1 | 2 | 3];
  // リーチ後はツモ牌のみ
  if (player.riichi) {
    const last = player.hand[player.hand.length - 1];
    return action.tile === last;
  }
  return player.hand.some(t => t === action.tile);
}

/** 後方互換のエイリアス */
export function getLegalActions(state: GameState, seat: number): Action[] {
  return getDiscardCandidates(state, seat as Seat);
}

export function isLegalAction(state: GameState, seat: number, action: Action): boolean {
  return isLegalDiscard(state, seat as Seat, action);
}
