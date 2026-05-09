/**
 * Phase 1 動作確認 CLI。
 *
 * 起動:
 *   pnpm cli            # 全プレイヤーをランダム打牌のスクリプトで自動進行
 *   pnpm cli --human 0  # 自分が東家、残りはスクリプト
 *   pnpm cli --seed 42  # 乱数 seed 指定
 *
 * 人間プレイヤーの番では手牌が表示され、stdin で打牌する牌（例: "5m"）を入力する。
 * 不正な入力は強制ツモ切りで処理される。
 */
import * as readline from 'node:readline/promises';
import { GameEngine } from '../engine/engine.js';
import { fmtObservation } from './format.js';
import type { Action } from '../types/action.js';
import type { Seat } from '../types/seat.js';
import { isValidTileString } from '../tiles/tile.js';

interface CliOptions {
  humanSeats: Set<Seat>;
  seed: number;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { humanSeats: new Set(), seed: Date.now() & 0x7fffffff };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--human') {
      const v = argv[++i];
      if (v == null) throw new Error('--human requires seat (0..3)');
      const s = Number(v);
      if (![0, 1, 2, 3].includes(s)) throw new Error('--human requires 0..3');
      opts.humanSeats.add(s as Seat);
    } else if (a === '--seed') {
      const v = argv[++i];
      if (v == null) throw new Error('--seed requires a number');
      opts.seed = Number(v) | 0;
    } else if (a === '--help' || a === '-h') {
      console.log('Usage: pnpm cli [--human SEAT] [--seed N]');
      process.exit(0);
    }
  }
  return opts;
}

async function chooseHumanAction(
  engine: GameEngine,
  seat: Seat,
  rl: readline.Interface,
): Promise<Action> {
  const obs = engine.getObservation(seat);
  console.log('\n' + fmtObservation(obs));
  const actions = engine.legalActions(seat);
  console.log(`合法手: ${actions.length} 種類（手牌中の牌を 1 枚指定）`);
  const tiles = Array.from(new Set(actions.flatMap((a) => (a.kind === 'discard' ? [a.tile] : []))));
  console.log(`候補: ${tiles.join(', ')}`);
  while (true) {
    const ans = (await rl.question('打牌する牌を入力 (例: 5m, 0p, 1z) > ')).trim();
    if (!isValidTileString(ans)) {
      console.log('  → 不正な形式。もう一度。');
      continue;
    }
    const action = actions.find((a) => a.kind === 'discard' && a.tile === ans);
    if (!action) {
      console.log(`  → 手牌に "${ans}" がありません。もう一度。`);
      continue;
    }
    return action;
  }
}

function chooseScriptedAction(engine: GameEngine, seat: Seat): Action {
  // ランダムに 1 枚打つ
  const actions = engine.legalActions(seat);
  if (actions.length === 0) throw new Error('no legal actions');
  return actions[Math.floor(Math.random() * actions.length)]!;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  console.log(`=== llm-mahjong CLI (Phase 1) ===`);
  console.log(`seed=${opts.seed}, human=${[...opts.humanSeats].join(',') || '(none)'}`);

  const engine = new GameEngine({ rngSeed: opts.seed });
  const dice = engine.state.wall.dice;
  console.log(
    `サイコロ: ${dice[0]}+${dice[1]}=${dice[0] + dice[1]}  → 開門 layout[${engine.state.wall.breakIndex}]`,
  );
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    let safety = 500;
    while (!engine.isOver() && safety-- > 0) {
      engine.step();
      if (engine.state.turn.phase === 'discard') {
        const seat = engine.state.turn.seat;
        const action = opts.humanSeats.has(seat)
          ? await chooseHumanAction(engine, seat, rl)
          : chooseScriptedAction(engine, seat);
        if (!opts.humanSeats.has(seat)) {
          console.log(
            `[seat ${seat}] discard ${action.kind === 'discard' ? action.tile : action.kind}`,
          );
        }
        engine.applyAction(seat, action);
      }
    }
    console.log('\n=== 局終了 ===');
    const events = engine.events();
    const ryukyoku = events.find((e) => e.kind === 'ryukyoku');
    if (ryukyoku) {
      console.log(`流局理由: ${(ryukyoku as { reason: string }).reason}`);
    }
    const violations = events.filter((e) => e.kind === 'violation');
    if (violations.length > 0) {
      console.log(`違反アクション: ${violations.length} 件`);
    }
    // 最終観測を東家視点で表示
    console.log('\n--- 最終状態（東家視点） ---');
    console.log(fmtObservation(engine.getObservation(0)));
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
