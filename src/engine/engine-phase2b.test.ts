import { describe, it, expect } from 'vitest';
import { GameEngine } from './engine.js';
import { RiichiRsCalculator } from '../score/calculator.js';
import { ponCandidates, chiCandidates, kakanCandidates } from './legal.js';
import { tile, tiles } from '../tiles/tile.js';
import type { Seat } from '../types/seat.js';
import type { Meld } from '../types/meld.js';

const calc = new RiichiRsCalculator();

function setHand(engine: GameEngine, seat: Seat, hand: ReturnType<typeof tiles>) {
  engine.state.players[seat].hand = [...hand];
}

// 無干渉ハンド: 字牌・筒子のみ、どの捨て牌にも反応しない
const NEUTRAL = tiles('2p','3p','4p','5p','6p','7p','8p','1s','2s','3s','4s','5s','6s');

function passAll(engine: GameEngine) {
  const pending = engine.state.pendingCalls.filter(p => !p.responded);
  for (const pc of pending) engine.applyAction(pc.seat, { kind: 'pass' });
}

// ---------- ポン ----------

describe('Phase 2b — ポン', () => {
  it('canPon フラグが立つ', () => {
    const engine = new GameEngine({ rngSeed: 1, calculator: calc });
    engine.step();

    setHand(engine, 0, tiles('1m','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p','3p','1z','2z'));
    setHand(engine, 1, tiles('1m','2m','3m','4m','5m','1z','1z','2z','3z','4z','5z','6z','7z'));
    setHand(engine, 2, NEUTRAL);
    setHand(engine, 3, NEUTRAL);
    engine.applyAction(0, { kind: 'discard', tile: tile('1z'), tsumogiri: false });

    expect(engine.state.turn.phase).toBe('call');
    const pc = engine.state.pendingCalls.find(p => p.seat === 1);
    expect(pc?.canPon).toBe(true);
  });

  it('ポン後に打牌フェーズに移行し副露が積まれる', () => {
    const engine = new GameEngine({ rngSeed: 1, calculator: calc });
    engine.step();

    setHand(engine, 0, tiles('1m','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p','3p','1z','2z'));
    setHand(engine, 1, tiles('1m','2m','3m','4m','5m','1z','1z','2z','3z','4z','5z','6z','7z'));
    setHand(engine, 2, NEUTRAL);
    setHand(engine, 3, NEUTRAL);
    engine.applyAction(0, { kind: 'discard', tile: tile('1z'), tsumogiri: false });

    engine.applyAction(1, { kind: 'pon', tiles: [tile('1z'), tile('1z')] });
    // 残り pending があればパス
    passAll(engine);

    expect(engine.state.turn.phase).toBe('discard');
    expect(engine.state.turn.seat).toBe(1);
    expect(engine.state.players[1].melds.length).toBe(1);
    expect(engine.state.players[1].melds[0]!.kind).toBe('pon');
    expect(engine.state.players[1].hand.filter(t => t === tile('1z')).length).toBe(0);
    expect(engine.state.players[1].hand.length).toBe(11);
  });

  it('ポン後に打牌で次 phase へ', () => {
    const engine = new GameEngine({ rngSeed: 1, calculator: calc });
    engine.step();

    setHand(engine, 0, tiles('1m','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p','3p','1z','2z'));
    setHand(engine, 1, tiles('1m','2m','3m','4m','5m','1z','1z','2z','3z','4z','5z','6z','7z'));
    setHand(engine, 2, NEUTRAL);
    setHand(engine, 3, NEUTRAL);
    engine.applyAction(0, { kind: 'discard', tile: tile('1z'), tsumogiri: false });
    engine.applyAction(1, { kind: 'pon', tiles: [tile('1z'), tile('1z')] });
    passAll(engine);

    engine.applyAction(1, { kind: 'discard', tile: tile('7z'), tsumogiri: false });
    expect(['draw', 'call', 'end']).toContain(engine.state.turn.phase);
  });

  it('ロンがポンより優先', () => {
    const engine = new GameEngine({ rngSeed: 1, calculator: calc });
    engine.step();

    // seat1: 4p テンパイ (AGARI_HAND_13)
    setHand(engine, 1, tiles('1m','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p','3p','4p'));
    // seat2: 4p×2 でポン可能
    setHand(engine, 2, tiles('4p','4p','1s','2s','3s','4s','5s','6s','7s','8s','9s','1z','2z'));
    setHand(engine, 3, NEUTRAL);
    // seat0 が 4p を捨てる
    setHand(engine, 0, tiles('1m','2m','3m','5m','6m','7m','1s','2s','3s','4s','5s','6s','4p','9p'));
    engine.applyAction(0, { kind: 'discard', tile: tile('4p'), tsumogiri: false });

    expect(engine.state.turn.phase).toBe('call');
    // seat1 ロン、seat2 ポン、残りパス
    engine.applyAction(1, { kind: 'ron' });
    engine.applyAction(2, { kind: 'pon', tiles: [tile('4p'), tile('4p')] });
    passAll(engine);

    expect(engine.isOver()).toBe(true);
    expect(engine.events().some(e => e.kind === 'agari' && e.winner === 1)).toBe(true);
  });
});

// ---------- チー ----------

describe('Phase 2b — チー', () => {
  it('上家の打牌でチー候補が出る', () => {
    const engine = new GameEngine({ rngSeed: 1, calculator: calc });
    engine.step();

    setHand(engine, 0, tiles('1m','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p','3p','4p','5m'));
    setHand(engine, 1, tiles('3m','4m','6m','7m','8m','1p','2p','3p','4p','5p','6p','7p','8p'));
    setHand(engine, 2, NEUTRAL);
    setHand(engine, 3, NEUTRAL);
    engine.applyAction(0, { kind: 'discard', tile: tile('5m'), tsumogiri: false });

    expect(engine.state.turn.phase).toBe('call');
    const pc = engine.state.pendingCalls.find(p => p.seat === 1);
    expect(pc?.canChi).toBe(true);
  });

  it('上家以外はチー不可', () => {
    const engine = new GameEngine({ rngSeed: 1, calculator: calc });
    engine.step();

    setHand(engine, 0, tiles('1m','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p','3p','4p','5m'));
    setHand(engine, 1, NEUTRAL);
    setHand(engine, 2, tiles('3m','4m','6m','7m','8m','1p','2p','3p','4p','5p','6p','7p','8p'));
    setHand(engine, 3, NEUTRAL);
    engine.applyAction(0, { kind: 'discard', tile: tile('5m'), tsumogiri: false });

    const pc2 = engine.state.pendingCalls.find(p => p.seat === 2);
    const pc3 = engine.state.pendingCalls.find(p => p.seat === 3);
    expect(pc2?.canChi ?? false).toBe(false);
    expect(pc3?.canChi ?? false).toBe(false);
  });

  it('チー後に副露が積まれ打牌フェーズへ', () => {
    const engine = new GameEngine({ rngSeed: 1, calculator: calc });
    engine.step();

    setHand(engine, 0, tiles('1m','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p','3p','4p','5m'));
    setHand(engine, 1, tiles('3m','4m','6m','7m','8m','1p','2p','3p','4p','5p','6p','7p','8p'));
    setHand(engine, 2, NEUTRAL);
    setHand(engine, 3, NEUTRAL);
    engine.applyAction(0, { kind: 'discard', tile: tile('5m'), tsumogiri: false });

    engine.applyAction(1, { kind: 'chi', tiles: [tile('3m'), tile('4m')] });
    passAll(engine);

    expect(engine.state.turn.phase).toBe('discard');
    expect(engine.state.turn.seat).toBe(1);
    expect(engine.state.players[1].melds[0]!.kind).toBe('chi');
    expect(engine.state.players[1].hand.length).toBe(11);
  });

  it('チー後の喰い替え禁止: チー牌と同種は打牌不可', () => {
    const engine = new GameEngine({ rngSeed: 1, calculator: calc });
    engine.step();

    setHand(engine, 0, tiles('1m','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p','3p','4p','5m'));
    setHand(engine, 1, tiles('3m','4m','5m','6m','7m','1p','2p','3p','4p','5p','6p','7p','8p'));
    setHand(engine, 2, NEUTRAL);
    setHand(engine, 3, NEUTRAL);
    engine.applyAction(0, { kind: 'discard', tile: tile('5m'), tsumogiri: false });
    engine.applyAction(1, { kind: 'chi', tiles: [tile('3m'), tile('4m')] });
    passAll(engine);

    const discards = engine.legalActions(1).filter(a => a.kind === 'discard');
    // 5m は喰い替え禁止
    expect(discards.some(a => a.kind === 'discard' && a.tile === '5m')).toBe(false);
  });

  it('字牌はチー不可', () => {
    const engine = new GameEngine({ rngSeed: 1, calculator: calc });
    engine.step();

    setHand(engine, 0, tiles('1m','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p','3p','4p','1z'));
    setHand(engine, 1, tiles('1z','1z','6m','7m','8m','1p','2p','3p','4p','5p','6p','7p','8p'));
    setHand(engine, 2, NEUTRAL);
    setHand(engine, 3, NEUTRAL);
    engine.applyAction(0, { kind: 'discard', tile: tile('1z'), tsumogiri: false });

    const pc = engine.state.pendingCalls.find(p => p.seat === 1);
    expect(pc?.canChi ?? false).toBe(false);
  });
});

// ---------- 大明槓 ----------

describe('Phase 2b — 大明槓', () => {
  it('大明槓後に嶺上ツモ → discard phase', () => {
    const engine = new GameEngine({ rngSeed: 1, calculator: calc });
    engine.step();

    setHand(engine, 0, tiles('1m','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p','3p','4p','1z'));
    setHand(engine, 1, tiles('1z','1z','1z','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p'));
    setHand(engine, 2, NEUTRAL);
    setHand(engine, 3, NEUTRAL);
    engine.applyAction(0, { kind: 'discard', tile: tile('1z'), tsumogiri: false });

    const pc = engine.state.pendingCalls.find(p => p.seat === 1);
    expect(pc?.canDaiminkan).toBe(true);

    engine.applyAction(1, { kind: 'daiminkan' });
    passAll(engine);

    expect(['discard', 'end']).toContain(engine.state.turn.phase);
    if (engine.state.turn.phase === 'discard') {
      expect(engine.state.turn.seat).toBe(1);
      expect(engine.state.players[1].melds[0]!.kind).toBe('daiminkan');
    }
  });

  it('大明槓後にドラ表示牌が 1 枚増える', () => {
    const engine = new GameEngine({ rngSeed: 1, calculator: calc });
    engine.step();

    const doraCountBefore = engine.state.wall.doraIndicatorCount;

    setHand(engine, 0, tiles('1m','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p','3p','4p','1z'));
    setHand(engine, 1, tiles('1z','1z','1z','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p'));
    setHand(engine, 2, NEUTRAL);
    setHand(engine, 3, NEUTRAL);
    engine.applyAction(0, { kind: 'discard', tile: tile('1z'), tsumogiri: false });
    engine.applyAction(1, { kind: 'daiminkan' });
    passAll(engine);

    expect(engine.state.wall.doraIndicatorCount).toBe(doraCountBefore + 1);
  });
});

// ---------- 暗槓 ----------

describe('Phase 2b — 暗槓', () => {
  it('暗槓が合法手に含まれる', () => {
    const engine = new GameEngine({ rngSeed: 1, calculator: calc });
    engine.step();

    setHand(engine, 0, tiles('1m','1m','1m','1m','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p'));
    const actions = engine.legalActions(0);
    expect(actions.some(a => a.kind === 'ankan')).toBe(true);
  });

  it('暗槓後に嶺上ツモ → discard phase', () => {
    const engine = new GameEngine({ rngSeed: 1, calculator: calc });
    engine.step();

    setHand(engine, 0, tiles('1m','1m','1m','1m','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p'));
    engine.applyAction(0, { kind: 'ankan', tile: tile('1m') });

    expect(['discard', 'end']).toContain(engine.state.turn.phase);
    if (engine.state.turn.phase === 'discard') {
      expect(engine.state.turn.seat).toBe(0);
      expect(engine.state.players[0].melds[0]!.kind).toBe('ankan');
    }
  });

  it('暗槓でドラ表示牌が増える', () => {
    const engine = new GameEngine({ rngSeed: 1, calculator: calc });
    engine.step();

    const before = engine.state.wall.doraIndicatorCount;
    setHand(engine, 0, tiles('1m','1m','1m','1m','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p'));
    engine.applyAction(0, { kind: 'ankan', tile: tile('1m') });

    expect(engine.state.wall.doraIndicatorCount).toBe(before + 1);
  });

  it('リーチ中は暗槓不可', () => {
    const engine = new GameEngine({ rngSeed: 1, calculator: calc });
    engine.step();

    const riichiHand = tiles('1m','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p','3p','4p','7s');
    setHand(engine, 0, riichiHand);
    setHand(engine, 1, NEUTRAL);
    setHand(engine, 2, NEUTRAL);
    setHand(engine, 3, NEUTRAL);
    engine.applyAction(0, { kind: 'riichi', tile: tile('7s') });
    passAll(engine);

    // seat0 次ターンまで進める
    let safety = 20;
    while (engine.state.turn.seat !== 0 && !engine.isOver() && safety-- > 0) {
      const phase = engine.state.turn.phase;
      if (phase === 'draw') engine.step();
      else if (phase === 'discard') {
        const s = engine.state.turn.seat;
        engine.applyAction(s, engine.legalActions(s)[0]!);
      } else if (phase === 'call') passAll(engine);
    }

    if (!engine.isOver() && engine.state.turn.seat === 0) {
      engine.step();
      if (engine.state.turn.phase === 'discard') {
        const actions = engine.legalActions(0);
        expect(actions.some(a => a.kind === 'ankan')).toBe(false);
      }
    }
  });
});

// ---------- 加槓 (legal 関数直接テスト) ----------

describe('Phase 2b — 加槓 (kakanCandidates)', () => {
  it('ポン副露があれば加槓候補に含まれる', () => {
    const ponMeld: Meld = {
      kind: 'pon',
      tiles: [tile('1z'), tile('1z'), tile('1z')],
      from: 0,
      calledTile: tile('1z'),
    };
    const player = {
      seat: 1 as Seat,
      hand: tiles('1z','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p','3p','4p'),
      melds: [ponMeld],
      discards: [],
      score: 25000,
      riichi: null,
      isFuriten: false,
    };
    const candidates = kakanCandidates(player);
    expect(candidates.length).toBe(1);
    expect(candidates[0]!.kind).toBe('kakan');
  });

  it('ポン副露なければ加槓候補なし', () => {
    const player = {
      seat: 1 as Seat,
      hand: tiles('1z','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p','3p','4p'),
      melds: [],
      discards: [],
      score: 25000,
      riichi: null,
      isFuriten: false,
    };
    const candidates = kakanCandidates(player);
    expect(candidates.length).toBe(0);
  });

  it('リーチ中は加槓不可', () => {
    const ponMeld: Meld = {
      kind: 'pon',
      tiles: [tile('1z'), tile('1z'), tile('1z')],
      from: 0,
      calledTile: tile('1z'),
    };
    const player = {
      seat: 1 as Seat,
      hand: tiles('1z','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p','3p','4p'),
      melds: [ponMeld],
      discards: [],
      score: 25000,
      riichi: { declared: true, junme: 1, isDouble: false, ippatsu: false },
      isFuriten: false,
    };
    const candidates = kakanCandidates(player);
    expect(candidates.length).toBe(0);
  });
});

// ---------- 全局ループ (鳴きあり) ----------

describe('Phase 2b — 鳴きあり全局ループ', () => {
  it('複数シードで正常終了する', () => {
    for (const seed of [1, 2, 3, 42, 99]) {
      const engine = new GameEngine({ rngSeed: seed, calculator: calc });
      let safety = 1000;
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
          const discardedTile = engine['lastDiscardedTile']() as ReturnType<typeof tile> | null;
          for (const pc of pending) {
            const { seat: s, canDaiminkan, canPon, canChi } = pc;
            if (canDaiminkan && discardedTile) {
              engine.applyAction(s, { kind: 'daiminkan' });
            } else if (canPon && discardedTile) {
              const p2 = ponCandidates(engine.state.players[s].hand, discardedTile);
              if (p2[0]) engine.applyAction(s, p2[0]);
              else engine.applyAction(s, { kind: 'pass' });
            } else if (canChi && discardedTile) {
              const c = chiCandidates(engine.state.players[s].hand, discardedTile);
              if (c[0]) engine.applyAction(s, c[0]);
              else engine.applyAction(s, { kind: 'pass' });
            } else {
              engine.applyAction(s, { kind: 'pass' });
            }
          }
        }
      }
      expect(engine.isOver()).toBe(true);
    }
  });
});
