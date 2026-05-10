import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine } from './engine.js';
import { RiichiRsCalculator } from '../score/calculator.js';
import { tile, tiles } from '../tiles/tile.js';
import type { Seat } from '../types/seat.js';

const calc = new RiichiRsCalculator();

// 既知の和了手: 1m2m3m 4m5m6m 7m8m9m 1p2p3p 4p + ツモ4p → 14枚
const AGARI_HAND_14 = tiles('1m','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p','3p','4p','4p');
// 同手13枚 (ツモ前)
const AGARI_HAND_13 = tiles('1m','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p','3p','4p');
const WIN_TILE = tile('4p');

// 手牌を強制セットするヘルパー
function setHand(engine: GameEngine, seat: Seat, hand: ReturnType<typeof tiles>) {
  engine.state.players[seat].hand = [...hand];
}

describe('RiichiRsCalculator', () => {
  it('calculateAgari: 和了形を正しく判定', () => {
    const result = calc.calculateAgari({
      closedHand: AGARI_HAND_14,
      openMelds: [],
      winTile: WIN_TILE,
      isTsumo: true,
      seatWind: 'E',
      roundWind: 'E',
      doraIndicators: [],
      uraDoraIndicators: [],
      isRiichi: false,
      isIppatsu: false,
      isDoubleRiichi: false,
      isRinshan: false,
      isHaitei: false,
      isHoutei: false,
      isChankan: false,
      rules: { redDora: true, openTanyao: true },
    });
    expect(result.isAgari).toBe(true);
    expect(result.han).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(0);
  });

  it('calculateAgari: 非和了形を正しく棄却', () => {
    const nonAgari = tiles('1m','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p','3p','5p','7p');
    const result = calc.calculateAgari({
      closedHand: nonAgari,
      openMelds: [],
      winTile: tile('7p'),
      isTsumo: true,
      seatWind: 'E',
      roundWind: 'E',
      doraIndicators: [],
      uraDoraIndicators: [],
      isRiichi: false,
      isIppatsu: false,
      isDoubleRiichi: false,
      isRinshan: false,
      isHaitei: false,
      isHoutei: false,
      isChankan: false,
      rules: { redDora: true, openTanyao: true },
    });
    expect(result.isAgari).toBe(false);
  });

  it('calculateAgari: ロン', () => {
    const result = calc.calculateAgari({
      closedHand: AGARI_HAND_13,
      openMelds: [],
      winTile: WIN_TILE,
      isTsumo: false,
      seatWind: 'S',
      roundWind: 'E',
      doraIndicators: [],
      uraDoraIndicators: [],
      isRiichi: false,
      isIppatsu: false,
      isDoubleRiichi: false,
      isRinshan: false,
      isHaitei: false,
      isHoutei: false,
      isChankan: false,
      rules: { redDora: true, openTanyao: true },
    });
    expect(result.isAgari).toBe(true);
    expect(result.score).toBeGreaterThan(0);
  });

  it('waitTiles: テンパイ手の待ち牌を返す', () => {
    const waits = calc.waitTiles(AGARI_HAND_13, []);
    expect(waits.length).toBeGreaterThan(0);
    expect(waits.some(w => w === '4p' || w === '1p')).toBe(true);
  });

  it('calculateShanten: テンパイ=0', () => {
    expect(calc.calculateShanten(AGARI_HAND_13, [])).toBe(0);
  });

  it('calculateShanten: 1シャンテン=1', () => {
    // 13枚 1シャンテン: 3メンツ完成 + 2つの搭子
    const hand = tiles('1m','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p','4p','5p');
    expect(calc.calculateShanten(hand, [])).toBe(1);
  });

  it('riichiCandidates: リーチ打牌候補を返す', () => {
    // 14枚でリーチ候補があるはず
    const hand14 = tiles('1m','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p','3p','4p','7s');
    const candidates = calc.riichiCandidates(hand14, []);
    expect(candidates.length).toBeGreaterThan(0);
    // 7s を捨てると1p or 4p 待ちになる
    const sevenS = candidates.find(c => c.discard === '7s');
    expect(sevenS).toBeDefined();
  });
});

describe('GameEngine — Phase 2a (calculator あり)', () => {
  it('ツモ和了が合法手に含まれる', () => {
    const engine = new GameEngine({ rngSeed: 1, calculator: calc });
    engine.step(); // 東家ツモ
    // 手牌を和了形に強制セット
    setHand(engine, 0, AGARI_HAND_14);
    const actions = engine.legalActions(0);
    expect(actions.some(a => a.kind === 'tsumo')).toBe(true);
  });

  it('ツモ和了で局が終わる', () => {
    const engine = new GameEngine({ rngSeed: 1, calculator: calc });
    engine.step();
    setHand(engine, 0, AGARI_HAND_14);
    engine.applyAction(0, { kind: 'tsumo' });
    expect(engine.isOver()).toBe(true);
    const ev = engine.events().find(e => e.kind === 'agari');
    expect(ev).toBeDefined();
    if (ev?.kind === 'agari') {
      expect(ev.winner).toBe(0);
      expect(ev.from).toBe('tsumo');
      expect(ev.han).toBeGreaterThan(0);
    }
  });

  it('ツモ和了で点数授受が行われる', () => {
    const engine = new GameEngine({ rngSeed: 1, calculator: calc });
    const beforeScores = engine.state.players.map(p => p.score);
    engine.step();
    setHand(engine, 0, AGARI_HAND_14);
    engine.applyAction(0, { kind: 'tsumo' });
    const afterScores = engine.state.players.map(p => p.score);
    // 親(seat0)は増加、子は減少
    expect(afterScores[0]).toBeGreaterThan(beforeScores[0]!);
    expect(afterScores[1]).toBeLessThan(beforeScores[1]!);
    expect(afterScores[2]).toBeLessThan(beforeScores[2]!);
    expect(afterScores[3]).toBeLessThan(beforeScores[3]!);
    // 合計点数は不変
    const before = beforeScores.reduce((s, x) => s + x!, 0);
    const after = afterScores.reduce((s, x) => s + x!, 0);
    expect(after).toBe(before);
  });

  it('リーチ宣言が合法手に含まれる', () => {
    const engine = new GameEngine({ rngSeed: 1, calculator: calc });
    engine.step();
    // テンパイ手 + 余剰牌 を設定
    const riichiHand = tiles('1m','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p','3p','4p','7s');
    setHand(engine, 0, riichiHand);
    const actions = engine.legalActions(0);
    expect(actions.some(a => a.kind === 'riichi')).toBe(true);
  });

  it('リーチ宣言で1000点減点・供託増加', () => {
    const engine = new GameEngine({ rngSeed: 1, calculator: calc });
    engine.step();
    const riichiHand = tiles('1m','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p','3p','4p','7s');
    setHand(engine, 0, riichiHand);

    const scoreBefore = engine.state.players[0].score;
    const sticksBefore = engine.state.round.riichiSticks;

    engine.applyAction(0, { kind: 'riichi', tile: tile('7s') });

    expect(engine.state.players[0].score).toBe(scoreBefore - 1000);
    expect(engine.state.round.riichiSticks).toBe(sticksBefore + 1);
    expect(engine.state.players[0].riichi?.declared).toBe(true);
  });

  it('リーチ後はツモ切りのみ合法', () => {
    const engine = new GameEngine({ rngSeed: 1, calculator: calc });
    engine.step();
    const riichiHand = tiles('1m','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p','3p','4p','7s');
    setHand(engine, 0, riichiHand);
    engine.applyAction(0, { kind: 'riichi', tile: tile('7s') });

    // 次の番まで進める
    let safety = 20;
    while (engine.state.turn.seat !== 0 && safety-- > 0) {
      const phase = engine.state.turn.phase;
      if (phase === 'draw') {
        engine.step();
      } else if (phase === 'discard') {
        const s = engine.state.turn.seat;
        const acts = engine.legalActions(s);
        engine.applyAction(s, acts[0]!);
      } else if (phase === 'call') {
        const pending = engine.state.pendingCalls.filter(p => !p.responded);
        for (const pc of pending) {
          engine.applyAction(pc.seat, { kind: 'pass' });
        }
      }
    }

    if (engine.state.turn.seat === 0 && !engine.isOver()) {
      engine.step();
      if (engine.state.turn.phase === 'discard') {
        const actions = engine.legalActions(0);
        // リーチ後はツモ切りのみ
        const discards = actions.filter(a => a.kind === 'discard');
        expect(discards.length).toBe(1);
        expect(discards[0]!.tsumogiri).toBe(true);
      }
    }
  });

  it('ロン: call phase に移行し、ロン宣言で和了', () => {
    const engine = new GameEngine({ rngSeed: 1, calculator: calc });
    engine.step();

    // seat0 (東家) に 13 枚の何でもない手を与える
    // seat1 に 13 枚のテンパイ手を与える（4p待ち）
    setHand(engine, 1, AGARI_HAND_13);

    // seat0 が 4p を捨てる → seat1 がロン可能 → call phase
    setHand(engine, 0, tiles('1m','2m','3m','4m','5m','6m','7m','8m','9m','1s','2s','3s','4p','9s'));
    engine.applyAction(0, { kind: 'discard', tile: tile('4p'), tsumogiri: false });

    expect(engine.state.turn.phase).toBe('call');
    const pending = engine.state.pendingCalls;
    expect(pending.some(p => p.seat === 1 && p.canRon)).toBe(true);

    // seat1 がロン宣言
    engine.applyAction(1, { kind: 'ron' });
    expect(engine.isOver()).toBe(true);

    const ev = engine.events().find(e => e.kind === 'agari');
    expect(ev?.kind === 'agari' && ev.winner).toBe(1);
    expect(ev?.kind === 'agari' && ev.from).toBe(0);
  });

  it('ロン: パスすると call phase 解消・次のツモへ', () => {
    const engine = new GameEngine({ rngSeed: 1, calculator: calc });
    engine.step();

    setHand(engine, 1, AGARI_HAND_13);
    setHand(engine, 0, tiles('1m','2m','3m','4m','5m','6m','7m','8m','9m','1s','2s','3s','4p','9s'));
    engine.applyAction(0, { kind: 'discard', tile: tile('4p'), tsumogiri: false });

    expect(engine.state.turn.phase).toBe('call');
    engine.applyAction(1, { kind: 'pass' });

    // call phase 解消 → 次のドローへ
    expect(engine.state.turn.phase).toBe('draw');
    expect(engine.state.turn.seat).toBe(1);
  });

  it('calculator あり: 全局ループが正常終了する', () => {
    const engine = new GameEngine({ rngSeed: 99, calculator: calc });
    let safety = 600;
    while (!engine.isOver() && safety-- > 0) {
      const phase = engine.state.turn.phase;
      if (phase === 'draw') {
        engine.step();
      } else if (phase === 'discard') {
        const s = engine.state.turn.seat;
        const acts = engine.legalActions(s);
        engine.applyAction(s, acts[0]!);
      } else if (phase === 'call') {
        const pending = engine.state.pendingCalls.filter(p => !p.responded);
        for (const pc of pending) {
          engine.applyAction(pc.seat, { kind: 'pass' });
        }
      }
    }
    expect(engine.isOver()).toBe(true);
  });
});
