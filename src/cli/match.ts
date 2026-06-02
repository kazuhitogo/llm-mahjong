/**
 * 4エージェント半荘対局ハーネス。
 *
 * 起動例:
 *   pnpm match
 *   pnpm match --models "gemma4:e2b,gemma4:e2b,qwen3.5:9b,qwen3-vl:8b" --seed 42
 *   pnpm match --live              # viewer で http://localhost:7777 へ接続
 *   pnpm match --live --live-port 8888
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HanchanEngine } from '../engine/hanchan.js';
import { RiichiRsCalculator } from '../score/calculator.js';
import { OllamaAgent } from '../agent/llm/ollama.js';
import { exportLog, serializeLog } from '../log/log.js';
import { LiveServer } from '../live/server.js';
import type { Player } from '../agent/player.js';
import type { Seat } from '../types/seat.js';

const DEFAULT_MODELS = ['gemma4:e2b', 'gemma4:e2b', 'gemma3:4b-it-qat', 'gemma3:4b-it-qat'] as const;

interface MatchOptions {
  models: [string, string, string, string];
  seed: number;
  baseUrl: string;
  timeoutMs: number;
  logFile: string | null;
  livePort: number | null;
}

function parseArgs(argv: string[]): MatchOptions {
  const opts: MatchOptions = {
    models: [...DEFAULT_MODELS] as [string, string, string, string],
    seed: Date.now() & 0x7fffffff,
    baseUrl: process.env['OLLAMA_BASE_URL'] ?? 'http://localhost:11434',
    timeoutMs: 120000,
    logFile: null,
    livePort: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--models') {
      const v = argv[++i]!;
      const parts = v.split(',').map(s => s.trim());
      if (parts.length !== 4) throw new Error('--models には4モデルをカンマ区切りで');
      opts.models = parts as [string, string, string, string];
    } else if (a === '--seed') {
      opts.seed = Number(argv[++i]!) | 0;
    } else if (a === '--base-url') {
      opts.baseUrl = argv[++i]!;
    } else if (a === '--timeout') {
      opts.timeoutMs = Number(argv[++i]!) * 1000;
    } else if (a === '--log-file') {
      opts.logFile = argv[++i]!;
    } else if (a === '--live') {
      opts.livePort = opts.livePort ?? 7777;
    } else if (a === '--live-port') {
      opts.livePort = Number(argv[++i]!);
    } else if (a === '--help' || a === '-h') {
      console.log('Usage: pnpm match [--models M0,M1,M2,M3] [--seed N] [--log-file PATH] [--live] [--live-port PORT]');
      process.exit(0);
    }
  }
  return opts;
}

const WIND_JP = ['東', '南', '西', '北'] as const;

async function playKyoku(
  hanchan: HanchanEngine,
  players: Player[],
  kyokuIndex: number,
  live: LiveServer | null,
): Promise<void> {
  const engine = hanchan.engine;
  const { round, dealerSeat } = engine.state;
  const windJp = round.wind === 'E' ? '東' : '南';
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`${windJp}${round.kyoku}局 ${round.honba}本場  dealer=seat${dealerSeat}`);
  console.log(`スコア: ${engine.state.players.map(p => `seat${p.seat}(${p.score})`).join('  ')}`);

  let lastBroadcast = 0;
  const broadcastNew = () => {
    if (!live) return;
    const evs = engine.events();
    if (evs.length > lastBroadcast) {
      live.broadcast({ type: 'events', kyokuIndex, events: evs.slice(lastBroadcast) });
      lastBroadcast = evs.length;
    }
  };

  let safety = 1000;
  while (!engine.isOver() && safety-- > 0) {
    const phase = engine.state.turn.phase;

    if (phase === 'draw') {
      engine.step();
      broadcastNew();
      continue;
    }

    if (phase === 'discard') {
      const seat = engine.state.turn.seat;
      const obs = engine.getObservation(seat);
      const acts = engine.legalActions(seat);
      if (acts.length === 0) { engine.step(); broadcastNew(); continue; }

      const t0 = Date.now();
      const { action: chosen, reasoning, prompt, inputTokens, outputTokens } = await players[seat]!.decide(obs, acts);
      const elapsedMs = Date.now() - t0;
      engine.applyAction(seat, chosen, reasoning, prompt, players[seat]!.name, inputTokens, outputTokens, elapsedMs);
      broadcastNew();
      continue;
    }

    if (phase === 'call') {
      const pending = engine.state.pendingCalls.filter(p => !p.responded);
      for (const pc of pending) {
        const obs = engine.getObservation(pc.seat);
        const acts = engine.legalActions(pc.seat);
        if (acts.length === 0) { engine.applyAction(pc.seat, { kind: 'pass' }); broadcastNew(); continue; }

        const t0 = Date.now();
        const { action: chosen, reasoning, prompt, inputTokens, outputTokens } = await players[pc.seat]!.decide(obs, acts);
        const elapsedMs = Date.now() - t0;
        engine.applyAction(pc.seat, chosen, reasoning, prompt, players[pc.seat]!.name, inputTokens, outputTokens, elapsedMs);
        broadcastNew();
      }
      continue;
    }

    break;
  }

  // 最後の未送信イベントをフラッシュ
  broadcastNew();

  // 局結果表示
  const events = engine.events();
  const agari = [...events].reverse().find(e => e.kind === 'agari');
  const ryukyoku = events.find(e => e.kind === 'ryukyoku');
  if (agari?.kind === 'agari') {
    const fromStr = agari.from === 'tsumo' ? 'ツモ' : `ロン(seat${agari.from})`;
    const yakumanStr = agari.yakuman ? ` 役満×${agari.yakuman}` : '';
    console.log(`  → 和了: seat${agari.winner} ${fromStr} ${agari.han}翻${agari.fu}符 ${agari.score}点${yakumanStr}`);
  } else if (ryukyoku?.kind === 'ryukyoku') {
    const tenpai = ryukyoku.tenpaiSeats ? `テンパイ:[${ryukyoku.tenpaiSeats.join(',')}]` : '';
    console.log(`  → 流局: ${ryukyoku.reason} ${tenpai}`);
  }
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  console.log('=== LLM Mahjong 半荘対局 ===');
  console.log(`seed: ${opts.seed}`);
  console.log('プレイヤー:');
  for (let i = 0; i < 4; i++) {
    console.log(`  seat${i}: ${opts.models[i]}`);
  }

  let live: LiveServer | null = null;
  if (opts.livePort != null) {
    live = new LiveServer(opts.livePort);
    await live.start();
    console.log(`\nLive viewer: http://localhost:${opts.livePort}/events`);
    console.log('Viewer で「ライブ接続」ボタンを押してください。\n');
  }

  const calc = new RiichiRsCalculator();
  const players: Player[] = opts.models.map((model, i) =>
    new OllamaAgent({
      seat: i as Seat,
      model,
      baseUrl: opts.baseUrl,
      timeoutMs: opts.timeoutMs,
    }),
  );

  const hanchan = new HanchanEngine({
    rngSeed: opts.seed,
    calculator: calc,
  });

  if (live) {
    live.broadcast({ type: 'init', seed: opts.seed, models: opts.models });
  }

  let kyokuCount = 0;
  let safety = 200;
  while (!hanchan.isGameOver() && safety-- > 0) {
    const kyokuIndex = hanchan.kyokuLogs.length;
    await playKyoku(hanchan, players, kyokuIndex, live);
    if (!hanchan.isGameOver()) hanchan.advanceKyoku();
    kyokuCount++;
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`半荘終了  全${kyokuCount}局`);
  console.log('\n【最終スコア】');
  const standings = hanchan.standings();
  for (const s of standings) {
    const model = opts.models[s.seat]!;
    console.log(`  ${s.rank}位 seat${s.seat}(${model}): ${s.rawScore}点  最終: ${s.finalScore > 0 ? '+' : ''}${s.finalScore}`);
  }

  if (live) {
    live.broadcast({ type: 'end', standings });
  }

  const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const ts = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  const logFile = opts.logFile ?? join(projectRoot, 'logs', `${ts}.json`);
  mkdirSync(dirname(logFile), { recursive: true });
  const log = exportLog(hanchan, opts.models);
  writeFileSync(logFile, serializeLog(log), 'utf8');
  console.log(`\nログ保存: ${logFile}`);

  live?.close();
}

main().catch(err => { console.error(err); process.exit(1); });
