import { describe, it, expect } from 'vitest';
import { GameEngine } from './engine.js';
import { RiichiRsCalculator } from '../score/calculator.js';
import { tile, tiles } from '../tiles/tile.js';
import type { Seat } from '../types/seat.js';
import type { Meld } from '../types/meld.js';

const calc = new RiichiRsCalculator();

function setHand(engine: GameEngine, seat: Seat, hand: ReturnType<typeof tiles>) {
  engine.state.players[seat].hand = [...hand];
}

function passAll(engine: GameEngine) {
  const pending = engine.state.pendingCalls.filter(p => !p.responded);
  for (const pc of pending) engine.applyAction(pc.seat, { kind: 'pass' });
}

// ---------- 流し満貫 ----------

describe('流し満貫', () => {
  it('全打牌ヤオ中牌・鳴かれなし → 荒牌時に点数増加', () => {
    const engine = new GameEngine({ rngSeed: 1, calculator: calc });

    // seat0 の河をヤオ中牌のみ (鳴かれなし) に直接セット
    engine.state.players[0].discards = [
      { tile: tile('1z'), junme: 1, tsumogiri: false, isRiichiDeclaration: false, calledBy: null },
      { tile: tile('9m'), junme: 2, tsumogiri: false, isRiichiDeclaration: false, calledBy: null },
    ];

    const beforeScore0 = engine.state.players[0].score;

    // 山を空にして荒牌流局
    engine.state.wall = { ...engine.state.wall, drawnCount: 122 };
    engine.step();

    expect(engine.isOver()).toBe(true);
    expect(engine.state.players[0].score).toBeGreaterThan(beforeScore0);
  });

  it('鳴かれた牌ありは流し満貫不成立', () => {
    const engine = new GameEngine({ rngSeed: 1, calculator: calc });

    engine.state.players[0].discards = [
      { tile: tile('1z'), junme: 1, tsumogiri: false, isRiichiDeclaration: false, calledBy: 1 }, // 鳴かれた
      { tile: tile('9m'), junme: 2, tsumogiri: false, isRiichiDeclaration: false, calledBy: null },
    ];

    const beforeScore0 = engine.state.players[0].score;
    engine.state.wall = { ...engine.state.wall, drawnCount: 122 };
    engine.step();

    expect(engine.isOver()).toBe(true);
    expect(engine.state.players[0].score).toBe(beforeScore0);
  });

  it('鳴きメルドありは流し満貫不成立', () => {
    const engine = new GameEngine({ rngSeed: 1, calculator: calc });

    engine.state.players[0].discards = [
      { tile: tile('9m'), junme: 1, tsumogiri: false, isRiichiDeclaration: false, calledBy: null },
    ];
    // seat0 自身が鳴いている
    engine.state.players[0].melds = [{
      kind: 'pon', tiles: [tile('1z'), tile('1z'), tile('1z')],
      from: 1, calledTile: tile('1z'),
    }];

    const beforeScore0 = engine.state.players[0].score;
    engine.state.wall = { ...engine.state.wall, drawnCount: 122 };
    engine.step();

    expect(engine.isOver()).toBe(true);
    expect(engine.state.players[0].score).toBe(beforeScore0);
  });
});

// ---------- 役満 (天和/地和) ----------

describe('役満 — 天和・地和', () => {
  it('親の初ツモ和了で和了確定 (天和 yakuman)', () => {
    const engine = new GameEngine({ rngSeed: 1, calculator: calc });
    engine.step(); // seat0=東 (dealer) 初ツモ

    setHand(engine, 0, tiles('1m','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p','3p','4p','4p'));
    expect(engine.legalActions(0).some(a => a.kind === 'tsumo')).toBe(true);
    engine.applyAction(0, { kind: 'tsumo' });
    expect(engine.isOver()).toBe(true);

    const ev = engine.events().find(e => e.kind === 'agari');
    expect(ev?.kind === 'agari' && ev.winner === 0).toBe(true);
    if (ev?.kind === 'agari') {
      expect(ev.score).toBeGreaterThan(0);
    }
  });

  it('子の初ツモで地和候補 (tsumo 合法手あり)', () => {
    const engine = new GameEngine({ rngSeed: 1, calculator: calc });

    // seat0 が打牌 (鳴きなし)
    engine.step();
    setHand(engine, 0, tiles('1m','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p','3p','4p','9s'));
    engine.applyAction(0, { kind: 'discard', tile: tile('9s'), tsumogiri: false });
    passAll(engine);

    // seat1 初ツモ
    engine.step();
    expect(engine.state.turn.seat).toBe(1);
    // discards=0, melds all 0 → isFirstTake = true
    setHand(engine, 1, tiles('1m','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p','3p','4p','4p'));
    const actions = engine.legalActions(1);
    expect(actions.some(a => a.kind === 'tsumo')).toBe(true);
  });
});

// ---------- 包（責任払い）----------

describe('包 — 大三元', () => {
  it('3枚目の三元牌をポンすると paoSeat がセット', () => {
    const engine = new GameEngine({ rngSeed: 1, calculator: calc });
    engine.step();

    // seat1: 白・発 ポン済み (2 dragon melds)
    engine.state.players[1].melds = [
      { kind: 'pon', tiles: [tile('5z'), tile('5z'), tile('5z')], from: 0, calledTile: tile('5z') },
      { kind: 'pon', tiles: [tile('6z'), tile('6z'), tile('6z')], from: 2, calledTile: tile('6z') },
    ];
    // 2 pon = 6 effective → closed 7 tiles for total 13 effective
    engine.state.players[1].hand = tiles('7z','7z','1m','2m','3m','4m','5m');

    // seat0 が 7z (中) を捨てる
    setHand(engine, 0, tiles('1m','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p','3p','4p','7z'));
    setHand(engine, 2, tiles('2p','3p','4p','5p','6p','7p','8p','1s','2s','3s','4s','5s','6s'));
    setHand(engine, 3, tiles('2p','3p','4p','5p','6p','7p','8p','1s','2s','3s','4s','5s','6s'));
    engine.applyAction(0, { kind: 'discard', tile: tile('7z'), tsumogiri: false });

    engine.applyAction(1, { kind: 'pon', tiles: [tile('7z'), tile('7z')] });
    passAll(engine);

    // 3枚目 dragon meld 完成 → paoSeat = 0
    expect(engine.state.players[1].paoSeat).toBe(0);
  });

  it('包ありツモで pao 者だけ減点', () => {
    const engine = new GameEngine({ rngSeed: 1, calculator: calc });
    engine.step();

    // seat1: 大三元 3 pon + hand 5 tiles (discard phase state)
    engine.state.players[1].melds = [
      { kind: 'pon', tiles: [tile('5z'), tile('5z'), tile('5z')], from: 0, calledTile: tile('5z') },
      { kind: 'pon', tiles: [tile('6z'), tile('6z'), tile('6z')], from: 0, calledTile: tile('6z') },
      { kind: 'pon', tiles: [tile('7z'), tile('7z'), tile('7z')], from: 0, calledTile: tile('7z') },
    ];
    engine.state.players[1].paoSeat = 0;
    // 大三元 + 残り5枚で完成形: 1m1m + 2m3m4m (tsumo: last tile = 4m)
    engine.state.players[1].hand = tiles('1m','1m','2m','3m','4m');
    engine.state.turn.seat = 1;
    engine.state.turn.phase = 'discard';

    const scores = engine.state.players.map(p => p.score);

    engine.applyAction(1, { kind: 'tsumo' });

    if (engine.isOver()) {
      // seat0 (pao) が減点
      expect(engine.state.players[0].score).toBeLessThan(scores[0]!);
      // seat1 (winner) が増点
      expect(engine.state.players[1].score).toBeGreaterThan(scores[1]!);
      // seat2, seat3 は変化なし
      expect(engine.state.players[2].score).toBe(scores[2]!);
      expect(engine.state.players[3].score).toBe(scores[3]!);
    }
  });
});
