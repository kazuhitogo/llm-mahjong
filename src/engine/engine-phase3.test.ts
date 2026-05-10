import { describe, it, expect } from 'vitest';
import { GameEngine } from './engine.js';
import { HanchanEngine } from './hanchan.js';
import { RiichiRsCalculator } from '../score/calculator.js';
import { computeStandings } from '../score/standings.js';
import { computeNotenPayout } from '../score/payout.js';
import { tile, tiles } from '../tiles/tile.js';
import type { Seat } from '../types/seat.js';

const calc = new RiichiRsCalculator();

const AGARI_HAND_14 = tiles('1m','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p','3p','4p','4p');
const AGARI_HAND_13 = tiles('1m','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p','3p','4p');

function passAll(engine: GameEngine) {
  const pending = engine.state.pendingCalls.filter(p => !p.responded);
  for (const pc of pending) engine.applyAction(pc.seat, { kind: 'pass' });
}

// ---------- ノーテン罰符 ----------

describe('computeNotenPayout', () => {
  it('1人テンパイ: ノーテン3人が各1000払い', () => {
    const deltas = computeNotenPayout([0]);
    const map = Object.fromEntries(deltas.map(d => [d.seat, d.delta]));
    expect(map[0]).toBe(3000);
    expect(map[1]).toBe(-1000);
    expect(map[2]).toBe(-1000);
    expect(map[3]).toBe(-1000);
  });

  it('2人テンパイ: ノーテン2人が各1500払い', () => {
    const deltas = computeNotenPayout([0, 2]);
    const map = Object.fromEntries(deltas.map(d => [d.seat, d.delta]));
    expect(map[0]).toBe(1500);
    expect(map[2]).toBe(1500);
    expect(map[1]).toBe(-1500);
    expect(map[3]).toBe(-1500);
  });

  it('3人テンパイ: ノーテン1人が3000払い', () => {
    const deltas = computeNotenPayout([0, 1, 2]);
    const map = Object.fromEntries(deltas.map(d => [d.seat, d.delta]));
    expect(map[3]).toBe(-3000);
    expect(map[0]).toBe(1000);
    expect(map[1]).toBe(1000);
    expect(map[2]).toBe(1000);
  });

  it('0人・4人テンパイ: 移動なし', () => {
    expect(computeNotenPayout([])).toHaveLength(0);
    expect(computeNotenPayout([0,1,2,3])).toHaveLength(0);
  });
});

// ---------- 荒牌流局のノーテン罰符 ----------

describe('GameEngine — 荒牌流局ノーテン罰符', () => {
  it('テンパイ1人 → スコア変動', () => {
    const engine = new GameEngine({ rngSeed: 1, calculator: calc });

    // seat0 をテンパイにして他は非テンパイに
    engine.state.players[0].hand = AGARI_HAND_13;
    engine.state.players[1].hand = tiles('1m','3m','5m','7m','9m','2p','4p','6p','8p','1s','3s','5s','7s');
    engine.state.players[2].hand = tiles('1m','3m','5m','7m','9m','2p','4p','6p','8p','1s','3s','5s','7s');
    engine.state.players[3].hand = tiles('1m','3m','5m','7m','9m','2p','4p','6p','8p','1s','3s','5s','7s');

    const scores = engine.state.players.map(p => p.score);
    engine.state.wall = { ...engine.state.wall, drawnCount: 122 };
    engine.step();

    expect(engine.isOver()).toBe(true);
    expect(engine.state.players[0].score).toBeGreaterThan(scores[0]!);
    expect(engine.state.players[1].score).toBeLessThan(scores[1]!);

    const ev = engine.events().find(e => e.kind === 'ryukyoku' && e.reason === 'exhaustive_draw');
    expect(ev?.kind === 'ryukyoku' && ev.tenpaiSeats).toContain(0);
  });

  it('全員ノーテン → スコア変動なし', () => {
    const engine = new GameEngine({ rngSeed: 1, calculator: calc });
    const noTenpai = tiles('1m','3m','5m','7m','9m','2p','4p','6p','8p','1s','3s','5s','7s');
    for (let i = 0; i < 4; i++) engine.state.players[i as Seat].hand = [...noTenpai];

    const scores = engine.state.players.map(p => p.score);
    engine.state.wall = { ...engine.state.wall, drawnCount: 122 };
    engine.step();

    expect(engine.isOver()).toBe(true);
    for (let i = 0; i < 4; i++) {
      expect(engine.state.players[i as Seat].score).toBe(scores[i]!);
    }
  });
});

// ---------- 順位計算 ----------

describe('computeStandings', () => {
  const config = { startingPoints: 25000, returnPoints: 30000, uma: [10, 5, -5, -10] as [number,number,number,number] };

  it('基本ケース: sum = 0', () => {
    const standings = computeStandings([40000, 30000, 20000, 10000], config);
    const sum = standings.reduce((s, x) => s + x.finalScore, 0);
    expect(Math.round(sum)).toBe(0);
  });

  it('1位 seat が正しい', () => {
    const standings = computeStandings([40000, 30000, 20000, 10000], config);
    expect(standings[0]!.seat).toBe(0);
    expect(standings[0]!.rank).toBe(1);
  });

  it('同点は座席番号小さい方が上位', () => {
    const standings = computeStandings([30000, 30000, 25000, 15000], config);
    const first = standings.find(s => s.rank === 1)!;
    const second = standings.find(s => s.rank === 2)!;
    expect(first.seat).toBeLessThan(second.seat);
  });
});

// ---------- HanchanEngine ----------

describe('HanchanEngine — 半荘進行', () => {
  function autoPlayKyoku(hanchan: HanchanEngine) {
    const engine = hanchan.engine;
    let safety = 800;
    while (!engine.isOver() && safety-- > 0) {
      const phase = engine.state.turn.phase;
      if (phase === 'draw') {
        engine.step();
      } else if (phase === 'discard') {
        const s = engine.state.turn.seat;
        const acts = engine.legalActions(s);
        // tsumo 優先、次に通常打牌（リーチ宣言は避ける）
        const act = acts.find(a => a.kind === 'tsumo')
          ?? acts.find(a => a.kind === 'discard')
          ?? acts[0]!;
        engine.applyAction(s, act);
      } else if (phase === 'call') {
        const pending = engine.state.pendingCalls.filter(p => !p.responded);
        for (const pc of pending) engine.applyAction(pc.seat, { kind: 'pass' });
      }
    }
  }

  it('半荘が正常終了し standings が返る', () => {
    const hanchan = new HanchanEngine({ rngSeed: 42, calculator: calc });
    let safety = 200;
    while (!hanchan.isGameOver() && safety-- > 0) {
      autoPlayKyoku(hanchan);
      if (!hanchan.isGameOver()) hanchan.advanceKyoku();
    }
    expect(hanchan.isGameOver()).toBe(true);
    const standings = hanchan.standings();
    expect(standings).toHaveLength(4);
    // ランクは 1-4 各1つ
    const ranks = standings.map(s => s.rank).sort();
    expect(ranks).toEqual([1, 2, 3, 4]);
    // finalScore の合計 ≈ 0
    const sum = standings.reduce((s, x) => s + x.finalScore, 0);
    expect(Math.abs(sum)).toBeLessThan(1);
  });

  it('飛びで即終了', () => {
    const hanchan = new HanchanEngine({ rngSeed: 1, calculator: calc });
    // seat0 のスコアを -1 にして飛び状態に
    hanchan.engine.state.players[0].score = -1;
    // 局を強制終了
    hanchan.engine.state.wall = { ...hanchan.engine.state.wall, drawnCount: 122 };
    hanchan.engine.step();
    expect(hanchan.engine.isOver()).toBe(true);
    hanchan.advanceKyoku();
    expect(hanchan.isGameOver()).toBe(true);
  });

  it('東4局終了後 tonpu は game over', () => {
    const hanchan = new HanchanEngine({
      rngSeed: 99,
      calculator: calc,
      rules: { gameLength: 'tonpu' },
    });
    let safety = 100;
    while (!hanchan.isGameOver() && safety-- > 0) {
      autoPlayKyoku(hanchan);
      if (!hanchan.isGameOver()) hanchan.advanceKyoku();
    }
    expect(hanchan.isGameOver()).toBe(true);
    // tonpu は東4局で終わるので最大8局（連荘あり）
    expect(hanchan.kyokuLogs.length).toBeGreaterThanOrEqual(4);
  });

  it('親が和了 → 連荘（同じ seat が dealer に）', () => {
    const hanchan = new HanchanEngine({ rngSeed: 1, calculator: calc });
    const engine = hanchan.engine;
    const dealerBefore = engine.state.dealerSeat;

    // 親に和了形を与えて即ツモ
    engine.step();
    engine.state.players[dealerBefore].hand = [...AGARI_HAND_14];
    engine.applyAction(dealerBefore, { kind: 'tsumo' });
    expect(engine.isOver()).toBe(true);

    hanchan.advanceKyoku();
    expect(hanchan.isGameOver()).toBe(false);
    // dealer が変わっていない
    expect(hanchan.engine.state.dealerSeat).toBe(dealerBefore);
    // honba が増えた
    expect(hanchan.engine.state.round.honba).toBe(1);
  });

  it('子が和了 → 親流れ（dealer が次に）', () => {
    const hanchan = new HanchanEngine({ rngSeed: 1, calculator: calc });
    const engine = hanchan.engine;
    const dealerBefore = engine.state.dealerSeat; // 0

    // seat1 (子) に和了形
    engine.step();
    engine.state.players[0].hand = tiles('1m','2m','3m','4m','5m','6m','7m','8m','9m','1s','2s','3s','9s','4p');
    engine.applyAction(0, { kind: 'discard', tile: tile('4p'), tsumogiri: false });
    // seat1 テンパイ→ロン
    engine.state.players[1].hand = [...AGARI_HAND_13];
    passAll(engine);
    // seat1 が pass されてしまうので call phase で seat1 に ron させる
    // → 全部 pass なので実際には seat1 がロンできる局面にする必要がある
    // 別アプローチ: seat1 に直接ツモ和了させる
    // reset engine
    const hanchan2 = new HanchanEngine({ rngSeed: 1, calculator: calc });
    const eng2 = hanchan2.engine;
    eng2.step();
    // seat1 に hand を設定してから seat0 に 4p を捨てさせる
    eng2.state.players[1].hand = [...AGARI_HAND_13]; // 4p 待ち
    eng2.state.players[0].hand = tiles('1m','2m','3m','4m','5m','6m','7m','8m','9m','1s','2s','3s','4p','9s');
    eng2.applyAction(0, { kind: 'discard', tile: tile('4p'), tsumogiri: false });
    // seat1 がロン
    eng2.applyAction(1, { kind: 'ron' });
    expect(eng2.isOver()).toBe(true);

    hanchan2.advanceKyoku();
    expect(hanchan2.isGameOver()).toBe(false);
    // dealer が seat1 に
    expect(hanchan2.engine.state.dealerSeat).toBe(((dealerBefore + 1) % 4) as Seat);
    // honba がリセット
    expect(hanchan2.engine.state.round.honba).toBe(0);
  });

  it('リーチ棒が流局で次局に引き継がれる', () => {
    const hanchan = new HanchanEngine({ rngSeed: 1, calculator: calc });
    const engine = hanchan.engine;

    // seat0 がリーチ宣言
    engine.step();
    const riichiHand = tiles('1m','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p','3p','4p','7s');
    engine.state.players[0].hand = [...riichiHand];
    engine.applyAction(0, { kind: 'riichi', tile: tile('7s') });

    // 強制荒牌
    engine.state.wall = { ...engine.state.wall, drawnCount: 122 };
    engine.step();
    expect(engine.isOver()).toBe(true);

    const sticksAfter = engine.state.round.riichiSticks;
    expect(sticksAfter).toBeGreaterThanOrEqual(1);

    hanchan.advanceKyoku();
    expect(hanchan.engine.state.round.riichiSticks).toBe(sticksAfter);
  });
});
