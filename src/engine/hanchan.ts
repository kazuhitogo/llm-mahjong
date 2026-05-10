import { GameEngine, type EngineOptions } from './engine.js';
import type { ScoreCalculator } from '../score/calculator.js';
import type { RuleConfig, GameEvent } from '../types/state.js';
import type { Seat, Wind } from '../types/seat.js';
import { DEFAULT_RULES } from '../types/state.js';
import { computeStandings, type FinalStanding } from '../score/standings.js';

export interface HanchanOptions {
  rngSeed: number;
  calculator: ScoreCalculator;
  rules?: Partial<RuleConfig>;
}

export class HanchanEngine {
  private _engine: GameEngine;
  private _scores: [number, number, number, number];
  private _dealerSeat: Seat;
  private _round: { wind: Wind; kyoku: 1 | 2 | 3 | 4; honba: number; riichiSticks: number };
  private _gameOver = false;
  private _config: RuleConfig;
  private _calculator: ScoreCalculator;
  private _rngSeed: number;
  private _kyokuIndex = 0;

  /** 終了した各局のイベントログ */
  readonly kyokuLogs: GameEvent[][] = [];

  constructor(opts: HanchanOptions) {
    this._config = { ...DEFAULT_RULES, ...opts.rules };
    this._calculator = opts.calculator;
    this._rngSeed = opts.rngSeed;
    this._scores = [
      this._config.startingPoints,
      this._config.startingPoints,
      this._config.startingPoints,
      this._config.startingPoints,
    ];
    this._dealerSeat = 0;
    this._round = { wind: 'E', kyoku: 1, honba: 0, riichiSticks: 0 };
    this._engine = this._createEngine();
  }

  get engine(): GameEngine {
    return this._engine;
  }

  get rngSeed(): number {
    return this._rngSeed;
  }

  isGameOver(): boolean {
    return this._gameOver;
  }

  /** 現在の供託棒数（局間キャリー含む） */
  get riichiSticks(): number {
    return this._round.riichiSticks;
  }

  /**
   * 現在の局が終了した後に呼ぶ。次の局を設定するか、半荘を終了する。
   * engine.isOver() が true のときのみ呼べる。
   */
  advanceKyoku(): void {
    if (!this._engine.isOver()) throw new Error('current kyoku not over');
    if (this._gameOver) throw new Error('game already over');

    this.kyokuLogs.push([...this._engine.events()]);

    // スコア更新
    for (let i = 0; i < 4; i++) {
      this._scores[i as Seat] = this._engine.state.players[i as Seat].score;
    }

    // 残留供託棒を首位プレイヤーへ配る共通処理
    const distributeSticks = () => {
      const sticks = this._engine.state.round.riichiSticks;
      if (sticks > 0) {
        let topSeat = 0 as Seat;
        for (let s = 1; s < 4; s++) {
          if (this._scores[s as Seat] > this._scores[topSeat]) topSeat = s as Seat;
        }
        this._scores[topSeat] += sticks * 1000;
      }
    };

    // 飛び判定
    if (this._config.noChoice === 'tobi-end' && this._scores.some(s => s < 0)) {
      distributeSticks();
      this._gameOver = true;
      return;
    }

    // 直前の局が最終局なら終了（残留供託棒は首位プレイヤーへ）
    if (this._isLastKyoku()) {
      distributeSticks();
      this._gameOver = true;
      return;
    }

    // 連荘 / 親流れ判定
    const renchan = this._computeRenchan();
    const wasRyukyoku = this._engine.events().some(e => e.kind === 'ryukyoku');

    const newRiichiSticks = this._engine.state.round.riichiSticks;

    if (renchan) {
      this._round = {
        ...this._round,
        honba: this._round.honba + 1,
        riichiSticks: newRiichiSticks,
      };
    } else {
      // 親流れ
      this._dealerSeat = ((this._dealerSeat + 1) % 4) as Seat;
      const newHonba = wasRyukyoku ? this._round.honba + 1 : 0;
      const newKyoku = this._round.kyoku + 1;
      if (newKyoku > 4) {
        // 東→南
        this._round = {
          wind: 'S',
          kyoku: 1,
          honba: newHonba,
          riichiSticks: newRiichiSticks,
        };
      } else {
        this._round = {
          ...this._round,
          kyoku: newKyoku as 1 | 2 | 3 | 4,
          honba: newHonba,
          riichiSticks: newRiichiSticks,
        };
      }
    }

    this._kyokuIndex++;
    this._engine = this._createEngine();
  }

  /** 終局後の順位・最終スコアを返す */
  standings(): FinalStanding[] {
    if (!this._gameOver) throw new Error('game not over');
    return computeStandings(this._scores, this._config);
  }

  private _createEngine(): GameEngine {
    const seed = (this._rngSeed + this._kyokuIndex * 7919) >>> 0;
    const opts: EngineOptions = {
      rngSeed: seed,
      calculator: this._calculator,
      rules: this._config,
      dealerSeat: this._dealerSeat,
      round: { ...this._round, wind: this._round.wind as 'E' | 'S' },
      initialScores: [...this._scores] as [number, number, number, number],
    };
    return new GameEngine(opts);
  }

  private _isLastKyoku(): boolean {
    const { wind, kyoku } = this._round;
    if (this._config.gameLength === 'tonpu') return wind === 'E' && kyoku === 4;
    return wind === 'S' && kyoku === 4;
  }

  private _computeRenchan(): boolean {
    const events = this._engine.events();
    // アガリあり → 和了者が親なら連荘
    const lastAgari = [...events].reverse().find(e => e.kind === 'agari');
    if (lastAgari?.kind === 'agari') {
      return lastAgari.winner === this._dealerSeat;
    }
    // 流局 → 親テンパイなら連荘、途中流局（abortive）は常に連荘
    const ryukyoku = events.find(e => e.kind === 'ryukyoku');
    if (ryukyoku?.kind === 'ryukyoku') {
      if (ryukyoku.reason === 'exhaustive_draw') {
        return (ryukyoku.tenpaiSeats ?? []).includes(this._dealerSeat);
      }
      return true; // 途中流局は常に連荘
    }
    return false;
  }
}
