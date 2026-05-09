import { describe, it, expect } from 'vitest';
import { GameEngine } from './engine.js';

describe('GameEngine — Phase 1', () => {
  it('配牌直後: 各プレイヤー 13 枚（親は draw phase で 14 枚にする）', () => {
    const e = new GameEngine({ rngSeed: 42 });
    expect(e.state.players[0].hand.length).toBe(13);
    expect(e.state.players[1].hand.length).toBe(13);
    expect(e.state.players[2].hand.length).toBe(13);
    expect(e.state.players[3].hand.length).toBe(13);
    expect(e.state.turn.phase).toBe('draw');
    expect(e.state.turn.seat).toBe(0);
  });

  it('step() でツモすると親は 14 枚、phase は discard', () => {
    const e = new GameEngine({ rngSeed: 42 });
    e.step();
    expect(e.state.players[0].hand.length).toBe(14);
    expect(e.state.turn.phase).toBe('discard');
  });

  it('合法な打牌で次のプレイヤーへ', () => {
    const e = new GameEngine({ rngSeed: 42 });
    e.step();
    const actions = e.legalActions(0);
    expect(actions.length).toBeGreaterThan(0);
    e.applyAction(0, actions[0]!);
    expect(e.state.turn.seat).toBe(1);
    expect(e.state.turn.phase).toBe('draw');
    expect(e.state.players[0].hand.length).toBe(13);
    expect(e.state.players[0].discards.length).toBe(1);
  });

  it('違反アクション（手牌にない牌を打つ）→ 強制ツモ切り + violation ログ', () => {
    const e = new GameEngine({ rngSeed: 42 });
    e.step();
    // 手牌に絶対ない値（不正な指定）
    e.applyAction(0, { kind: 'discard', tile: 'XX' as never, tsumogiri: false });
    const violations = e.events().filter((ev) => ev.kind === 'violation');
    expect(violations.length).toBe(1);
    // ターンは進んでいる
    expect(e.state.turn.seat).toBe(1);
  });

  it('1 局を最後まで進めると荒牌流局', () => {
    const e = new GameEngine({ rngSeed: 42 });
    let safety = 200; // ガード
    while (!e.isOver() && safety-- > 0) {
      e.step();
      if (e.state.turn.phase === 'discard') {
        const actions = e.legalActions(e.state.turn.seat);
        e.applyAction(e.state.turn.seat, actions[0]!);
      }
    }
    expect(e.isOver()).toBe(true);
    const ryukyoku = e.events().find((ev) => ev.kind === 'ryukyoku');
    expect(ryukyoku).toBeDefined();
  });

  it('観測: 自分の手牌は見えるが他家の手牌は含まれない', () => {
    const e = new GameEngine({ rngSeed: 42 });
    e.step();
    const obs = e.getObservation(0);
    expect(obs.myHand.length).toBe(14);
    // players[i] には hand フィールドがない（型レベル）
    for (const p of obs.players) {
      expect((p as unknown as { hand?: unknown }).hand).toBeUndefined();
    }
  });

  it('観測: サイコロとドラ表示牌が含まれる', () => {
    const e = new GameEngine({ rngSeed: 42 });
    const obs = e.getObservation(0);
    expect(obs.dice[0]).toBeGreaterThanOrEqual(1);
    expect(obs.dice[0]).toBeLessThanOrEqual(6);
    expect(obs.doraIndicators.length).toBe(1);
  });

  it('履歴に dice イベントが含まれる', () => {
    const e = new GameEngine({ rngSeed: 42 });
    const dice = e.events().find((ev) => ev.kind === 'dice');
    expect(dice).toBeDefined();
  });

  it('決定論性: 同じ seed + 同じアクション列で同じ最終状態', () => {
    const seed = 12345;
    const playOnce = () => {
      const e = new GameEngine({ rngSeed: seed });
      let safety = 200;
      while (!e.isOver() && safety-- > 0) {
        e.step();
        if (e.state.turn.phase === 'discard') {
          const actions = e.legalActions(e.state.turn.seat);
          e.applyAction(e.state.turn.seat, actions[0]!);
        }
      }
      return e.events();
    };
    const a = playOnce();
    const b = playOnce();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
