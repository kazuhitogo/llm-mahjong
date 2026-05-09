import type { Tile, TileId, TileKind, Suit } from '../types/tile.js';

/**
 * Tile 文字列を生成。直接 cast せずこの関数を通すこと。
 * 妥当性を検証する。
 */
export function tile(s: string): Tile {
  if (!isValidTileString(s)) {
    throw new Error(`Invalid tile string: "${s}"`);
  }
  return s as Tile;
}

/** 妥当な Tile 文字列か */
export function isValidTileString(s: string): boolean {
  if (s.length !== 2) return false;
  const num = s[0];
  const suit = s[1];
  if (suit === 'm' || suit === 'p' || suit === 's') {
    return /^[0-9]$/.test(num!);
  }
  if (suit === 'z') {
    return /^[1-7]$/.test(num!);
  }
  return false;
}

/** 配列を一括で Tile 化 */
export function tiles(...ss: string[]): Tile[] {
  return ss.map(tile);
}

/**
 * Tile を TileKind (0..33) に変換（赤ドラは通常牌として扱う）。
 *   1m..9m -> 0..8
 *   1p..9p -> 9..17
 *   1s..9s -> 18..26
 *   1z..7z -> 27..33
 *   赤5 (0m, 0p, 0s) -> 5m, 5p, 5s と同じ kind
 */
export function tileKind(t: Tile): TileKind {
  const num = t[0]!;
  const suit = t[1] as Suit;
  const n = num === '0' ? 5 : Number(num);
  switch (suit) {
    case 'm': return (n - 1) as TileKind;
    case 'p': return (n + 8) as TileKind;
    case 's': return (n + 17) as TileKind;
    case 'z': return (n + 26) as TileKind;
  }
}

/** 同じ牌種か（赤ドラと通常を同一視） */
export function sameKind(a: Tile, b: Tile): boolean {
  return tileKind(a) === tileKind(b);
}

/** 赤ドラか */
export function isAkaDora(t: Tile): boolean {
  return t[0] === '0';
}

/** 字牌か */
export function isHonor(t: Tile): boolean {
  return t[1] === 'z';
}

/** 風牌か（東南西北） */
export function isWind(t: Tile): boolean {
  return t[1] === 'z' && '1234'.includes(t[0]!);
}

/** 三元牌か（白發中） */
export function isDragon(t: Tile): boolean {
  return t[1] === 'z' && '567'.includes(t[0]!);
}

/** ヤオチュー牌（1,9,字牌） */
export function isTerminalOrHonor(t: Tile): boolean {
  if (isHonor(t)) return true;
  const num = t[0] === '0' ? '5' : t[0]!;
  return num === '1' || num === '9';
}

/**
 * ソート順序キー。萬子→筒子→索子→字牌、各スート内で数字順。
 * 赤ドラ (0) は同じスートの 5 と等価扱いで、5 のすぐ前に並べる。
 */
export function tileSortKey(t: Tile): number {
  const suit = t[1] as Suit;
  const num = t[0]!;
  const suitOrder: Record<Suit, number> = { m: 0, p: 1, s: 2, z: 3 };
  // 赤5 は通常 5 のすぐ前 (4.5 相当) に並べる
  const numKey = num === '0' ? 4.5 : Number(num);
  return suitOrder[suit] * 100 + numKey * 10;
}

/** 牌列をソート（in-place ではなく新しい配列を返す） */
export function sortTiles(ts: readonly Tile[]): Tile[] {
  return [...ts].sort((a, b) => tileSortKey(a) - tileSortKey(b));
}

/**
 * TileKind から代表的な Tile 文字列を生成（赤ドラなし）。
 * ドラめくり等で使う。
 */
export function kindToTile(k: TileKind): Tile {
  if (k < 9) return tile(`${k + 1}m`);
  if (k < 18) return tile(`${k - 8}p`);
  if (k < 27) return tile(`${k - 17}s`);
  return tile(`${k - 26}z`);
}

/**
 * ドラ表示牌から実際のドラ牌種を返す。
 *   9m -> 1m, 9p -> 1p, 9s -> 1s
 *   北 (4z) -> 東 (1z)
 *   中 (7z) -> 白 (5z)
 */
export function indicatorToDora(indicator: Tile): TileKind {
  const k = tileKind(indicator);
  if (k < 9) return ((k + 1) % 9) as TileKind;
  if (k < 18) return ((k + 1) % 9 + 9) as TileKind;
  if (k < 27) return ((k + 1) % 9 + 18) as TileKind;
  // 字牌: 風(27..30) と 三元(31..33) はそれぞれ巡回
  if (k < 31) return ((k - 27 + 1) % 4 + 27) as TileKind;
  return ((k - 31 + 1) % 3 + 31) as TileKind;
}

/** TileId (0..135) → TileKind */
export function tileIdToKind(id: TileId): TileKind {
  // 各 TileKind に 4 枚ずつ。id = kind * 4 + copyIndex
  return Math.floor(id / 4) as TileKind;
}

/**
 * TileId → Tile。赤ドラは特定の copyIndex に割り当てる。
 * 慣例: 5m/5p/5s の copyIndex=0 を赤ドラとする。
 *   → TileId が 4*4+0 = 16 (5m赤), 4*13+0 = 52 (5p赤), 4*22+0 = 88 (5s赤)
 */
export function tileIdToTile(id: TileId, redDora: boolean): Tile {
  const kind = tileIdToKind(id);
  const copyIdx = id % 4;
  if (redDora && copyIdx === 0) {
    if (kind === 4) return tile('0m'); // 5m 赤
    if (kind === 13) return tile('0p'); // 5p 赤
    if (kind === 22) return tile('0s'); // 5s 赤
  }
  return kindToTile(kind);
}

/** 全 Tile 文字列の一覧（赤ドラ含む） */
export const ALL_TILES: readonly Tile[] = (() => {
  const out: Tile[] = [];
  for (const suit of ['m', 'p', 's'] as const) {
    for (let n = 1; n <= 9; n++) out.push(tile(`${n}${suit}`));
    out.push(tile(`0${suit}`));
  }
  for (let n = 1; n <= 7; n++) out.push(tile(`${n}z`));
  return out;
})();
