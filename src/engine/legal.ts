import type { Action, DiscardAction } from '../types/action.js';
import type { GameState } from '../types/state.js';
import { sortTiles, sameKind } from '../tiles/tile.js';

/**
 * 現在番のプレイヤーが取れる合法手を列挙する。
 * Phase 1 では discard のみ（ツモ切り含む）。
 */
export function getLegalActions(state: GameState, seat: number): Action[] {
  if (state.turn.seat !== seat) return [];
  if (state.turn.phase !== 'discard') return [];

  const player = state.players[seat as 0 | 1 | 2 | 3];
  if (player.hand.length !== 14) {
    throw new Error(
      `getLegalActions: expected 14 tiles in hand for discard phase, got ${player.hand.length}`,
    );
  }

  // 手牌中の各牌を打てる候補として列挙（重複は同種牌として 1 つに集約）
  const seen = new Set<string>();
  const out: DiscardAction[] = [];

  // 直前にツモった牌（hand の末尾と仮定する）はツモ切りとして区別したい
  // Phase 1 では「最後にツモった TileId」を別管理する設計のほうが綺麗だが、
  // 当面は手牌の最後に追加された牌をツモ牌とみなすシンプル方針。
  // → state.turn.lastDrawn を将来追加する想定。
  // ここでは tsumogiri は false 固定で、判別は applyAction 側で last draw との一致で判定する。

  for (const t of player.hand) {
    if (seen.has(t)) continue;
    seen.add(t);
    out.push({ kind: 'discard', tile: t, tsumogiri: false });
  }

  return out;
}

/** プレイヤーから提出されたアクションが現在の合法手集合に含まれるか */
export function isLegalAction(state: GameState, seat: number, action: Action): boolean {
  if (action.kind !== 'discard') return false;
  // discard なら手牌に該当牌があるかどうかでチェック
  const player = state.players[seat as 0 | 1 | 2 | 3];
  return player.hand.some((t) => t === action.tile);
}

/**
 * 違反時のフォールバック行動を返す。
 * Phase 1: 強制ツモ切り（手牌の末尾の牌を打つ）。
 */
export function fallbackAction(state: GameState, seat: number): DiscardAction {
  const player = state.players[seat as 0 | 1 | 2 | 3];
  const last = player.hand[player.hand.length - 1];
  if (!last) throw new Error('fallbackAction: empty hand');
  return { kind: 'discard', tile: last, tsumogiri: true };
}

// 警告抑制: sameKind / sortTiles は将来 phase で使う
void sameKind;
void sortTiles;
