/** ScriptedBot 4体で半荘を走らせ JSON ログを出力する開発用スクリプト */
import { writeFileSync } from 'node:fs';
import { HanchanEngine } from '../engine/hanchan.js';
import { RiichiRsCalculator } from '../score/calculator.js';
import { ScriptedBot } from '../agent/scripted.js';
import { exportLog, serializeLog } from '../log/log.js';
import type { Seat } from '../types/seat.js';

const seed = Number(process.argv[2]) || 42;
const outFile = process.argv[3] || '/tmp/test-game.json';

const calc = new RiichiRsCalculator();
const players = [0, 1, 2, 3].map(i => new ScriptedBot(i as Seat));
const hanchan = new HanchanEngine({ rngSeed: seed, calculator: calc });

let safety = 200;
while (!hanchan.isGameOver() && safety-- > 0) {
  const engine = hanchan.engine;
  let inner = 2000;
  while (!engine.isOver() && inner-- > 0) {
    const phase = engine.state.turn.phase;
    if (phase === 'draw') { engine.step(); continue; }
    if (phase === 'discard') {
      const seat = engine.state.turn.seat;
      const obs = engine.getObservation(seat);
      const acts = engine.legalActions(seat);
      if (acts.length === 0) { engine.step(); continue; }
      const { action: chosen } = await players[seat]!.decide(obs, acts);
      engine.applyAction(seat, chosen);
      continue;
    }
    if (phase === 'call') {
      const pending = engine.state.pendingCalls.filter(p => !p.responded);
      for (const pc of pending) {
        const obs = engine.getObservation(pc.seat);
        const acts = engine.legalActions(pc.seat);
        const chosen = acts.length > 0 ? (await players[pc.seat]!.decide(obs, acts)).action : { kind: 'pass' as const };
        engine.applyAction(pc.seat, chosen);
      }
      continue;
    }
    break;
  }
  if (!hanchan.isGameOver()) hanchan.advanceKyoku();
}

const log = exportLog(hanchan);
writeFileSync(outFile, serializeLog(log), 'utf8');

const standings = hanchan.standings();
console.log(`seed: ${seed}  kyoku: ${log.kyoku.length}`);
for (const s of standings) {
  console.log(`  ${s.rank}位 seat${s.seat}: ${s.rawScore}点  ${s.finalScore > 0 ? '+' : ''}${s.finalScore}`);
}
console.log(`ログ保存: ${outFile}`);
