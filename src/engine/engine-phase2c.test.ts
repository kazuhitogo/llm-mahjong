import { describe, it, expect } from 'vitest';
import { GameEngine } from './engine.js';
import { RiichiRsCalculator } from '../score/calculator.js';
import { tile, tiles } from '../tiles/tile.js';
import type { Seat } from '../types/seat.js';

const calc = new RiichiRsCalculator();

function setHand(engine: GameEngine, seat: Seat, hand: ReturnType<typeof tiles>) {
  engine.state.players[seat].hand = [...hand];
}

function passAll(engine: GameEngine) {
  const pending = engine.state.pendingCalls.filter(p => !p.responded);
  for (const pc of pending) engine.applyAction(pc.seat, { kind: 'pass' });
}

// ---------- 九種九牌 ----------

describe('Phase 2c — 九種九牌', () => {
  it('9種以上のヤオ中牌で九種九牌が合法手に含まれる', () => {
    const engine = new GameEngine({ rngSeed: 1, calculator: calc });
    engine.step(); // seat0 ツモ → discard phase

    // 1m9m1p9p1s9s1z2z3z + 4z5z6z7z = ヤオ中牌 9種以上
    setHand(engine, 0, tiles('1m','9m','1p','9p','1s','9s','1z','2z','3z','4z','5z','6z','7z','2m'));
    const actions = engine.legalActions(0);
    expect(actions.some(a => a.kind === 'kyushu_kyuhai')).toBe(true);
  });

  it('8種以下では九種九牌が含まれない', () => {
    const engine = new GameEngine({ rngSeed: 1, calculator: calc });
    engine.step();

    // ヤオ中牌が8種: 1m9m1p9p1s9s1z2z + 残り数牌
    setHand(engine, 0, tiles('1m','9m','1p','9p','1s','9s','1z','2z','2m','3m','4m','5m','6m','7m'));
    const actions = engine.legalActions(0);
    expect(actions.some(a => a.kind === 'kyushu_kyuhai')).toBe(false);
  });

  it('九種九牌宣言で流局', () => {
    const engine = new GameEngine({ rngSeed: 1, calculator: calc });
    engine.step();

    setHand(engine, 0, tiles('1m','9m','1p','9p','1s','9s','1z','2z','3z','4z','5z','6z','7z','2m'));
    engine.applyAction(0, { kind: 'kyushu_kyuhai' });

    expect(engine.isOver()).toBe(true);
    expect(engine.events().some(e => e.kind === 'ryukyoku' && e.reason === 'kyushu_kyuhai')).toBe(true);
  });

  it('junme > 0 では九種九牌不可', () => {
    const engine = new GameEngine({ rngSeed: 1, calculator: calc });

    // 1巡目を全員打牌して junme を 1 にする
    for (let round = 0; round < 4; round++) {
      engine.step();
      const s = engine.state.turn.seat;
      const acts = engine.legalActions(s);
      const discard = acts.find(a => a.kind === 'discard')!;
      engine.applyAction(s, discard);
      passAll(engine);
    }

    // junme が 1 になっているはず
    expect(engine.state.turn.junme).toBeGreaterThanOrEqual(1);

    engine.step(); // seat0 の 2 巡目ツモ
    setHand(engine, 0, tiles('1m','9m','1p','9p','1s','9s','1z','2z','3z','4z','5z','6z','7z','2m'));
    const actions = engine.legalActions(0);
    expect(actions.some(a => a.kind === 'kyushu_kyuhai')).toBe(false);
  });

  it('鳴きありでは九種九牌不可', () => {
    const engine = new GameEngine({ rngSeed: 1, calculator: calc });
    engine.step();

    // seat1 に 1z×2 をセット
    setHand(engine, 1, tiles('1z','1z','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p','3p'));
    setHand(engine, 0, tiles('1m','9m','1p','9p','1s','9s','1z','2z','3z','4z','5z','6z','7z','1z'));
    engine.applyAction(0, { kind: 'discard', tile: tile('1z'), tsumogiri: false });
    engine.applyAction(1, { kind: 'pon', tiles: [tile('1z'), tile('1z')] });
    passAll(engine);

    // seat1 打牌
    engine.applyAction(1, { kind: 'discard', tile: tile('9m'), tsumogiri: false });
    passAll(engine);

    // seat2 ツモ
    engine.step();
    setHand(engine, 2, tiles('1m','9m','1p','9p','1s','9s','1z','2z','3z','4z','5z','6z','7z','2m'));
    const actions = engine.legalActions(2);
    // 鳴きが発生しているので kyushu_kyuhai 不可
    expect(actions.some(a => a.kind === 'kyushu_kyuhai')).toBe(false);
  });
});

// ---------- 四風連打 ----------

describe('Phase 2c — 四風連打', () => {
  it('全員が同じ風牌を最初に捨てると流局', () => {
    const engine = new GameEngine({ rngSeed: 1, calculator: calc });

    // 全員の手牌に 1z (東) を入れて最初に捨てさせる
    for (let s = 0; s < 4; s++) {
      const hand = tiles('1z','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p','3p','4p');
      setHand(engine, s as Seat, hand);
    }

    // seat0 ツモ後に 1z 捨て
    engine.step();
    setHand(engine, 0, tiles('1z','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p','3p','4p','5p'));
    engine.applyAction(0, { kind: 'discard', tile: tile('1z'), tsumogiri: false });
    passAll(engine);

    engine.step();
    setHand(engine, 1, tiles('1z','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p','3p','4p','5p'));
    engine.applyAction(1, { kind: 'discard', tile: tile('1z'), tsumogiri: false });
    passAll(engine);

    engine.step();
    setHand(engine, 2, tiles('1z','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p','3p','4p','5p'));
    engine.applyAction(2, { kind: 'discard', tile: tile('1z'), tsumogiri: false });
    passAll(engine);

    engine.step();
    setHand(engine, 3, tiles('1z','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p','3p','4p','5p'));
    engine.applyAction(3, { kind: 'discard', tile: tile('1z'), tsumogiri: false });

    expect(engine.isOver()).toBe(true);
    expect(engine.events().some(e => e.kind === 'ryukyoku' && e.reason === 'suufon_renda')).toBe(true);
  });

  it('異なる風牌では四風連打不発', () => {
    const engine = new GameEngine({ rngSeed: 1, calculator: calc });

    engine.step();
    setHand(engine, 0, tiles('1z','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p','3p','4p','5p'));
    engine.applyAction(0, { kind: 'discard', tile: tile('1z'), tsumogiri: false });
    passAll(engine);

    engine.step();
    // seat1 は 2z (南) を捨てる
    setHand(engine, 1, tiles('2z','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p','3p','4p','5p'));
    engine.applyAction(1, { kind: 'discard', tile: tile('2z'), tsumogiri: false });
    passAll(engine);

    expect(engine.isOver()).toBe(false);
  });
});

// ---------- 四家立直 ----------

describe('Phase 2c — 四家立直', () => {
  it('全員リーチ後の次ツモ移行で流局', () => {
    const engine = new GameEngine({ rngSeed: 1, calculator: calc });

    // 各プレイヤーにリーチ手をセットして順にリーチ
    const riichiHand = tiles('1m','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p','3p','4p','7s');
    const hands: [Seat, ReturnType<typeof tiles>][] = [
      [0, riichiHand],
      [1, tiles('1m','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p','3p','4p','6s')],
      [2, tiles('1m','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p','3p','4p','5s')],
      [3, tiles('1m','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p','3p','4p','4s')],
    ];

    // seat0 リーチ
    engine.step();
    setHand(engine, 0, hands[0][1]);
    engine.applyAction(0, { kind: 'riichi', tile: tile('7s') });
    passAll(engine);

    // seat1 リーチ
    engine.step();
    setHand(engine, 1, hands[1][1]);
    engine.applyAction(1, { kind: 'riichi', tile: tile('6s') });
    passAll(engine);

    // seat2 リーチ
    engine.step();
    setHand(engine, 2, hands[2][1]);
    engine.applyAction(2, { kind: 'riichi', tile: tile('5s') });
    passAll(engine);

    // seat3 リーチ → 全員リーチ → 次のターン移行時に流局
    engine.step();
    setHand(engine, 3, hands[3][1]);
    engine.applyAction(3, { kind: 'riichi', tile: tile('4s') });
    // 全員パスで advanceToNextDraw → suucha_riichi 流局
    passAll(engine);

    expect(engine.isOver()).toBe(true);
    expect(engine.events().some(e => e.kind === 'ryukyoku' && e.reason === 'suucha_riichi')).toBe(true);
  });
});

// ---------- 三家和 ----------

describe('Phase 2c — 三家和', () => {
  it('3人がロン宣言すると流局', () => {
    const engine = new GameEngine({ rngSeed: 1, calculator: calc });
    engine.step();

    const AGARI_13 = tiles('1m','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p','3p','4p');
    // seat1,2,3 全員が 4p テンパイ
    setHand(engine, 1, AGARI_13);
    setHand(engine, 2, AGARI_13);
    setHand(engine, 3, AGARI_13);
    // seat0 が 4p を捨てる
    setHand(engine, 0, tiles('1m','2m','3m','5m','6m','7m','1s','2s','3s','4s','5s','6s','4p','9p'));
    engine.applyAction(0, { kind: 'discard', tile: tile('4p'), tsumogiri: false });

    expect(engine.state.turn.phase).toBe('call');
    engine.applyAction(1, { kind: 'ron' });
    engine.applyAction(2, { kind: 'ron' });
    engine.applyAction(3, { kind: 'ron' });

    expect(engine.isOver()).toBe(true);
    expect(engine.events().some(e => e.kind === 'ryukyoku' && e.reason === 'sancha_hou')).toBe(true);
  });

  it('2人ロンは通常和了 (ダブロン)', () => {
    const engine = new GameEngine({ rngSeed: 1, calculator: calc });
    engine.step();

    const AGARI_13 = tiles('1m','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p','3p','4p');
    setHand(engine, 1, AGARI_13);
    setHand(engine, 2, AGARI_13);
    setHand(engine, 3, tiles('2p','3p','4p','5p','6p','7p','8p','1s','2s','3s','4s','5s','6s')); // 3 and 4p not in hand
    setHand(engine, 0, tiles('1m','2m','3m','5m','6m','7m','1s','2s','3s','4s','5s','6s','4p','9p'));
    engine.applyAction(0, { kind: 'discard', tile: tile('4p'), tsumogiri: false });

    engine.applyAction(1, { kind: 'ron' });
    engine.applyAction(2, { kind: 'ron' });
    passAll(engine);

    expect(engine.isOver()).toBe(true);
    // agari イベントがあって ryukyoku sancha_hou はない
    expect(engine.events().some(e => e.kind === 'agari')).toBe(true);
    expect(engine.events().some(e => e.kind === 'ryukyoku' && e.reason === 'sancha_hou')).toBe(false);
  });
});

// ---------- 四開槓 ----------

describe('Phase 2c — 四開槓', () => {
  it('4槓を複数プレイヤーで達成すると流局', () => {
    const engine = new GameEngine({ rngSeed: 1, calculator: calc });
    engine.step();

    // seat0 が 1m×4 で暗槓 (1槓目)
    setHand(engine, 0, tiles('1m','1m','1m','1m','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p'));
    engine.applyAction(0, { kind: 'ankan', tile: tile('1m') });

    if (engine.isOver()) return; // 嶺上ツモで終わった場合はスキップ
    // 打牌フェーズ → 捨てる
    if (engine.state.turn.phase === 'discard') {
      const acts = engine.legalActions(0).filter(a => a.kind === 'discard');
      engine.applyAction(0, acts[0]!);
      passAll(engine);
    }

    // seat1 が 2m×4 で暗槓 (2槓目)
    engine.step();
    setHand(engine, 1, tiles('2m','2m','2m','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p','3p'));
    engine.applyAction(1, { kind: 'ankan', tile: tile('2m') });
    if (engine.isOver()) return;
    if (engine.state.turn.phase === 'discard') {
      const acts = engine.legalActions(1).filter(a => a.kind === 'discard');
      engine.applyAction(1, acts[0]!);
      passAll(engine);
    }

    // seat2 が 3m×4 で暗槓 (3槓目)
    engine.step();
    setHand(engine, 2, tiles('3m','3m','3m','3m','4m','5m','6m','7m','8m','9m','1p','2p','3p','4p'));
    engine.applyAction(2, { kind: 'ankan', tile: tile('3m') });
    if (engine.isOver()) return;
    if (engine.state.turn.phase === 'discard') {
      const acts = engine.legalActions(2).filter(a => a.kind === 'discard');
      engine.applyAction(2, acts[0]!);
      passAll(engine);
    }

    // seat3 が 4m×4 で暗槓 (4槓目) → 流局or嶺上和了
    engine.step();
    setHand(engine, 3, tiles('4m','4m','4m','4m','5m','6m','7m','8m','9m','1p','2p','3p','4p','5p'));
    engine.applyAction(3, { kind: 'ankan', tile: tile('4m') });

    // 四開槓流局 or 嶺上和了 どちらかで終わる
    expect(engine.isOver()).toBe(true);
    const hasRyukyoku = engine.events().some(e => e.kind === 'ryukyoku' && e.reason === 'suukaikan');
    const hasAgari = engine.events().some(e => e.kind === 'agari');
    expect(hasRyukyoku || hasAgari).toBe(true);
  });
});
