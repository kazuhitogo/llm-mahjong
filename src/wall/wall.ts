import type { TileId, Tile } from '../types/tile.js';
import type { WallState } from '../types/state.js';
import type { Seat } from '../types/seat.js';
import { Mulberry32 } from './rng.js';
import { tileIdToTile } from '../tiles/tile.js';

/**
 * 山と配牌の構造（実麻雀準拠）。
 *
 * **積み（layout）**: 136 牌をシャッフルして物理的な配置に固定する。
 *  layout[0..33]   = 親（東）の壁、index 0 = 親席の右端のスタック下牌、index 33 = 左端の上牌
 *  layout[34..67]  = 下家（南）の壁
 *  layout[68..101] = 対面（西）の壁
 *  layout[102..135] = 上家（北）の壁
 *  各壁は 17 スタック × 2 段 = 34 牌。
 *
 * **サイコロ**: 親が 2 個振り、合計 N (2〜12) を得る。
 *  - 開門する壁 = (dealerSeat + (N - 1) % 4) % 4
 *    （親=1, 下家=2, 対面=3, 上家=4, 親=5, ... と数える）
 *  - 開門位置 = 当該壁の右端から N スタック目（= 2N 牌目）
 *  - layout 上の絶対インデックス: breakIndex = breakSeat * 34 + 2N（mod 136）
 *
 * **ツモ順**: 開門位置から反時計回り（layout 上で +1 方向）に進む。
 *  N 番目のツモ牌 = layout[(breakIndex + N) % 136]
 *
 * **王牌**: 開門位置の手前 14 牌（drawnCount が 122 を超える前で打ち切られる領域）。
 *   deadWall[i] = layout[(breakIndex + 122 + i) % 136]
 *   配置:
 *     deadWall[0..3] = 嶺上牌（カン補充牌、3→2→1→0 の順に使用）
 *     deadWall[4]    = 初期ドラ表示
 *     deadWall[5]    = 裏ドラ表示 1
 *     deadWall[6]    = ドラ表示 2（1 回目のカン後にめくる）
 *     deadWall[7]    = 裏ドラ表示 2
 *     ...
 *     deadWall[12]   = ドラ表示 5
 *     deadWall[13]   = 裏ドラ表示 5
 *
 * **配牌**: 開門位置から 4 枚ずつ親→下家→対面→上家の順に 3 巡（48 枚）→ 各 1 枚（4 枚）= 52 枚。
 *   配牌完了時点で各家 13 枚、drawnCount = 52。
 *   親は最初のツモで 14 枚に揃える（chonchon は本実装では使わない）。
 */

export interface DealtWall {
  /** 各プレイヤーの初期手牌（13 枚 × 4） */
  hands: [TileId[], TileId[], TileId[], TileId[]];
  /** 山の状態 */
  wall: WallState;
}

/** 山を「積む」: 136 牌をシャッフルし、サイコロを振り、配牌する。 */
export function dealWall(seed: number, dealerSeat: Seat = 0): DealtWall {
  const rng = new Mulberry32(seed);

  // 1. 136 牌をシャッフル
  const layout: TileId[] = [];
  for (let i = 0; i < 136; i++) layout.push(i as TileId);
  rng.shuffle(layout);

  // 2. サイコロを振る
  const d1 = rng.nextInt(6) + 1;
  const d2 = rng.nextInt(6) + 1;
  const dieSum = d1 + d2; // 2..12

  // 3. 開門位置を計算
  const breakSeatOffset = (dieSum - 1) % 4;
  const breakSeat = ((dealerSeat + breakSeatOffset) % 4) as Seat;
  const breakIndex = (breakSeat * 34 + dieSum * 2) % 136;

  // 4. 配牌: 開門位置から layout を順に取っていく
  const hands: [TileId[], TileId[], TileId[], TileId[]] = [[], [], [], []];
  let cursor = 0;
  for (let cycle = 0; cycle < 3; cycle++) {
    for (let i = 0; i < 4; i++) {
      const seat = ((dealerSeat + i) % 4) as Seat;
      for (let j = 0; j < 4; j++) {
        hands[seat].push(layout[(breakIndex + cursor) % 136]!);
        cursor++;
      }
    }
  }
  for (let i = 0; i < 4; i++) {
    const seat = ((dealerSeat + i) % 4) as Seat;
    hands[seat].push(layout[(breakIndex + cursor) % 136]!);
    cursor++;
  }
  // この時点で cursor = 52（drawnCount の初期値）

  return {
    hands,
    wall: {
      layout,
      dice: [d1, d2],
      breakIndex,
      drawnCount: cursor,
      doraIndicatorCount: 1,
    },
  };
}

/** 次にツモする牌の TileId（破壊しない）。 */
export function peekNextDraw(wall: WallState): TileId | null {
  if (wall.drawnCount >= 122) return null;
  return wall.layout[(wall.breakIndex + wall.drawnCount) % 136]!;
}

/** 1 枚ツモして新しい WallState を返す。山切れなら null。 */
export function drawTile(wall: WallState): { tile: TileId; wall: WallState } | null {
  if (wall.drawnCount >= 122) return null;
  const t = wall.layout[(wall.breakIndex + wall.drawnCount) % 136]!;
  return {
    tile: t,
    wall: { ...wall, drawnCount: wall.drawnCount + 1 },
  };
}

/** 残りのツモ可能枚数。0 で荒牌流局。 */
export function remainingDraws(wall: WallState): number {
  return Math.max(0, 122 - wall.drawnCount);
}

/** 王牌の i 番目の TileId（0..13） */
export function deadWallTileId(wall: WallState, i: number): TileId {
  if (i < 0 || i >= 14) throw new Error(`deadWallTileId: i out of range (${i})`);
  return wall.layout[(wall.breakIndex + 122 + i) % 136]!;
}

/** 公開済みのドラ表示牌一覧（doraIndicatorCount 枚） */
export function getDoraIndicators(wall: WallState, redDora: boolean): Tile[] {
  const out: Tile[] = [];
  for (let i = 0; i < wall.doraIndicatorCount; i++) {
    out.push(tileIdToTile(deadWallTileId(wall, 4 + i * 2), redDora));
  }
  return out;
}

/** 裏ドラ表示牌一覧（リーチ和了時のみ公開） */
export function getUraDoraIndicators(wall: WallState, redDora: boolean): Tile[] {
  const out: Tile[] = [];
  for (let i = 0; i < wall.doraIndicatorCount; i++) {
    out.push(tileIdToTile(deadWallTileId(wall, 5 + i * 2), redDora));
  }
  return out;
}

/** 嶺上牌を 1 枚取る（カン用）。kanCount は 0 始まり（最大 4）。 */
export function rinshanTileId(wall: WallState, kanCount: number): TileId {
  if (kanCount < 0 || kanCount > 3) throw new Error(`rinshanTileId: kanCount out of range`);
  // 嶺上は deadWall[3] → [2] → [1] → [0] の順に使う
  return deadWallTileId(wall, 3 - kanCount);
}
