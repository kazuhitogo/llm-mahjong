/**
 * 牌の表現。
 *
 * - 文字列形式: "1m"〜"9m" (萬子), "1p"〜"9p" (筒子), "1s"〜"9s" (索子),
 *   "1z"〜"7z" (字牌: 東南西北白發中), "0m"/"0p"/"0s" (赤5)
 * - TileId: 0〜135 の通し番号。山生成・配牌の決定論的再現に使用
 *
 * 内部状態は基本 TileId で扱い、LLM やログには Tile 文字列を使う。
 */

export type Suit = 'm' | 'p' | 's' | 'z';

/**
 * 牌の文字列表現（branded string）。
 * 直接生成せず、tiles モジュールのコンストラクタを通すこと。
 */
export type Tile = string & { readonly __tile: unique symbol };

/**
 * 山の中での通し番号 0〜135。
 * 同じ Tile (例: 5m) は基本 4 つあるが、TileId は別物として区別される（赤ドラ識別のため）。
 */
export type TileId = number & { readonly __tileId: unique symbol };

/**
 * 牌の種類（赤ドラを区別しない）。0〜33 の整数。
 *   0〜8:   1m〜9m
 *   9〜17:  1p〜9p
 *   18〜26: 1s〜9s
 *   27〜33: 東南西北白發中
 */
export type TileKind = number & { readonly __tileKind: unique symbol };
