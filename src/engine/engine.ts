import type {
  GameState,
  PlayerState,
  RuleConfig,
  GameEvent,
  DiscardEntry,
  PendingCall,
} from '../types/state.js';
import type { Tile, TileId } from '../types/tile.js';
import type { Seat } from '../types/seat.js';
import type { Action } from '../types/action.js';
import type { ScoreCalculator } from '../score/calculator.js';
import { DEFAULT_RULES } from '../types/state.js';
import { dealWall, drawTile, remainingDraws, getDoraIndicators, getUraDoraIndicators } from '../wall/wall.js';
import { sortTiles, tileIdToTile, tileKind } from '../tiles/tile.js';
import { seatWind, nextSeat } from '../types/seat.js';
import {
  getDiscardCandidates,
  getCallCandidates,
  fallbackAction,
  isLegalDiscard,
} from './legal.js';
import {
  isSelfDiscardFuriten,
  applyPassFuriten,
  resetSameTurnFuriten,
} from './furiten.js';
import { computeTsumoPayout, computeRonPayout, riichiSticksWinner } from '../score/payout.js';

export interface EngineOptions {
  rules?: Partial<RuleConfig>;
  rngSeed: number;
  dealerSeat?: Seat;
  round?: { wind: 'E' | 'S'; kyoku: 1 | 2 | 3 | 4; honba: number; riichiSticks: number };
  initialScores?: [number, number, number, number];
  /** Phase 2a: 役判定・点数計算。未指定時は打牌のみ (Phase 1 互換) */
  calculator?: ScoreCalculator;
}

export class GameEngine {
  state: GameState;
  private lastDrawnId: TileId | null = null;
  private calc: ScoreCalculator | null;

  constructor(opts: EngineOptions) {
    const rules: RuleConfig = { ...DEFAULT_RULES, ...opts.rules };
    const dealerSeat = opts.dealerSeat ?? 0;
    const round = opts.round ?? { wind: 'E', kyoku: 1, honba: 0, riichiSticks: 0 };
    const startingScore = rules.startingPoints;
    const scores = opts.initialScores ?? [
      startingScore, startingScore, startingScore, startingScore,
    ];

    this.calc = opts.calculator ?? null;
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
      pendingCalls: [],
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

  isOver(): boolean {
    return this.state.turn.phase === 'end';
  }

  legalActions(seat: Seat): Action[] {
    const phase = this.state.turn.phase;

    if (phase === 'call') {
      return getCallCandidates(this.state, seat);
    }

    if (phase !== 'discard' || this.state.turn.seat !== seat) return [];

    const player = this.state.players[seat];
    const actions: Action[] = [];

    // tsumo 判定 (calculator 必要)
    if (this.calc && !player.riichi) {
      const tsumoResult = this.calc.calculateAgari({
        closedHand: player.hand,
        openMelds: player.melds,
        winTile: player.hand[player.hand.length - 1]!,
        isTsumo: true,
        seatWind: seatWind(seat, this.state.dealerSeat),
        roundWind: this.state.round.wind,
        doraIndicators: getDoraIndicators(this.state.wall, this.state.config.redDora),
        uraDoraIndicators: [],
        isRiichi: false,
        isIppatsu: false,
        isDoubleRiichi: false,
        isRinshan: false,
        isHaitei: remainingDraws(this.state.wall) === 0,
        isHoutei: false,
        isChankan: false,
        rules: this.state.config,
      });
      if (tsumoResult.isAgari) {
        actions.push({ kind: 'tsumo' });
      }
    }
    // リーチ中ツモ
    if (this.calc && player.riichi) {
      const tsumoResult = this.calc.calculateAgari({
        closedHand: player.hand,
        openMelds: player.melds,
        winTile: player.hand[player.hand.length - 1]!,
        isTsumo: true,
        seatWind: seatWind(seat, this.state.dealerSeat),
        roundWind: this.state.round.wind,
        doraIndicators: getDoraIndicators(this.state.wall, this.state.config.redDora),
        uraDoraIndicators: player.isFuriten ? [] : getUraDoraIndicators(this.state.wall, this.state.config.redDora),
        isRiichi: true,
        isIppatsu: player.riichi.ippatsu,
        isDoubleRiichi: player.riichi.isDouble,
        isRinshan: false,
        isHaitei: remainingDraws(this.state.wall) === 0,
        isHoutei: false,
        isChankan: false,
        rules: this.state.config,
      });
      if (tsumoResult.isAgari) {
        actions.push({ kind: 'tsumo' });
      }
    }

    // リーチ宣言候補 (calculator 必要、未リーチ、score >= 1000)
    if (this.calc && !player.riichi && player.score >= 1000) {
      const candidates = this.calc.riichiCandidates(player.hand, player.melds);
      for (const { discard } of candidates) {
        actions.push({ kind: 'riichi', tile: discard });
      }
    }

    // 打牌候補
    actions.push(...getDiscardCandidates(this.state, seat));

    return actions;
  }

  step(): void {
    if (this.state.turn.phase === 'draw') {
      this.doDraw();
    }
  }

  private doDraw(): void {
    const seat = this.state.turn.seat;
    const drawn = drawTile(this.state.wall);
    if (!drawn) {
      this.state.history.push({ kind: 'ryukyoku', reason: 'exhaustive_draw' });
      this.state.turn.phase = 'end';
      return;
    }
    const tile = tileIdToTile(drawn.tile, this.state.config.redDora);
    this.lastDrawnId = drawn.tile;
    this.state.wall = drawn.wall;
    const player = this.state.players[seat];

    // ツモ牌を手牌末尾に置く
    player.hand = [...sortTiles(player.hand.slice(0, 13)), tile];

    // 同巡フリテン解除 (リーチ後永続フリテンは維持)
    if (!player.riichi || !player.isFuriten) {
      const waits = this.calc ? this.calc.waitTiles(player.hand.slice(0, 13), player.melds) : [];
      this.state.players[seat] = resetSameTurnFuriten(player, waits);
    }

    // 一発フラグを消す (自分がツモると一発消滅)
    if (player.riichi?.ippatsu) {
      this.state.players[seat] = {
        ...this.state.players[seat],
        riichi: { ...player.riichi!, ippatsu: false },
      };
    }

    this.state.turn.phase = 'discard';
    this.state.history.push({ kind: 'draw', seat, tile });
  }

  applyAction(seat: Seat, action: Action): void {
    const phase = this.state.turn.phase;

    if (phase === 'call') {
      this.applyCallAction(seat, action);
      return;
    }

    if (phase !== 'discard') {
      throw new Error(`applyAction: wrong phase (${phase})`);
    }
    if (this.state.turn.seat !== seat) {
      throw new Error(`applyAction: not your turn`);
    }

    if (action.kind === 'tsumo') {
      this.doTsumo(seat);
      return;
    }

    if (action.kind === 'riichi') {
      // リーチ宣言の合法性チェック
      const player = this.state.players[seat];
      if (player.riichi) {
        // 既にリーチ中 → 違反 → ツモ切り
        const replacement = fallbackAction(this.state, seat);
        this.state.history.push({
          kind: 'violation',
          seat,
          attempted: action,
          reason: 'already in riichi',
          replacement,
        });
        this.doDiscard(seat, replacement.tile, true);
        return;
      }
      this.doRiichiDeclaration(seat, action.tile);
      return;
    }

    if (action.kind === 'discard') {
      if (!isLegalDiscard(this.state, seat, action)) {
        const replacement = fallbackAction(this.state, seat);
        this.state.history.push({
          kind: 'violation',
          seat,
          attempted: action,
          reason: `tile "${action.tile}" not in hand`,
          replacement,
        });
        this.doDiscard(seat, replacement.tile, true);
        return;
      }
      const isTsumogiri = action.tile === this.lastTileForSeat(seat);
      this.doDiscard(seat, action.tile, isTsumogiri);
      return;
    }

    // その他のアクション (Phase 1 互換: 違反として強制ツモ切り)
    const replacement = fallbackAction(this.state, seat);
    this.state.history.push({
      kind: 'violation',
      seat,
      attempted: action,
      reason: `action "${action.kind}" not supported in current phase`,
      replacement,
    });
    this.doDiscard(seat, replacement.tile, true);
  }

  private applyCallAction(seat: Seat, action: Action): void {
    const pending = this.state.pendingCalls.find(p => p.seat === seat && !p.responded);
    if (!pending) return;

    if (action.kind === 'ron') {
      if (!pending.canRon) {
        // フリテン等で実際にロンできない → パス扱い
        pending.responded = true;
        pending.response = 'pass';
      } else {
        pending.responded = true;
        pending.response = 'ron';
      }
    } else {
      // pass (または不正アクション)
      if (pending.canRon) {
        // パスしたのでフリテン
        this.state.players[seat] = applyPassFuriten(this.state.players[seat], this.lastDiscardedTile()!);
      }
      pending.responded = true;
      pending.response = 'pass';
    }

    // 全員応答済みか確認
    const allResponded = this.state.pendingCalls.every(p => p.responded);
    if (allResponded) {
      this.resolveCallPhase();
    }
  }

  private lastDiscardedTile(): Tile | null {
    for (let i = this.state.history.length - 1; i >= 0; i--) {
      const ev = this.state.history[i]!;
      if (ev.kind === 'action' && ev.action.kind === 'discard') {
        return ev.action.tile;
      }
      if (ev.kind === 'riichi') {
        return ev.tile;
      }
    }
    return null;
  }

  private resolveCallPhase(): void {
    const ronners = this.state.pendingCalls
      .filter(p => p.response === 'ron')
      .map(p => p.seat);

    this.state.pendingCalls = [];

    if (ronners.length > 0) {
      // 放銃者は直前の打牌プレイヤー
      const loser = this.lastDiscardTurn();
      const discardedTile = this.lastDiscardedTile()!;
      this.doRon(ronners, loser, discardedTile);
    } else {
      // 全員パス → 次のプレイヤーへ
      this.advanceToNextDraw();
    }
  }

  private lastDiscardTurn(): Seat {
    for (let i = this.state.history.length - 1; i >= 0; i--) {
      const ev = this.state.history[i]!;
      if (ev.kind === 'action' && (ev.action.kind === 'discard' || ev.action.kind === 'riichi')) {
        return ev.seat;
      }
      if (ev.kind === 'riichi') {
        return ev.seat;
      }
    }
    throw new Error('resolveCallPhase: no discard found in history');
  }

  private doTsumo(seat: Seat): void {
    if (!this.calc) {
      throw new Error('doTsumo: no calculator');
    }
    const player = this.state.players[seat];
    const winTile = player.hand[player.hand.length - 1]!;
    const isHaitei = remainingDraws(this.state.wall) === 0;

    const uraDoraIndicators = player.riichi
      ? getUraDoraIndicators(this.state.wall, this.state.config.redDora)
      : [];

    const result = this.calc.calculateAgari({
      closedHand: player.hand,
      openMelds: player.melds,
      winTile,
      isTsumo: true,
      seatWind: seatWind(seat, this.state.dealerSeat),
      roundWind: this.state.round.wind,
      doraIndicators: getDoraIndicators(this.state.wall, this.state.config.redDora),
      uraDoraIndicators,
      isRiichi: !!player.riichi,
      isIppatsu: player.riichi?.ippatsu ?? false,
      isDoubleRiichi: player.riichi?.isDouble ?? false,
      isRinshan: false,
      isHaitei,
      isHoutei: false,
      isChankan: false,
      rules: this.state.config,
    });

    if (!result.isAgari) {
      // 計算上和了でない → 強制ツモ切り
      const replacement = fallbackAction(this.state, seat);
      this.state.history.push({
        kind: 'violation',
        seat,
        attempted: { kind: 'tsumo' },
        reason: 'tsumo: hand is not agari',
        replacement,
      });
      this.doDiscard(seat, replacement.tile, true);
      return;
    }

    const deltas = computeTsumoPayout(
      seat,
      this.state.dealerSeat,
      result,
      this.state.round.honba,
      this.state.round.riichiSticks,
    );
    for (const { seat: s, delta } of deltas) {
      this.state.players[s].score += delta;
    }
    this.state.round.riichiSticks = 0;

    this.state.history.push({
      kind: 'agari',
      winner: seat,
      from: 'tsumo',
      han: result.han,
      fu: result.fu,
      score: result.score,
    });
    this.state.turn.phase = 'end';
  }

  private doRiichiDeclaration(seat: Seat, tile: Tile): void {
    const player = this.state.players[seat];

    // 宣言牌が手牌にあるか確認
    if (!player.hand.some(t => t === tile)) {
      const replacement = fallbackAction(this.state, seat);
      this.state.history.push({
        kind: 'violation',
        seat,
        attempted: { kind: 'riichi', tile },
        reason: `riichi tile "${tile}" not in hand`,
        replacement,
      });
      this.doDiscard(seat, replacement.tile, true);
      return;
    }

    const isDouble = this.state.turn.junme === 0 && player.discards.length === 0;

    // リーチ棒
    player.score -= 1000;
    this.state.round.riichiSticks += 1;

    // リーチ状態セット
    this.state.players[seat] = {
      ...player,
      score: player.score, // already decremented
      riichi: {
        declared: true,
        junme: this.state.turn.junme,
        isDouble,
        ippatsu: true,
      },
    };

    this.state.history.push({
      kind: 'riichi',
      seat,
      tile,
      junme: this.state.turn.junme,
    });

    this.doDiscard(seat, tile, false, true);
  }

  private doDiscard(seat: Seat, t: Tile, tsumogiri: boolean, isRiichiDeclaration = false): void {
    const player = this.state.players[seat];
    const idx = player.hand.findIndex((x) => x === t);
    if (idx < 0) throw new Error(`doDiscard: tile "${t}" not in hand`);

    player.hand = [...player.hand.slice(0, idx), ...player.hand.slice(idx + 1)];
    player.hand = sortTiles(player.hand);

    // 一発フラグを消す (自分が打牌すると他者の一発も消える)
    for (const p of this.state.players) {
      if (p.riichi?.ippatsu) {
        this.state.players[p.seat] = {
          ...p,
          riichi: { ...p.riichi!, ippatsu: false },
        };
      }
    }

    const entry: DiscardEntry = {
      tile: t,
      junme: this.state.turn.junme + 1,
      tsumogiri,
      isRiichiDeclaration,
      calledBy: null,
    };
    player.discards.push(entry);

    this.state.history.push({
      kind: 'action',
      seat,
      action: { kind: 'discard', tile: t, tsumogiri },
    });

    this.lastDrawnId = null;

    // junme 更新
    const next = nextSeat(seat);
    if (next === this.state.dealerSeat) {
      this.state.turn.junme += 1;
    }

    // call phase へ (calculator あり)
    if (this.calc) {
      this.enterCallPhase(seat, t);
    } else {
      this.state.turn.seat = next;
      this.state.turn.phase = 'draw';
    }
  }

  private enterCallPhase(discarder: Seat, discardedTile: Tile): void {
    const pendingCalls: PendingCall[] = [];

    for (let i = 1; i <= 3; i++) {
      const s = ((discarder + i) % 4) as Seat;
      const p = this.state.players[s];
      if (p.hand.length !== 13) continue;

      const waits = this.calc!.waitTiles(p.hand, p.melds);
      const discardKind = tileKind(discardedTile);
      const isInWaits = waits.some(w => tileKind(w) === discardKind);

      if (!isInWaits) continue;

      const furiten = p.isFuriten || isSelfDiscardFuriten(p, waits);
      if (furiten) {
        // フリテン → ロン不可 (isFuriten を更新)
        if (!p.isFuriten) {
          this.state.players[s] = { ...p, isFuriten: true };
        }
        continue;
      }

      // ロン可能 → 応答待ちに追加
      pendingCalls.push({ seat: s, canRon: true, responded: false, response: null });
    }

    if (pendingCalls.length > 0) {
      this.state.pendingCalls = pendingCalls;
      this.state.turn.phase = 'call';
    } else {
      this.advanceToNextDraw();
    }
  }

  private doRon(winners: Seat[], loser: Seat, discardedTile: Tile): void {
    const sticksWinner = riichiSticksWinner(winners, loser);
    const honba = this.state.round.honba;

    for (const winner of winners) {
      const p = this.state.players[winner];
      const uraDoraIndicators = p.riichi
        ? getUraDoraIndicators(this.state.wall, this.state.config.redDora)
        : [];

      const result = this.calc!.calculateAgari({
        closedHand: p.hand,
        openMelds: p.melds,
        winTile: discardedTile,
        isTsumo: false,
        seatWind: seatWind(winner, this.state.dealerSeat),
        roundWind: this.state.round.wind,
        doraIndicators: getDoraIndicators(this.state.wall, this.state.config.redDora),
        uraDoraIndicators,
        isRiichi: !!p.riichi,
        isIppatsu: p.riichi?.ippatsu ?? false,
        isDoubleRiichi: p.riichi?.isDouble ?? false,
        isRinshan: false,
        isHaitei: false,
        isHoutei: remainingDraws(this.state.wall) === 0,
        isChankan: false,
        rules: this.state.config,
      });

      const sticks = winner === sticksWinner ? this.state.round.riichiSticks : 0;
      const deltas = computeRonPayout(winner, loser, result, honba, sticks);
      for (const { seat: s, delta } of deltas) {
        this.state.players[s].score += delta;
      }

      this.state.history.push({
        kind: 'agari',
        winner,
        from: loser,
        han: result.han,
        fu: result.fu,
        score: result.score,
      });
    }

    this.state.round.riichiSticks = 0;
    this.state.turn.phase = 'end';
  }

  private advanceToNextDraw(): void {
    // 次のプレイヤーへ (doDiscard 内で junme は既に更新済み)
    const discarder = this.lastDiscardTurn();
    const next = nextSeat(discarder);
    this.state.turn.seat = next;
    this.state.turn.phase = 'draw';
  }

  private lastTileForSeat(seat: Seat): Tile | null {
    if (this.lastDrawnId == null) return null;
    if (this.state.turn.seat !== seat) return null;
    return tileIdToTile(this.lastDrawnId, this.state.config.redDora);
  }

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
      myRiichi: me.riichi,
      myFuriten: me.isFuriten,
      pendingCalls: this.state.pendingCalls.filter(p => !p.responded).map(p => p.seat),
      players: this.state.players.map((p) => ({
        seat: p.seat,
        melds: [...p.melds],
        discards: [...p.discards],
        score: p.score,
        riichi: p.riichi ? { ...p.riichi } : null,
      })),
    };
  }

  debugState(): GameState {
    return this.state;
  }

  events(): GameEvent[] {
    return [...this.state.history];
  }
}

export interface Observation {
  seat: Seat;
  phase: GameState['turn']['phase'];
  currentTurn: Seat;
  junme: number;
  remainingDraws: number;
  round: GameState['round'];
  dealerSeat: Seat;
  dice: [number, number];
  doraIndicators: Tile[];
  myHand: Tile[];
  myMelds: PlayerState['melds'];
  myScore: number;
  myRiichi: PlayerState['riichi'];
  myFuriten: boolean;
  /** call phase で応答待ちの席 */
  pendingCalls: Seat[];
  players: Array<{
    seat: Seat;
    melds: PlayerState['melds'];
    discards: PlayerState['discards'];
    score: number;
    riichi: PlayerState['riichi'];
  }>;
}
