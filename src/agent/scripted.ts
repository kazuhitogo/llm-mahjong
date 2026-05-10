import type { Player } from './player.js';
import type { Action } from '../types/action.js';
import type { Observation } from '../engine/engine.js';
import type { Seat } from '../types/seat.js';

/** ランダムに合法手を選ぶ簡易ボット。tsumo/ron は必ず選ぶ。 */
export class ScriptedBot implements Player {
  seat: Seat;
  name: string;

  constructor(seat: Seat, name = `bot-${seat}`) {
    this.seat = seat;
    this.name = name;
  }

  async decide(_obs: Observation, actions: Action[]): Promise<Action> {
    // 和了は必ず選択
    const win = actions.find(a => a.kind === 'tsumo' || a.kind === 'ron');
    if (win) return win;
    // それ以外はランダム（pass は最後の手段）
    const nonPass = actions.filter(a => a.kind !== 'pass');
    const pool = nonPass.length > 0 ? nonPass : actions;
    return pool[Math.floor(Math.random() * pool.length)]!;
  }
}
