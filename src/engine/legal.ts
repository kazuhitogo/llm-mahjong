import type {
  Action,
  DiscardAction,
  RiichiAction,
  TsumoAction,
  RonAction,
  PassAction,
  PonAction,
  ChiAction,
  DaiminkanAction,
  AnkanAction,
  KakanAction,
} from '../types/action.js';
import type { GameState, PlayerState } from '../types/state.js';
import type { Tile, TileKind } from '../types/tile.js';
import type { Seat } from '../types/seat.js';
import { tileKind, isHonor, kindToTile } from '../tiles/tile.js';

// ---------- effective tile count ----------

/** ポン/チー/大明槓での副露後のメンツ数×3 + 手牌数 (打牌可能状態なら 14) */
export function effectiveCount(player: PlayerState): number {
  return player.hand.length + 3 * player.melds.length;
}

// ---------- discard phase helpers ----------

/**
 * 打牌候補を返す。
 * - 副露あり: effectiveCount が 14 なら合法
 * - リーチ中: ツモ切りのみ (手牌末尾)
 * - 喰い替え禁止: chiKuikaeKinds に属する牌種を除外
 */
export function getDiscardCandidates(
  state: GameState,
  seat: Seat,
): DiscardAction[] {
  if (state.turn.seat !== seat) return [];
  if (state.turn.phase !== 'discard') return [];

  const player = state.players[seat];
  if (effectiveCount(player) !== 14) return [];

  // リーチ後: ツモ切りのみ
  if (player.riichi) {
    const last = player.hand[player.hand.length - 1]!;
    return [{ kind: 'discard', tile: last, tsumogiri: true }];
  }

  const kuikae = new Set(state.chiKuikaeKinds);
  const seen = new Set<string>();
  const out: DiscardAction[] = [];

  for (const t of player.hand) {
    if (seen.has(t)) continue;
    seen.add(t);
    if (kuikae.has(tileKind(t))) continue;
    out.push({ kind: 'discard', tile: t, tsumogiri: false });
  }
  return out;
}

// ---------- call phase helpers ----------

/** ポン候補 (打牌に対して) */
export function ponCandidates(hand: Tile[], discardTile: Tile): PonAction[] {
  const kind = tileKind(discardTile);
  const matching = hand.filter(t => tileKind(t) === kind);
  if (matching.length < 2) return [];

  const seen = new Set<string>();
  const result: PonAction[] = [];
  for (let i = 0; i < matching.length; i++) {
    for (let j = i + 1; j < matching.length; j++) {
      const pair: [Tile, Tile] = [matching[i]!, matching[j]!];
      const key = [...pair].sort().join(',');
      if (!seen.has(key)) {
        seen.add(key);
        result.push({ kind: 'pon', tiles: pair });
      }
    }
  }
  return result;
}

/** 大明槓候補 */
export function daiminkanCandidate(hand: Tile[], discardTile: Tile): DaiminkanAction | null {
  const kind = tileKind(discardTile);
  const count = hand.filter(t => tileKind(t) === kind).length;
  return count >= 3 ? { kind: 'daiminkan' } : null;
}

/** 同一スートの有効牌種範囲チェック */
function validKindForSuit(k: number, suit: string): boolean {
  if (suit === 'm') return k >= 0 && k <= 8;
  if (suit === 'p') return k >= 9 && k <= 17;
  if (suit === 's') return k >= 18 && k <= 26;
  return false;
}

/** チー候補 (上家打牌のみ、喰い替え考慮は engine 側) */
export function chiCandidates(hand: Tile[], discardTile: Tile): ChiAction[] {
  if (isHonor(discardTile)) return [];
  const suit = discardTile[1]!;
  const dk = tileKind(discardTile);

  // discardTile を含む順子パターン: (dk-2,dk-1), (dk-1,dk+1), (dk+1,dk+2) が必要
  const patterns: [number, number][] = [
    [dk - 2, dk - 1],
    [dk - 1, dk + 1],
    [dk + 1, dk + 2],
  ];

  const result: ChiAction[] = [];
  const seen = new Set<string>();

  for (const [needA, needB] of patterns) {
    if (!validKindForSuit(needA, suit) || !validKindForSuit(needB, suit)) continue;
    const tilesA = hand.filter(t => tileKind(t) === needA);
    const tilesB = hand.filter(t => tileKind(t) === needB);
    if (tilesA.length === 0 || tilesB.length === 0) continue;
    for (const a of tilesA) {
      for (const b of tilesB) {
        const key = [a, b].sort().join(',');
        if (!seen.has(key)) {
          seen.add(key);
          result.push({ kind: 'chi', tiles: [a, b] });
        }
      }
    }
  }
  return result;
}

/** 暗槓候補 (自分の番、リーチ中は不可 [Phase 2b 簡略化]) */
export function ankanCandidates(player: PlayerState): AnkanAction[] {
  if (player.riichi) return [];
  const kindCount = new Map<number, number>();
  for (const t of player.hand) {
    const k = tileKind(t);
    kindCount.set(k, (kindCount.get(k) ?? 0) + 1);
  }
  const result: AnkanAction[] = [];
  for (const [k, count] of kindCount) {
    if (count === 4) {
      result.push({ kind: 'ankan', tile: kindToTile(k as TileKind) });
    }
  }
  return result;
}

/** 加槓候補 (ポン副露 + 手牌に同種1枚、リーチ中不可) */
export function kakanCandidates(player: PlayerState): KakanAction[] {
  if (player.riichi) return [];
  const result: KakanAction[] = [];
  for (const meld of player.melds) {
    if (meld.kind !== 'pon') continue;
    const ponKind = tileKind(meld.tiles[0]!);
    if (player.hand.some(t => tileKind(t) === ponKind)) {
      result.push({ kind: 'kakan', tile: kindToTile(ponKind as TileKind) });
    }
  }
  return result;
}

/** call phase: 自分の PendingCall エントリに基づいて合法手を返す */
export function getCallCandidates(
  state: GameState,
  seat: Seat,
  discardedTile: Tile,
): Array<RonAction | PonAction | DaiminkanAction | ChiAction | PassAction> {
  if (state.turn.phase !== 'call') return [];
  const pending = state.pendingCalls.find(p => p.seat === seat && !p.responded);
  if (!pending) return [];

  const player = state.players[seat];
  const out: Array<RonAction | PonAction | DaiminkanAction | ChiAction | PassAction> = [];

  if (pending.canRon) out.push({ kind: 'ron' });
  if (pending.canDaiminkan) out.push({ kind: 'daiminkan' });
  if (pending.canPon) {
    for (const a of ponCandidates(player.hand, discardedTile)) out.push(a);
  }
  if (pending.canChi) {
    for (const a of chiCandidates(player.hand, discardedTile)) out.push(a);
  }
  out.push({ kind: 'pass' });
  return out;
}

/** フォールバック打牌 (違反時) */
export function fallbackAction(state: GameState, seat: Seat): DiscardAction {
  const player = state.players[seat as 0 | 1 | 2 | 3];
  const last = player.hand[player.hand.length - 1];
  if (!last) throw new Error('fallbackAction: empty hand');
  return { kind: 'discard', tile: last, tsumogiri: true };
}

export function isLegalDiscard(state: GameState, seat: Seat, action: Action): boolean {
  if (action.kind !== 'discard') return false;
  const player = state.players[seat as 0 | 1 | 2 | 3];
  if (player.riichi) {
    return action.tile === player.hand[player.hand.length - 1];
  }
  const kuikae = new Set(state.chiKuikaeKinds);
  if (kuikae.has(tileKind(action.tile))) return false;
  return player.hand.some(t => t === action.tile);
}

// 後方互換エイリアス
export function getLegalActions(state: GameState, seat: number): Action[] {
  return getDiscardCandidates(state, seat as Seat);
}

export function isLegalAction(state: GameState, seat: number, action: Action): boolean {
  return isLegalDiscard(state, seat as Seat, action);
}
