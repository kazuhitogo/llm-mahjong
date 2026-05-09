import type {
  GameState,
  PlayerState,
  RuleConfig,
  GameEvent,
  DiscardEntry,
} from '../types/state.js';
import type { Tile, TileId } from '../types/tile.js';
import type { Seat } from '../types/seat.js';
import type { Action } from '../types/action.js';
import { DEFAULT_RULES } from '../types/state.js';
import { dealWall, drawTile, remainingDraws, getDoraIndicators } from '../wall/wall.js';
import { sortTiles, tileIdToTile } from '../tiles/tile.js';
import { getLegalActions, isLegalAction, fallbackAction } from './legal.js';

export interface EngineOptions {
  rules?: Partial<RuleConfig>;
  rngSeed: number;
  /** 親の席 (デフォルト 0 = 起家) */
  dealerSeat?: Seat;
  /** 場・局 */
  round?: { wind: 'E' | 'S'; kyoku: 1 | 2 | 3 | 4; honba: number; riichiSticks: number };
  /** 各プレイヤーの初期点数（デフォルトは rules.startingPoints） */
  initialScores?: [number, number, number, number];
}

/**
 * GameEngine — 1 局を進める状態機械。
 *
 * Phase 1:
 * - 配牌
 * - 各プレイヤーがツモ→打牌を順繰り
 * - 山が尽きたら荒牌流局（聴牌判定なし、点数移動なし）
 *
 * 鳴き・リーチ・和了は Phase 2 で追加。
 */
export class GameEngine {
  state: GameState;
  /** 直前にツモした TileId（ツモ切り判定用） */
  private lastDrawnId: TileId | null = null;

  constructor(opts: EngineOptions) {
    const rules: RuleConfig = { ...DEFAULT_RULES, ...opts.rules };
    const dealerSeat = opts.dealerSeat ?? 0;
    const round = opts.round ?? { wind: 'E', kyoku: 1, honba: 0, riichiSticks: 0 };
    const startingScore = rules.startingPoints;
    const scores = opts.initialScores ?? [
      startingScore, startingScore, startingScore, startingScore,
    ];

    const dealt = dealWall(opts.rngSeed, dealerSeat);

    const players = [0, 1, 2, 3].map((s): PlayerState => ({
      seat: s as Seat,
      hand: sortTiles(dealt.hands[s as 0 | 1 | 2 | 3].map((id) => tileIdToTile(id, rules.redDora))),
      melds: [],
      discards: [],
      score: scores[s as 0 | 1 | 2 | 3],
      riichi: null,
      isFuriten: false,
    })) as [PlayerState, PlayerState, PlayerState, PlayerState];

    const sum = dealt.wall.dice[0] + dealt.wall.dice[1];
    const breakSeat = ((dealerSeat + (sum - 1) % 4) % 4) as Seat;

    this.state = {
      config: rules,
      round,
      dealerSeat,
      turn: { seat: dealerSeat, phase: 'draw', junme: 0 },
      wall: dealt.wall,
      players,
      history: [
        { kind: 'init', rngSeed: opts.rngSeed, round, dealerSeat },
        {
          kind: 'dice',
          dice: [dealt.wall.dice[0], dealt.wall.dice[1]],
          breakSeat,
          breakIndex: dealt.wall.breakIndex,
        },
        {
          kind: 'deal',
          hands: players.map((p) => [...p.hand]) as [Tile[], Tile[], Tile[], Tile[]],
        },
      ],
      rngSeed: opts.rngSeed,
    };
  }

  /** 現在の局が終了しているか */
  isOver(): boolean {
    return this.state.turn.phase === 'end';
  }

  /** プレイヤーが取れる合法手 */
  legalActions(seat: Seat): Action[] {
    return getLegalActions(this.state, seat);
  }

  /**
   * 1 ステップ進める。draw phase なら自動でツモして discard phase へ。
   * discard phase なら applyAction を待つので何もしない。
   */
  step(): void {
    if (this.state.turn.phase === 'draw') {
      this.doDraw();
    }
  }

  private doDraw(): void {
    const seat = this.state.turn.seat;
    const drawn = drawTile(this.state.wall);
    if (!drawn) {
      // 山が尽きた → 荒牌流局
      this.state.turn.phase = 'ryukyoku';
      this.state.history.push({ kind: 'ryukyoku', reason: 'exhaustive_draw' });
      this.state.turn.phase = 'end';
      return;
    }
    const tile = tileIdToTile(drawn.tile, this.state.config.redDora);
    this.lastDrawnId = drawn.tile;
    this.state.wall = drawn.wall;
    const player = this.state.players[seat];
    // ツモ牌は手牌の末尾に置く（ソートはしない、ツモ切り判定のため）
    player.hand = [...sortTiles(player.hand.slice(0, 13)), tile];
    this.state.turn.phase = 'discard';
    this.state.history.push({ kind: 'draw', seat, tile });
  }

  /**
   * 現在の手番プレイヤーがアクションを提出する。
   * 違反していたら強制ツモ切りで処理して violation を記録。
   */
  applyAction(seat: Seat, action: Action): void {
    if (this.state.turn.phase !== 'discard') {
      throw new Error(`applyAction: not in discard phase (phase=${this.state.turn.phase})`);
    }
    if (this.state.turn.seat !== seat) {
      throw new Error(`applyAction: not your turn (current=${this.state.turn.seat}, got=${seat})`);
    }

    let chosen = action;
    if (!isLegalAction(this.state, seat, action)) {
      const replacement = fallbackAction(this.state, seat);
      this.state.history.push({
        kind: 'violation',
        seat,
        attempted: action,
        reason: action.kind === 'discard'
          ? `tile "${action.tile}" not in hand`
          : `action "${action.kind}" not allowed in Phase 1`,
        replacement,
      });
      chosen = replacement;
    }

    if (chosen.kind !== 'discard') {
      throw new Error('Phase 1: only discard supported');
    }

    this.doDiscard(seat, chosen.tile, chosen.tile === this.lastTileForSeat(seat));
  }

  private lastTileForSeat(seat: Seat): Tile | null {
    if (this.lastDrawnId == null) return null;
    if (this.state.turn.seat !== seat) return null;
    return tileIdToTile(this.lastDrawnId, this.state.config.redDora);
  }

  private doDiscard(seat: Seat, t: Tile, tsumogiri: boolean): void {
    const player = this.state.players[seat];
    // 手牌から 1 枚抜く
    const idx = player.hand.findIndex((x) => x === t);
    if (idx < 0) throw new Error(`doDiscard: tile "${t}" not in hand`);
    player.hand = [...player.hand.slice(0, idx), ...player.hand.slice(idx + 1)];
    player.hand = sortTiles(player.hand);

    const entry: DiscardEntry = {
      tile: t,
      junme: this.state.turn.junme + 1,
      tsumogiri,
      isRiichiDeclaration: false,
      calledBy: null,
    };
    player.discards.push(entry);

    this.state.history.push({
      kind: 'action',
      seat,
      action: { kind: 'discard', tile: t, tsumogiri },
    });

    // 次のプレイヤーへ
    const next = ((seat + 1) % 4) as Seat;
    this.state.turn.seat = next;
    this.state.turn.phase = 'draw';
    if (next === this.state.dealerSeat) {
      this.state.turn.junme += 1;
    }
    this.lastDrawnId = null;
  }

  /** 観測（そのプレイヤーが見える情報のみ） */
  getObservation(seat: Seat): Observation {
    const me = this.state.players[seat];
    return {
      seat,
      phase: this.state.turn.phase,
      currentTurn: this.state.turn.seat,
      junme: this.state.turn.junme,
      remainingDraws: remainingDraws(this.state.wall),
      round: this.state.round,
      dealerSeat: this.state.dealerSeat,
      dice: [this.state.wall.dice[0], this.state.wall.dice[1]],
      doraIndicators: getDoraIndicators(this.state.wall, this.state.config.redDora),
      myHand: [...me.hand],
      myMelds: [...me.melds],
      myScore: me.score,
      players: this.state.players.map((p) => ({
        seat: p.seat,
        melds: [...p.melds],
        discards: [...p.discards],
        score: p.score,
        riichi: p.riichi ? { ...p.riichi } : null,
      })),
    };
  }

  /** デバッグ用: 全状態を返す */
  debugState(): GameState {
    return this.state;
  }

  /** ログイベント全件 */
  events(): GameEvent[] {
    return [...this.state.history];
  }
}

/** プレイヤーが受け取る観測情報 */
export interface Observation {
  seat: Seat;
  phase: GameState['turn']['phase'];
  currentTurn: Seat;
  junme: number;
  remainingDraws: number;
  round: GameState['round'];
  dealerSeat: Seat;
  /** 親が振ったサイコロ（観測情報として全員が見る） */
  dice: [number, number];
  /** 公開済みドラ表示牌 */
  doraIndicators: Tile[];
  myHand: Tile[];
  myMelds: PlayerState['melds'];
  myScore: number;
  players: Array<{
    seat: Seat;
    melds: PlayerState['melds'];
    discards: PlayerState['discards'];
    score: number;
    riichi: PlayerState['riichi'];
  }>;
}
