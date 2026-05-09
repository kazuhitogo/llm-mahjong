import type { Tile } from './tile.js';
import type { Seat } from './seat.js';

/** 副露の種類 */
export type MeldKind =
  | 'chi'        // チー（順子）
  | 'pon'        // ポン（刻子）
  | 'daiminkan'  // 大明槓（他家から）
  | 'ankan'      // 暗槓
  | 'kakan';     // 加槓（ポンから）

export interface Meld {
  kind: MeldKind;
  /** 構成牌（赤ドラ含む実際の牌、ソート済み）。 */
  tiles: Tile[];
  /**
   * 鳴いた相手の席。ankan の場合は自分の席。
   * チー/ポン/大明槓では「打った相手」の席が入る。
   */
  from: Seat;
  /**
   * 鳴かれた牌（チー・ポン・大明槓・加槓のとき）。ankan は null。
   * 描画やドラ判定で「どの牌が鳴かれた牌か」を区別する用。
   */
  calledTile: Tile | null;
}
