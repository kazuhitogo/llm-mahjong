import type { GameEvent } from '../types/state.js';
import type { FinalStanding } from '../score/standings.js';
import type { HanchanEngine } from '../engine/hanchan.js';

export interface KyokuLog {
  kyokuIndex: number;
  events: GameEvent[];
}

export interface GameLog {
  version: 1;
  rngSeed: number;
  models?: [string, string, string, string];
  kyoku: KyokuLog[];
  standings: FinalStanding[];
}

export function exportLog(hanchan: HanchanEngine, models?: [string, string, string, string]): GameLog {
  if (!hanchan.isGameOver()) throw new Error('game not over');
  const logs = hanchan.kyokuLogs;
  const log: GameLog = {
    version: 1,
    rngSeed: hanchan.rngSeed,
    kyoku: logs.map((events, i) => ({ kyokuIndex: i, events })),
    standings: hanchan.standings(),
  };
  if (models) log.models = models;
  return log;
}

export function serializeLog(log: GameLog): string {
  return JSON.stringify(log, null, 2);
}

export function deserializeLog(json: string): GameLog {
  return JSON.parse(json) as GameLog;
}
