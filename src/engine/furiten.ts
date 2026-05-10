import type { PlayerState } from '../types/state.js';
import type { Tile } from '../types/tile.js';
import { tileKind } from '../tiles/tile.js';

/** 自家河フリテン: 過去の捨て牌に待ち牌が含まれるか */
export function isSelfDiscardFuriten(player: PlayerState, waitTiles: Tile[]): boolean {
  if (waitTiles.length === 0) return false;
  const waitKinds = new Set(waitTiles.map(tileKind));
  return player.discards.some(d => waitKinds.has(tileKind(d.tile)));
}

/** 打牌後にフリテン状態を更新する (自家河フリテン) */
export function updateFuritenAfterDraw(player: PlayerState, waitTiles: Tile[]): boolean {
  return isSelfDiscardFuriten(player, waitTiles);
}

/** ロンをパスしたプレイヤーのフリテン更新 */
export function applyPassFuriten(
  player: PlayerState,
  _discardedTile: Tile,
): PlayerState {
  if (player.riichi) {
    // リーチ後パス → 永続フリテン（自摸和了のみ可能）
    return { ...player, isFuriten: true };
  }
  // 非リーチ時は同巡フリテン (一時的) → isFuriten を true に
  return { ...player, isFuriten: true };
}

/** 自分の打牌後にフリテンを解除する（同巡フリテンのリセット）
 *  ただしリーチ後フリテンは永続なので解除しない */
export function resetSameTurnFuriten(player: PlayerState, waitTiles: Tile[]): PlayerState {
  if (player.riichi && player.isFuriten) {
    // リーチ後フリテンは永続
    return player;
  }
  // 自家河フリテンは再計算
  const furitened = isSelfDiscardFuriten(player, waitTiles);
  return { ...player, isFuriten: furitened };
}
