import type { Player } from '../player.js';
import type { Action } from '../../types/action.js';
import type { Observation } from '../../engine/engine.js';
import type { Seat } from '../../types/seat.js';
import { buildPrompt } from './format.js';

interface OllamaMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface OllamaChatResponse {
  message: { content: string };
  done: boolean;
}

export interface OllamaAgentOptions {
  seat: Seat;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
  verbose?: boolean;
}

export class OllamaAgent implements Player {
  seat: Seat;
  name: string;
  private model: string;
  private baseUrl: string;
  private timeoutMs: number;
  private verbose: boolean;

  constructor(opts: OllamaAgentOptions) {
    this.seat = opts.seat;
    this.model = opts.model;
    this.name = `${opts.model}@seat${opts.seat}`;
    this.baseUrl = opts.baseUrl ?? 'http://localhost:11434';
    this.timeoutMs = opts.timeoutMs ?? 120000;
    this.verbose = opts.verbose ?? false;
  }

  async decide(obs: Observation, actions: Action[]): Promise<Action> {
    if (actions.length === 1) return actions[0]!;

    // qwen3 系はデフォルトで thinking モードが有効→ /no_think で無効化
    const noThink = /qwen3/i.test(this.model);
    let prompt = buildPrompt(obs, actions, this.name);
    if (noThink) prompt = '/no_think\n' + prompt;

    if (this.verbose) {
      console.log(`\n[${this.name}] プロンプト:\n${prompt}`);
    }

    let responseText = '';
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), this.timeoutMs);
      try {
        const res = await fetch(`${this.baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.model,
            messages: [{ role: 'user', content: prompt }] as OllamaMessage[],
            stream: false,
            options: { temperature: 0.3, num_predict: 512 },
          }),
          signal: ac.signal,
        });
        clearTimeout(timer);
        if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
        const data = await res.json() as OllamaChatResponse;
        responseText = data.message?.content ?? '';
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      console.error(`[${this.name}] Ollama error: ${err}`);
      return this._fallback(actions);
    }

    if (this.verbose) {
      console.log(`[${this.name}] 回答: ${responseText.trim()}`);
    }

    return this._parse(responseText, actions);
  }

  private _parse(text: string, actions: Action[]): Action {
    // 最初に出現する有効番号を探す（行頭優先）
    const lines = text.split('\n');
    for (const line of lines) {
      const m = line.match(/^\s*(\d+)/);
      if (m) {
        const n = parseInt(m[1]!, 10);
        if (n >= 1 && n <= actions.length) return actions[n - 1]!;
      }
    }
    // 行頭になければ全体から探す
    const m = text.match(/\b(\d+)\b/);
    if (m) {
      const n = parseInt(m[1]!, 10);
      if (n >= 1 && n <= actions.length) return actions[n - 1]!;
    }
    return this._fallback(actions);
  }

  private _fallback(actions: Action[]): Action {
    // tsumo/ron 優先、次は最初の打牌、それでもなければ最初の合法手
    return actions.find(a => a.kind === 'tsumo' || a.kind === 'ron')
      ?? actions.find(a => a.kind === 'discard')
      ?? actions[0]!;
  }
}
