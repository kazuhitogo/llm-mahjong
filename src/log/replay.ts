import type { GameEvent, GameState } from '../types/state.js';
import type { ScoreCalculator } from '../score/calculator.js';
import { GameEngine } from '../engine/engine.js';
import { HanchanEngine } from '../engine/hanchan.js';
import type { GameLog } from './log.js';

/**
 * アクションログを再生して GameEngine の最終状態を返す。
 * init イベントの rngSeed・round・dealerSeat と initialScores を使って
 * エンジンを構築し、アクションを順番に適用する。
 */
export function replayKyoku(
  events: GameEvent[],
  calculator: ScoreCalculator,
  initialScores?: [number, number, number, number],
): GameEngine {
  const initEv = events.find(e => e.kind === 'init');
  if (!initEv || initEv.kind !== 'init') throw new Error('no init event');

  const engine = new GameEngine({
    rngSeed: initEv.rngSeed,
    calculator,
    dealerSeat: initEv.dealerSeat,
    round: initEv.round,
    initialScores,
  });

  for (const ev of events) {
    if (ev.kind === 'action') {
      if (engine.state.turn.phase === 'draw') engine.step();
      engine.applyAction(ev.seat, ev.action);
    } else if (ev.kind === 'draw') {
      engine.step();
    }
  }

  return engine;
}

/**
 * GameLog から HanchanEngine を再現（読み取り専用・最終状態のみ）。
 * standings() で結果確認できる。
 */
export function replayFromLog(log: GameLog, calculator: ScoreCalculator): HanchanEngine {
  const hanchan = new HanchanEngine({ rngSeed: log.rngSeed, calculator });

  let scores: [number, number, number, number] | undefined;

  for (const kyokuLog of log.kyoku) {
    const engine = replayKyoku(kyokuLog.events, calculator, scores);
    scores = engine.state.players.map(p => p.score) as [number, number, number, number];
  }

  return hanchan;
}
