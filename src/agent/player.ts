import type { Action } from '../types/action.js';
import type { Observation } from '../engine/engine.js';
import type { Seat } from '../types/seat.js';

export interface DecideResult {
  action: Action;
  reasoning?: string;
}

export interface Player {
  seat: Seat;
  name: string;
  decide(obs: Observation, legalActions: Action[]): Promise<DecideResult>;
}
