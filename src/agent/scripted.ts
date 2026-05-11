import type { Player, DecideResult } from './player.js';
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

  async decide(_obs: Observation, actions: Action[]): Promise<DecideResult> {
    const win = actions.find(a => a.kind === 'tsumo' || a.kind === 'ron');
    if (win) return { action: win };
    const nonPass = actions.filter(a => a.kind !== 'pass');
    const pool = nonPass.length > 0 ? nonPass : actions;
    return { action: pool[Math.floor(Math.random() * pool.length)]! };
  }
}
