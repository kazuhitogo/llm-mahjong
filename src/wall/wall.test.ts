import { describe, it, expect } from 'vitest';
import {
  dealWall,
  drawTile,
  peekNextDraw,
  remainingDraws,
  getDoraIndicators,
  deadWallTileId,
  rinshanTileId,
} from './wall.js';
import { Mulberry32 } from './rng.js';

describe('Mulberry32', () => {
  it('同じ seed で同じ系列', () => {
    const a = new Mulberry32(42);
    const b = new Mulberry32(42);
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next());
    }
  });
  it('違う seed で違う系列', () => {
    const a = new Mulberry32(42);
    const b = new Mulberry32(43);
    let allSame = true;
    for (let i = 0; i < 10; i++) {
      if (a.next() !== b.next()) {
        allSame = false;
        break;
      }
    }
    expect(allSame).toBe(false);
  });
});

describe('dealWall — 構造', () => {
  it('layout は 136 牌、重複なし', () => {
    const { wall } = dealWall(42);
    expect(wall.layout.length).toBe(136);
    expect(new Set(wall.layout).size).toBe(136);
  });

  it('サイコロは 1〜6 の 2 個', () => {
    const { wall } = dealWall(42);
    expect(wall.dice[0]).toBeGreaterThanOrEqual(1);
    expect(wall.dice[0]).toBeLessThanOrEqual(6);
    expect(wall.dice[1]).toBeGreaterThanOrEqual(1);
    expect(wall.dice[1]).toBeLessThanOrEqual(6);
  });

  it('breakIndex は出目から決定的', () => {
    const { wall } = dealWall(42, 0);
    const sum = wall.dice[0] + wall.dice[1];
    const breakSeat = (sum - 1) % 4;
    expect(wall.breakIndex).toBe((breakSeat * 34 + sum * 2) % 136);
  });

  it('親席を変えると breakIndex も対応してずれる', () => {
    // 同じ seed → 同じシャッフル・同じサイコロだが、親席が違うと開門席が違う
    const a = dealWall(42, 0);
    const b = dealWall(42, 1);
    expect(a.wall.dice).toEqual(b.wall.dice);
    expect(a.wall.layout).toEqual(b.wall.layout);
    const sum = a.wall.dice[0] + a.wall.dice[1];
    const breakOff = (sum - 1) % 4;
    expect(a.wall.breakIndex).toBe(((0 + breakOff) % 4) * 34 + sum * 2);
    expect(b.wall.breakIndex).toBe(((1 + breakOff) % 4) * 34 + sum * 2);
  });
});

describe('dealWall — 配牌', () => {
  it('各プレイヤーに 13 枚配られる', () => {
    const { hands } = dealWall(42);
    for (const h of hands) {
      expect(h.length).toBe(13);
    }
  });

  it('配牌時点で drawnCount = 52', () => {
    const { wall } = dealWall(42);
    expect(wall.drawnCount).toBe(52);
  });

  it('配牌 52 枚はすべて layout の開門位置から連続した 52 牌', () => {
    const { hands, wall } = dealWall(42);
    const dealt = new Set([...hands[0], ...hands[1], ...hands[2], ...hands[3]]);
    for (let i = 0; i < 52; i++) {
      const id = wall.layout[(wall.breakIndex + i) % 136]!;
      expect(dealt.has(id)).toBe(true);
    }
  });

  it('配牌の重複なし', () => {
    const { hands } = dealWall(42);
    const all = [...hands[0], ...hands[1], ...hands[2], ...hands[3]];
    expect(new Set(all).size).toBe(52);
  });

  it('決定論性: 同じ seed で同じ手牌・同じサイコロ', () => {
    const a = dealWall(42);
    const b = dealWall(42);
    expect(a.hands).toEqual(b.hands);
    expect(a.wall.dice).toEqual(b.wall.dice);
    expect(a.wall.layout).toEqual(b.wall.layout);
    expect(a.wall.breakIndex).toBe(b.wall.breakIndex);
  });

  it('違う seed で違う配牌', () => {
    const a = dealWall(42);
    const b = dealWall(43);
    expect(a.hands).not.toEqual(b.hands);
  });
});

describe('drawTile / peekNextDraw', () => {
  it('peekNextDraw は破壊しない', () => {
    const { wall } = dealWall(42);
    const a = peekNextDraw(wall);
    const b = peekNextDraw(wall);
    expect(a).toBe(b);
    expect(wall.drawnCount).toBe(52); // 不変
  });

  it('drawTile で drawnCount が 1 増える', () => {
    const { wall } = dealWall(42);
    const r = drawTile(wall);
    expect(r).not.toBeNull();
    expect(r!.wall.drawnCount).toBe(53);
    expect(wall.drawnCount).toBe(52); // 元は不変
  });

  it('peekNextDraw と drawTile の牌は一致', () => {
    const { wall } = dealWall(42);
    const peek = peekNextDraw(wall);
    const r = drawTile(wall);
    expect(r!.tile).toBe(peek);
  });

  it('122 回目までは引けて、それ以降は null', () => {
    let { wall } = dealWall(42);
    for (let i = 0; i < 70; i++) {
      const r = drawTile(wall);
      expect(r).not.toBeNull();
      wall = r!.wall;
    }
    expect(remainingDraws(wall)).toBe(0);
    expect(drawTile(wall)).toBeNull();
  });

  it('カン（doraIndicatorCount 増）ごとに海底が 1 枚早まる', () => {
    const { wall } = dealWall(42);
    expect(remainingDraws(wall)).toBe(70);          // 槓数0
    const k1 = { ...wall, doraIndicatorCount: 2 };  // 1槓
    expect(remainingDraws(k1)).toBe(69);
    const k3 = { ...wall, doraIndicatorCount: 4 };  // 3槓
    expect(remainingDraws(k3)).toBe(67);
    // ライブ山残 1 の状態で 1 槓入ると即海底
    const near = { ...wall, drawnCount: 121 };       // 122-121=1
    expect(remainingDraws(near)).toBe(1);
    expect(remainingDraws({ ...near, doraIndicatorCount: 2 })).toBe(0);
    expect(drawTile({ ...near, doraIndicatorCount: 2 })).toBeNull();
  });
});

describe('王牌・ドラ', () => {
  it('配牌直後はドラ表示 1 枚', () => {
    const { wall } = dealWall(42);
    expect(getDoraIndicators(wall, true).length).toBe(1);
  });

  it('王牌の 14 牌はツモ範囲外', () => {
    const { wall } = dealWall(42);
    const dealtAndDrawn = new Set<number>();
    for (let i = 0; i < 122; i++) {
      dealtAndDrawn.add(wall.layout[(wall.breakIndex + i) % 136]!);
    }
    for (let i = 0; i < 14; i++) {
      const dw = deadWallTileId(wall, i);
      expect(dealtAndDrawn.has(dw)).toBe(false);
    }
    expect(dealtAndDrawn.size).toBe(122);
  });

  it('rinshanTileId は 0..3 を 3→0 順で返す', () => {
    const { wall } = dealWall(42);
    expect(rinshanTileId(wall, 0)).toBe(deadWallTileId(wall, 3));
    expect(rinshanTileId(wall, 1)).toBe(deadWallTileId(wall, 2));
    expect(rinshanTileId(wall, 2)).toBe(deadWallTileId(wall, 1));
    expect(rinshanTileId(wall, 3)).toBe(deadWallTileId(wall, 0));
  });
});
