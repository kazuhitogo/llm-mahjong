import type { Tile } from './tile.js';

/**
 * プレイヤーが取れる行動。エンジンが getLegalActions() で列挙し、
 * プレイヤー（人間 or LLM）はその中から 1 つ選ぶ。
 *
 * Phase 1 ではまず discard/pass のみ実装。
 * Phase 2 で riichi/tsumo/ron/pon/chi/kan を順次追加。
 */
export type Action =
  | DiscardAction
  | RiichiAction
  | TsumoAction
  | RonAction
  | PonAction
  | ChiAction
  | DaiminkanAction
  | AnkanAction
  | KakanAction
  | KyushuKyuhaiAction
  | PassAction;

export interface DiscardAction {
  kind: 'discard';
  tile: Tile;
  /** ツモ切り（直前にツモった牌をそのまま打つ）かどうか */
  tsumogiri: boolean;
  /** プレイヤーが任意で添えられる思考メモ */
  reason?: string;
}

export interface RiichiAction {
  kind: 'riichi';
  tile: Tile;
  reason?: string;
}

export interface TsumoAction {
  kind: 'tsumo';
  reason?: string;
}

export interface RonAction {
  kind: 'ron';
  reason?: string;
}

export interface PonAction {
  kind: 'pon';
  /** 手牌から使う 2 枚（赤ドラを区別するため Tile 列で指定） */
  tiles: [Tile, Tile];
  reason?: string;
}

export interface ChiAction {
  kind: 'chi';
  /** 手牌から使う 2 枚（順子の残り） */
  tiles: [Tile, Tile];
  reason?: string;
}

export interface DaiminkanAction {
  kind: 'daiminkan';
  reason?: string;
}

export interface AnkanAction {
  kind: 'ankan';
  /** 暗槓する牌種（同じ TileKind の 4 枚） */
  tile: Tile;
  reason?: string;
}

export interface KakanAction {
  kind: 'kakan';
  /** ポンしている刻子に加える牌 */
  tile: Tile;
  reason?: string;
}

export interface KyushuKyuhaiAction {
  kind: 'kyushu_kyuhai';
  reason?: string;
}

export interface PassAction {
  kind: 'pass';
  reason?: string;
}

export type ActionKind = Action['kind'];
