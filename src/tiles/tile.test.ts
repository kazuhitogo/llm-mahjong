import { describe, it, expect } from 'vitest';
import {
  tile,
  tiles,
  tileKind,
  sameKind,
  isAkaDora,
  isHonor,
  isWind,
  isDragon,
  isTerminalOrHonor,
  sortTiles,
  kindToTile,
  indicatorToDora,
  tileIdToKind,
  tileIdToTile,
  isValidTileString,
} from './tile.js';
import type { TileId } from '../types/tile.js';

describe('tile()', () => {
  it('受理: 数牌・字牌・赤ドラ', () => {
    expect(tile('1m')).toBe('1m');
    expect(tile('9p')).toBe('9p');
    expect(tile('5s')).toBe('5s');
    expect(tile('1z')).toBe('1z');
    expect(tile('7z')).toBe('7z');
    expect(tile('0m')).toBe('0m');
  });
  it('拒否: 不正な文字列', () => {
    expect(() => tile('10m')).toThrow();
    expect(() => tile('8z')).toThrow();
    expect(() => tile('xs')).toThrow();
    expect(() => tile('')).toThrow();
  });
});

describe('isValidTileString()', () => {
  it('数牌は 0-9', () => {
    for (let n = 0; n <= 9; n++) {
      expect(isValidTileString(`${n}m`)).toBe(true);
    }
    expect(isValidTileString('10m')).toBe(false);
  });
  it('字牌は 1-7', () => {
    for (let n = 1; n <= 7; n++) {
      expect(isValidTileString(`${n}z`)).toBe(true);
    }
    expect(isValidTileString('0z')).toBe(false);
    expect(isValidTileString('8z')).toBe(false);
  });
});

describe('tileKind()', () => {
  it('萬子', () => {
    expect(tileKind(tile('1m'))).toBe(0);
    expect(tileKind(tile('9m'))).toBe(8);
  });
  it('筒子', () => {
    expect(tileKind(tile('1p'))).toBe(9);
    expect(tileKind(tile('9p'))).toBe(17);
  });
  it('索子', () => {
    expect(tileKind(tile('1s'))).toBe(18);
    expect(tileKind(tile('9s'))).toBe(26);
  });
  it('字牌', () => {
    expect(tileKind(tile('1z'))).toBe(27);
    expect(tileKind(tile('7z'))).toBe(33);
  });
  it('赤ドラは同スートの 5 と同じ kind', () => {
    expect(tileKind(tile('0m'))).toBe(tileKind(tile('5m')));
    expect(tileKind(tile('0p'))).toBe(tileKind(tile('5p')));
    expect(tileKind(tile('0s'))).toBe(tileKind(tile('5s')));
  });
});

describe('sameKind()', () => {
  it('同じ牌は同じ', () => {
    expect(sameKind(tile('5m'), tile('5m'))).toBe(true);
  });
  it('赤と通常 5 は同じ', () => {
    expect(sameKind(tile('0m'), tile('5m'))).toBe(true);
  });
  it('別スートは違う', () => {
    expect(sameKind(tile('5m'), tile('5p'))).toBe(false);
  });
});

describe('属性判定', () => {
  it('isAkaDora', () => {
    expect(isAkaDora(tile('0m'))).toBe(true);
    expect(isAkaDora(tile('5m'))).toBe(false);
  });
  it('isHonor', () => {
    expect(isHonor(tile('1z'))).toBe(true);
    expect(isHonor(tile('1m'))).toBe(false);
  });
  it('isWind', () => {
    expect(isWind(tile('1z'))).toBe(true);
    expect(isWind(tile('4z'))).toBe(true);
    expect(isWind(tile('5z'))).toBe(false);
  });
  it('isDragon', () => {
    expect(isDragon(tile('5z'))).toBe(true);
    expect(isDragon(tile('7z'))).toBe(true);
    expect(isDragon(tile('1z'))).toBe(false);
  });
  it('isTerminalOrHonor', () => {
    expect(isTerminalOrHonor(tile('1m'))).toBe(true);
    expect(isTerminalOrHonor(tile('9p'))).toBe(true);
    expect(isTerminalOrHonor(tile('1z'))).toBe(true);
    expect(isTerminalOrHonor(tile('5m'))).toBe(false);
    expect(isTerminalOrHonor(tile('0m'))).toBe(false);
  });
});

describe('sortTiles()', () => {
  it('スート順 → 数字順', () => {
    const sorted = sortTiles(tiles('3z', '1m', '9s', '5p', '1m', '0p'));
    expect(sorted.map(String)).toEqual(['1m', '1m', '0p', '5p', '9s', '3z']);
  });
  it('赤5 は通常 5 の直前', () => {
    const sorted = sortTiles(tiles('5m', '0m', '6m', '4m'));
    expect(sorted.map(String)).toEqual(['4m', '0m', '5m', '6m']);
  });
});

describe('kindToTile()', () => {
  it('全 34 種', () => {
    const result: string[] = [];
    for (let k = 0; k < 34; k++) {
      result.push(kindToTile(k as never));
    }
    expect(result).toEqual([
      '1m','2m','3m','4m','5m','6m','7m','8m','9m',
      '1p','2p','3p','4p','5p','6p','7p','8p','9p',
      '1s','2s','3s','4s','5s','6s','7s','8s','9s',
      '1z','2z','3z','4z','5z','6z','7z',
    ]);
  });
});

describe('indicatorToDora()', () => {
  it('数牌は次へ巡回', () => {
    expect(indicatorToDora(tile('1m'))).toBe(tileKind(tile('2m')));
    expect(indicatorToDora(tile('9m'))).toBe(tileKind(tile('1m')));
    expect(indicatorToDora(tile('9p'))).toBe(tileKind(tile('1p')));
    expect(indicatorToDora(tile('9s'))).toBe(tileKind(tile('1s')));
  });
  it('風牌は東→南→西→北→東', () => {
    expect(indicatorToDora(tile('1z'))).toBe(tileKind(tile('2z')));
    expect(indicatorToDora(tile('4z'))).toBe(tileKind(tile('1z')));
  });
  it('三元牌は白→發→中→白', () => {
    expect(indicatorToDora(tile('5z'))).toBe(tileKind(tile('6z')));
    expect(indicatorToDora(tile('7z'))).toBe(tileKind(tile('5z')));
  });
  it('赤5 が指したら 6 がドラ', () => {
    expect(indicatorToDora(tile('0m'))).toBe(tileKind(tile('6m')));
  });
});

describe('tileId 変換', () => {
  it('tileIdToKind: 4 枚で 1 種', () => {
    expect(tileIdToKind(0 as TileId)).toBe(0);
    expect(tileIdToKind(3 as TileId)).toBe(0);
    expect(tileIdToKind(4 as TileId)).toBe(1);
    expect(tileIdToKind(135 as TileId)).toBe(33);
  });
  it('tileIdToTile: 赤ドラ ON', () => {
    // 5m の copy 0,1,2,3 → 0m, 5m, 5m, 5m
    expect(tileIdToTile(16 as TileId, true)).toBe('0m');
    expect(tileIdToTile(17 as TileId, true)).toBe('5m');
    expect(tileIdToTile(52 as TileId, true)).toBe('0p');
    expect(tileIdToTile(88 as TileId, true)).toBe('0s');
  });
  it('tileIdToTile: 赤ドラ OFF', () => {
    expect(tileIdToTile(16 as TileId, false)).toBe('5m');
  });
  it('tileIdToTile: その他は通常牌', () => {
    expect(tileIdToTile(0 as TileId, true)).toBe('1m');
    expect(tileIdToTile(135 as TileId, true)).toBe('7z');
  });
});
