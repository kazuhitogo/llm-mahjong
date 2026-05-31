import type { Player, DecideResult } from '../player.js';
import type { Action } from '../../types/action.js';
import type { Observation } from '../../engine/engine.js';
import type { Seat } from '../../types/seat.js';
import { buildPrompt } from './format.js';

interface OllamaMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface OllamaChatResponse {
  message: {
    content: string;
    tool_calls?: Array<{
      function: { name: string; arguments: Record<string, unknown> };
    }>;
  };
  done: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
}

const SELECT_ACTION_TOOL = {
  type: 'function',
  function: {
    name: 'select_action',
    description: 'First explain your reasoning about the game situation, then select one legal action.',
    parameters: {
      type: 'object',
      properties: {
        reasoning: {
          type: 'string',
          description: 'Analyze the situation (shanten, waits, opponent danger, rank/score gap) and explain why the chosen action best serves winning 1st place.',
        },
        action_number: {
          type: 'integer',
          description: 'The number of the chosen action from the legal action list (1-indexed).',
          minimum: 1,
        },
      },
      required: ['reasoning', 'action_number'],
    },
  },
} as const;

export interface OllamaAgentOptions {
  seat: Seat;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export class OllamaAgent implements Player {
  seat: Seat;
  name: string;
  private model: string;
  private baseUrl: string;
  private timeoutMs: number;
  private _toolUseSupported = true;

  constructor(opts: OllamaAgentOptions) {
    this.seat = opts.seat;
    this.model = opts.model;
    this.name = `${opts.model}@seat${opts.seat}`;
    this.baseUrl = opts.baseUrl ?? 'http://localhost:11434';
    this.timeoutMs = opts.timeoutMs ?? 120000;
  }

  async decide(obs: Observation, actions: Action[]): Promise<DecideResult> {
    if (actions.length === 1) return { action: actions[0]! };

    const prompt = buildPrompt(obs, actions, this.name);

    console.log(`\n[${this.name}] プロンプト:\n${prompt}`);
    process.stdout.write(`  [${this.name}] thinking...`);

    const result = (this._toolUseSupported ? await this._tryToolUse(prompt, actions) : null)
      ?? await this._tryCot(prompt, actions);

    result.prompt = prompt;

    if (result.reasoning) console.log(`\n[${this.name}] 思考: ${result.reasoning}`);
    process.stdout.write(` → ${result.action.kind}\n`);

    return result;
  }

  private async _callOllama(
    messages: OllamaMessage[],
    useTools: boolean,
  ): Promise<OllamaChatResponse | null> {
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), this.timeoutMs);
      try {
        const body: Record<string, unknown> = {
          model: this.model,
          messages,
          stream: false,
          think: false,
          options: { temperature: 0.3, num_predict: 256 },
        };
        if (useTools) body['tools'] = [SELECT_ACTION_TOOL];

        const res = await fetch(`${this.baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: ac.signal,
        });
        clearTimeout(timer);
        if (!res.ok) {
          if (res.status === 400 && useTools) {
            this._toolUseSupported = false;
            return null;
          }
          throw new Error(`Ollama HTTP ${res.status}`);
        }
        return await res.json() as OllamaChatResponse;
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      console.error(`[${this.name}] Ollama error: ${err}`);
      return null;
    }
  }

  private async _tryToolUse(prompt: string, actions: Action[]): Promise<DecideResult | null> {
    const messages: OllamaMessage[] = [
      {
        role: 'system',
        content: 'You are a mahjong AI. Use the select_action tool to choose one legal action after reasoning.',
      },
      { role: 'user', content: prompt },
    ];

    const data = await this._callOllama(messages, true);
    if (!data) return null;

    const toolCall = data.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function.name !== 'select_action') return null;

    const args = toolCall.function.arguments;
    const reasoning = typeof args['reasoning'] === 'string' ? args['reasoning'].trim() : '';
    const num = typeof args['action_number'] === 'number' ? args['action_number'] : NaN;

    if (num >= 1 && num <= actions.length) {
      const result: DecideResult = { action: actions[num - 1]! };
      if (reasoning) result.reasoning = reasoning;
      if (data.prompt_eval_count != null) result.inputTokens = data.prompt_eval_count;
      if (data.eval_count != null) result.outputTokens = data.eval_count;
      return result;
    }
    return null;
  }

  private async _tryCot(prompt: string, actions: Action[]): Promise<DecideResult> {
    const messages: OllamaMessage[] = [
      {
        role: 'system',
        content: 'You are a mahjong AI. Select one action number and explain why.',
      },
      { role: 'user', content: prompt },
    ];

    const data = await this._callOllama(messages, false);
    if (!data) return this._fallback(actions);

    const text = data.message?.content ?? '';
    const result = this._parseCot(text, actions);
    if (data.prompt_eval_count != null) result.inputTokens = data.prompt_eval_count;
    if (data.eval_count != null) result.outputTokens = data.eval_count;
    return result;
  }

  private _parseCot(text: string, actions: Action[]): DecideResult {
    // REASON: comes before ACTION: — extract text between them
    const reasonMatch = text.match(/REASON:\s*([\s\S]*?)(?=ACTION:|$)/i);
    const reasoning = reasonMatch?.[1]?.trim() ?? '';

    const withReasoning = (action: Action): DecideResult => {
      const r: DecideResult = { action };
      if (reasoning) r.reasoning = reasoning;
      return r;
    };

    const actionMatch = text.match(/ACTION:\s*(\d+)/i);
    if (actionMatch) {
      const n = parseInt(actionMatch[1]!, 10);
      if (n >= 1 && n <= actions.length) return withReasoning(actions[n - 1]!);
    }

    const lines = text.split('\n');
    for (const line of lines) {
      const m = line.match(/^\s*(\d+)/);
      if (m) {
        const n = parseInt(m[1]!, 10);
        if (n >= 1 && n <= actions.length) return withReasoning(actions[n - 1]!);
      }
    }
    const m = text.match(/\b(\d+)\b/);
    if (m) {
      const n = parseInt(m[1]!, 10);
      if (n >= 1 && n <= actions.length) return withReasoning(actions[n - 1]!);
    }

    return withReasoning(this._fallback(actions).action);
  }

  private _fallback(actions: Action[]): DecideResult {
    const action = actions.find(a => a.kind === 'tsumo' || a.kind === 'ron')
      ?? actions.find(a => a.kind === 'discard')
      ?? actions[0]!;
    return { action };
  }
}
