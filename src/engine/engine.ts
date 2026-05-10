import type {
  GameState,
  PlayerState,
  RuleConfig,
  GameEvent,
  DiscardEntry,
  PendingCall,
} from '../types/state.js';
import type { Tile, TileId, TileKind } from '../types/tile.js';
import type { Meld } from '../types/meld.js';
import type { Seat } from '../types/seat.js';
import type { Action } from '../types/action.js';
import type { ScoreCalculator } from '../score/calculator.js';
import { DEFAULT_RULES } from '../types/state.js';
import {
  dealWall,
  drawTile,
  remainingDraws,
  getDoraIndicators,
  getUraDoraIndicators,
  rinshanTileId,
  deadWallTileId,
} from '../wall/wall.js';
import { sortTiles, tileIdToTile, tileKind, kindToTile } from '../tiles/tile.js';
import { seatWind, nextSeat } from '../types/seat.js';
import {
  getDiscardCandidates,
  getCallCandidates,
  fallbackAction,
  isLegalDiscard,
  ponCandidates,
  chiCandidates,
  daiminkanCandidate,
  ankanCandidates,
  kakanCandidates,
  effectiveCount,
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
      chiKuikaeKinds: [],
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
      const discardedTile = this.lastDiscardedTile();
      if (!discardedTile) return [];
      return getCallCandidates(this.state, seat, discardedTile);
    }

    if (phase !== 'discard' || this.state.turn.seat !== seat) return [];

    const player = this.state.players[seat];
    const actions: Action[] = [];

    // ツモ和了 (calculator あり)
    if (this.calc) {
      const isTsumoAgari = this.checkTsumoAgari(seat, player);
      if (isTsumoAgari) actions.push({ kind: 'tsumo' });
    }

    // リーチ宣言 (未リーチ・score >= 1000)
    if (this.calc && !player.riichi && player.score >= 1000) {
      const candidates = this.calc.riichiCandidates(player.hand, player.melds);
      for (const { discard } of candidates) {
        actions.push({ kind: 'riichi', tile: discard });
      }
    }

    // 暗槓 / 加槓 (calculator あり)
    if (this.calc) {
      for (const a of ankanCandidates(player)) actions.push(a);
      for (const a of kakanCandidates(player)) actions.push(a);
    }

    // 打牌
    actions.push(...getDiscardCandidates(this.state, seat));

    return actions;
  }

  private checkTsumoAgari(seat: Seat, player: PlayerState): boolean {
    if (!this.calc) return false;
    if (effectiveCount(player) !== 14) return false;
    const winTile = player.hand[player.hand.length - 1]!;
    const result = this.calc.calculateAgari({
      closedHand: player.hand,
      openMelds: player.melds,
      winTile,
      isTsumo: true,
      seatWind: seatWind(seat, this.state.dealerSeat),
      roundWind: this.state.round.wind,
      doraIndicators: getDoraIndicators(this.state.wall, this.state.config.redDora),
      uraDoraIndicators: player.riichi
        ? getUraDoraIndicators(this.state.wall, this.state.config.redDora)
        : [],
      isRiichi: !!player.riichi,
      isIppatsu: player.riichi?.ippatsu ?? false,
      isDoubleRiichi: player.riichi?.isDouble ?? false,
      isRinshan: false,
      isHaitei: remainingDraws(this.state.wall) === 0,
      isHoutei: false,
      isChankan: false,
      rules: this.state.config,
    });
    return result.isAgari;
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
    player.hand = [...sortTiles(player.hand.slice(0, player.hand.length)), tile];

    // 同巡フリテン解除 (リーチ後永続フリテンは維持)
    if (this.calc && !(player.riichi && player.isFuriten)) {
      const waits = this.calc.waitTiles(player.hand.slice(0, -1), player.melds);
      this.state.players[seat] = resetSameTurnFuriten(this.state.players[seat], waits);
    }

    // 自分のドロー → 自分の ippatsu を消す
    if (player.riichi?.ippatsu) {
      this.state.players[seat] = {
        ...this.state.players[seat],
        riichi: { ...this.state.players[seat].riichi!, ippatsu: false },
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
      this.doRiichiDeclaration(seat, action.tile);
      return;
    }

    if (action.kind === 'ankan') {
      this.doAnkan(seat, action.tile);
      return;
    }

    if (action.kind === 'kakan') {
      this.doKakan(seat, action.tile);
      return;
    }

    if (action.kind === 'discard') {
      if (!isLegalDiscard(this.state, seat, action)) {
        const replacement = fallbackAction(this.state, seat);
        this.state.history.push({
          kind: 'violation',
          seat,
          attempted: action,
          reason: `tile "${action.tile}" not in hand or kuikae`,
          replacement,
        });
        this.doDiscard(seat, replacement.tile, true);
        return;
      }
      const isTsumogiri = action.tile === this.lastTileForSeat(seat);
      this.doDiscard(seat, action.tile, isTsumogiri);
      return;
    }

    // 違反
    const replacement = fallbackAction(this.state, seat);
    this.state.history.push({
      kind: 'violation',
      seat,
      attempted: action,
      reason: `action "${action.kind}" not supported`,
      replacement,
    });
    this.doDiscard(seat, replacement.tile, true);
  }

  private applyCallAction(seat: Seat, action: Action): void {
    const pending = this.state.pendingCalls.find(p => p.seat === seat && !p.responded);
    if (!pending) return;

    switch (action.kind) {
      case 'ron':
        if (!pending.canRon) {
          pending.responded = true;
          pending.response = 'pass';
        } else {
          pending.responded = true;
          pending.response = 'ron';
        }
        break;
      case 'pon':
        if (!pending.canPon) {
          pending.responded = true;
          pending.response = 'pass';
        } else {
          pending.responded = true;
          pending.response = 'pon';
          pending.responseDetails = { tiles: action.tiles };
        }
        break;
      case 'daiminkan':
        if (!pending.canDaiminkan) {
          pending.responded = true;
          pending.response = 'pass';
        } else {
          pending.responded = true;
          pending.response = 'daiminkan';
        }
        break;
      case 'chi':
        if (!pending.canChi) {
          pending.responded = true;
          pending.response = 'pass';
        } else {
          pending.responded = true;
          pending.response = 'chi';
          pending.responseDetails = { tiles: action.tiles };
        }
        break;
      default:
        // pass または不正
        if (pending.canRon) {
          this.state.players[seat] = applyPassFuriten(
            this.state.players[seat],
            this.lastDiscardedTile()!,
          );
        }
        pending.responded = true;
        pending.response = 'pass';
        break;
    }

    if (this.state.pendingCalls.every(p => p.responded)) {
      this.resolveCallPhase();
    }
  }

  private resolveCallPhase(): void {
    const calls = this.state.pendingCalls;
    this.state.pendingCalls = [];

    const discarder = this.lastDiscardTurn();
    const discardedTile = this.lastDiscardedTile()!;

    // 優先度: ロン > ポン/大明槓 > チー
    const ronners = calls.filter(p => p.response === 'ron').map(p => p.seat);
    if (ronners.length > 0) {
      this.doRon(ronners, discarder, discardedTile);
      return;
    }

    const ponner = calls.find(p => p.response === 'pon');
    const daiminkanCaller = calls.find(p => p.response === 'daiminkan');
    const pondmk = ponner ?? daiminkanCaller;
    if (pondmk) {
      // calledBy をセット
      this.markDiscardCalled(discarder, pondmk.seat);
      if (pondmk.response === 'pon') {
        this.doPon(pondmk.seat, pondmk.responseDetails!.tiles, discardedTile, discarder);
      } else {
        this.doDaiminkan(pondmk.seat, discardedTile, discarder);
      }
      return;
    }

    const chier = calls.find(p => p.response === 'chi');
    if (chier) {
      this.markDiscardCalled(discarder, chier.seat);
      this.doChi(chier.seat, chier.responseDetails!.tiles, discardedTile, discarder);
      return;
    }

    // 全員パス → 次のツモへ
    this.advanceToNextDraw(discarder);
  }

  private markDiscardCalled(discarder: Seat, caller: Seat): void {
    const discards = this.state.players[discarder].discards;
    if (discards.length > 0) {
      discards[discards.length - 1]!.calledBy = caller;
    }
  }

  // ---------- ツモ和了 ----------

  private doTsumo(seat: Seat): void {
    if (!this.calc) throw new Error('doTsumo: no calculator');
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
      const replacement = fallbackAction(this.state, seat);
      this.state.history.push({
        kind: 'violation',
        seat,
        attempted: { kind: 'tsumo' },
        reason: 'tsumo: not agari',
        replacement,
      });
      this.doDiscard(seat, replacement.tile, true);
      return;
    }

    const deltas = computeTsumoPayout(
      seat, this.state.dealerSeat, result, this.state.round.honba, this.state.round.riichiSticks,
    );
    for (const { seat: s, delta } of deltas) this.state.players[s].score += delta;
    this.state.round.riichiSticks = 0;

    this.state.history.push({
      kind: 'agari', winner: seat, from: 'tsumo',
      han: result.han, fu: result.fu, score: result.score,
    });
    this.state.turn.phase = 'end';
  }

  // ---------- リーチ宣言 ----------

  private doRiichiDeclaration(seat: Seat, tile: Tile): void {
    const player = this.state.players[seat];

    if (player.riichi || !player.hand.some(t => t === tile)) {
      const replacement = fallbackAction(this.state, seat);
      this.state.history.push({
        kind: 'violation', seat,
        attempted: { kind: 'riichi', tile },
        reason: 'riichi: invalid',
        replacement,
      });
      this.doDiscard(seat, replacement.tile, true);
      return;
    }

    const isDouble = this.state.turn.junme === 0 && player.discards.length === 0;
    player.score -= 1000;
    this.state.round.riichiSticks += 1;

    this.state.players[seat] = {
      ...this.state.players[seat],
      score: player.score,
      riichi: { declared: true, junme: this.state.turn.junme, isDouble, ippatsu: true },
    };

    this.state.history.push({ kind: 'riichi', seat, tile, junme: this.state.turn.junme });
    this.doDiscard(seat, tile, false, true);
  }

  // ---------- 暗槓 ----------

  private doAnkan(seat: Seat, tileRep: Tile): void {
    const player = this.state.players[seat];
    const kind = tileKind(tileRep) as TileKind;
    const matching = player.hand.filter(t => tileKind(t) === kind);
    if (matching.length < 4) {
      const replacement = fallbackAction(this.state, seat);
      this.state.history.push({
        kind: 'violation', seat, attempted: { kind: 'ankan', tile: tileRep },
        reason: 'ankan: need 4 tiles', replacement,
      });
      this.doDiscard(seat, replacement.tile, true);
      return;
    }

    const kanTiles = matching.slice(0, 4);
    player.hand = player.hand.filter(t => !kanTiles.includes(t));
    const meld: Meld = { kind: 'ankan', tiles: kanTiles, from: seat, calledTile: null };
    player.melds.push(meld);

    this.clearAllIppatsu();
    this.state.history.push({ kind: 'meld', seat, meldKind: 'ankan', tiles: kanTiles });

    // 搶槓チェック (暗槓は搶槓なし)
    this.drawRinshanAndContinue(seat, false);
  }

  // ---------- 加槓 ----------

  private doKakan(seat: Seat, tileRep: Tile): void {
    const player = this.state.players[seat];
    const kind = tileKind(tileRep) as TileKind;

    // ポン副露を探す
    const ponMeldIdx = player.melds.findIndex(m => m.kind === 'pon' && tileKind(m.tiles[0]!) === kind);
    const extraTileIdx = player.hand.findIndex(t => tileKind(t) === kind);

    if (ponMeldIdx < 0 || extraTileIdx < 0) {
      const replacement = fallbackAction(this.state, seat);
      this.state.history.push({
        kind: 'violation', seat, attempted: { kind: 'kakan', tile: tileRep },
        reason: 'kakan: no pon meld or no extra tile', replacement,
      });
      this.doDiscard(seat, replacement.tile, true);
      return;
    }

    const extraTile = player.hand[extraTileIdx]!;
    player.hand = [...player.hand.slice(0, extraTileIdx), ...player.hand.slice(extraTileIdx + 1)];

    const ponMeld = player.melds[ponMeldIdx]!;
    const kakanTiles = [...ponMeld.tiles, extraTile];
    player.melds[ponMeldIdx] = { ...ponMeld, kind: 'kakan', tiles: kakanTiles };

    this.clearAllIppatsu();
    this.state.history.push({ kind: 'meld', seat, meldKind: 'kakan', tiles: kakanTiles });

    // 搶槓チェック: 加槓牌で他プレイヤーがロンできるか
    if (this.calc) {
      const chankanRonners = this.checkChankan(seat, extraTile);
      if (chankanRonners.length > 0) {
        this.doRon(chankanRonners, seat, extraTile, true);
        return;
      }
    }

    this.drawRinshanAndContinue(seat, false);
  }

  // ---------- 嶺上ツモ ----------

  private drawRinshanAndContinue(seat: Seat, isRinshanAgari: boolean): void {
    const kanCount = this.state.wall.doraIndicatorCount - 1; // 0-indexed
    if (kanCount >= 4) {
      // 四開槓: Phase 2c で処理。暫定で次ツモへ
      this.advanceToNextDraw(seat);
      return;
    }

    const rinshanId = rinshanTileId(this.state.wall, kanCount);
    const tile = tileIdToTile(rinshanId, this.state.config.redDora);

    // ドラ表示牌をめくる
    this.state.wall = {
      ...this.state.wall,
      doraIndicatorCount: this.state.wall.doraIndicatorCount + 1,
    };

    this.lastDrawnId = rinshanId;

    const player = this.state.players[seat];
    player.hand = [...sortTiles(player.hand), tile];

    this.state.history.push({ kind: 'rinshan', seat, tile });

    // 嶺上ツモ和了チェック
    if (this.calc && this.checkTsumoAgari(seat, player)) {
      // isRinshan フラグを立てて和了計算
      this.doTsumoRinshan(seat, tile);
      return;
    }

    this.state.turn.seat = seat;
    this.state.turn.phase = 'discard';
  }

  private doTsumoRinshan(seat: Seat, winTile: Tile): void {
    if (!this.calc) return;
    const player = this.state.players[seat];

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
      isRinshan: true,
      isHaitei: false,
      isHoutei: false,
      isChankan: false,
      rules: this.state.config,
    });

    if (!result.isAgari) {
      this.state.turn.seat = seat;
      this.state.turn.phase = 'discard';
      return;
    }

    const deltas = computeTsumoPayout(
      seat, this.state.dealerSeat, result, this.state.round.honba, this.state.round.riichiSticks,
    );
    for (const { seat: s, delta } of deltas) this.state.players[s].score += delta;
    this.state.round.riichiSticks = 0;

    this.state.history.push({
      kind: 'agari', winner: seat, from: 'tsumo',
      han: result.han, fu: result.fu, score: result.score,
    });
    this.state.turn.phase = 'end';
  }

  // ---------- 搶槓チェック ----------

  private checkChankan(kanerSeat: Seat, kakanTile: Tile): Seat[] {
    const winners: Seat[] = [];
    for (let i = 1; i <= 3; i++) {
      const s = ((kanerSeat + i) % 4) as Seat;
      const p = this.state.players[s];
      if (p.isFuriten) continue;

      const waits = this.calc!.waitTiles(p.hand, p.melds);
      const k = tileKind(kakanTile);
      if (!waits.some(w => tileKind(w) === k)) continue;
      if (isSelfDiscardFuriten(p, waits)) continue;

      const result = this.calc!.calculateAgari({
        closedHand: p.hand,
        openMelds: p.melds,
        winTile: kakanTile,
        isTsumo: false,
        seatWind: seatWind(s, this.state.dealerSeat),
        roundWind: this.state.round.wind,
        doraIndicators: getDoraIndicators(this.state.wall, this.state.config.redDora),
        uraDoraIndicators: p.riichi
          ? getUraDoraIndicators(this.state.wall, this.state.config.redDora) : [],
        isRiichi: !!p.riichi,
        isIppatsu: false,
        isDoubleRiichi: false,
        isRinshan: false,
        isHaitei: false,
        isHoutei: false,
        isChankan: true,
        rules: this.state.config,
      });
      if (result.isAgari) winners.push(s);
    }
    return winners;
  }

  // ---------- ポン ----------

  private doPon(caller: Seat, handTiles: [Tile, Tile], discardedTile: Tile, discarder: Seat): void {
    const player = this.state.players[caller];

    // 手牌から 2 枚除去
    let hand = [...player.hand];
    for (const t of handTiles) {
      const idx = hand.indexOf(t);
      if (idx >= 0) hand.splice(idx, 1);
    }
    player.hand = sortTiles(hand);

    const meldTiles = [...handTiles, discardedTile] as [Tile, Tile, Tile];
    const meld: Meld = { kind: 'pon', tiles: meldTiles, from: discarder, calledTile: discardedTile };
    player.melds.push(meld);

    this.clearAllIppatsu();
    this.state.history.push({ kind: 'meld', seat: caller, meldKind: 'pon', tiles: meldTiles });

    this.state.turn.seat = caller;
    this.state.turn.phase = 'discard';
    this.state.chiKuikaeKinds = [];
    this.lastDrawnId = null;
  }

  // ---------- チー ----------

  private doChi(caller: Seat, handTiles: [Tile, Tile], discardedTile: Tile, discarder: Seat): void {
    const player = this.state.players[caller];

    let hand = [...player.hand];
    for (const t of handTiles) {
      const idx = hand.indexOf(t);
      if (idx >= 0) hand.splice(idx, 1);
    }
    player.hand = sortTiles(hand);

    const meldTiles = [...handTiles, discardedTile] as [Tile, Tile, Tile];
    const meld: Meld = { kind: 'chi', tiles: meldTiles, from: discarder, calledTile: discardedTile };
    player.melds.push(meld);

    this.clearAllIppatsu();
    this.state.history.push({ kind: 'meld', seat: caller, meldKind: 'chi', tiles: meldTiles });

    // 喰い替え禁止: チー牌と同種を打牌禁止
    this.state.chiKuikaeKinds = [tileKind(discardedTile)];

    this.state.turn.seat = caller;
    this.state.turn.phase = 'discard';
    this.lastDrawnId = null;
  }

  // ---------- 大明槓 ----------

  private doDaiminkan(caller: Seat, discardedTile: Tile, discarder: Seat): void {
    const player = this.state.players[caller];
    const kind = tileKind(discardedTile);

    const matching = player.hand.filter(t => tileKind(t) === kind).slice(0, 3);
    let hand = [...player.hand];
    for (const t of matching) {
      const idx = hand.indexOf(t);
      if (idx >= 0) hand.splice(idx, 1);
    }
    player.hand = sortTiles(hand);

    const meldTiles = [...matching, discardedTile] as Tile[];
    const meld: Meld = {
      kind: 'daiminkan', tiles: meldTiles, from: discarder, calledTile: discardedTile,
    };
    player.melds.push(meld);

    this.clearAllIppatsu();
    this.state.history.push({ kind: 'meld', seat: caller, meldKind: 'daiminkan', tiles: meldTiles });

    this.drawRinshanAndContinue(caller, false);
  }

  // ---------- ロン ----------

  private doRon(winners: Seat[], loser: Seat, discardedTile: Tile, isChankan = false): void {
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
        isChankan,
        rules: this.state.config,
      });

      const sticks = winner === sticksWinner ? this.state.round.riichiSticks : 0;
      const deltas = computeRonPayout(winner, loser, result, honba, sticks);
      for (const { seat: s, delta } of deltas) this.state.players[s].score += delta;

      this.state.history.push({
        kind: 'agari', winner, from: loser,
        han: result.han, fu: result.fu, score: result.score,
      });
    }

    this.state.round.riichiSticks = 0;
    this.state.turn.phase = 'end';
  }

  // ---------- 打牌 ----------

  private doDiscard(seat: Seat, t: Tile, tsumogiri: boolean, isRiichiDeclaration = false): void {
    const player = this.state.players[seat];
    const idx = player.hand.findIndex((x) => x === t);
    if (idx < 0) throw new Error(`doDiscard: tile "${t}" not in hand`);

    player.hand = [...player.hand.slice(0, idx), ...player.hand.slice(idx + 1)];
    player.hand = sortTiles(player.hand);

    const entry: DiscardEntry = {
      tile: t,
      junme: this.state.turn.junme + 1,
      tsumogiri,
      isRiichiDeclaration,
      calledBy: null,
    };
    player.discards.push(entry);

    this.state.chiKuikaeKinds = [];
    this.state.history.push({ kind: 'action', seat, action: { kind: 'discard', tile: t, tsumogiri } });
    this.lastDrawnId = null;

    // junme 更新
    const next = nextSeat(seat);
    if (next === this.state.dealerSeat) {
      this.state.turn.junme += 1;
    }

    if (this.calc) {
      this.enterCallPhase(seat, t);
    } else {
      this.state.turn.seat = next;
      this.state.turn.phase = 'draw';
    }
  }

  // ---------- call phase 入口 ----------

  private enterCallPhase(discarder: Seat, discardedTile: Tile): void {
    const pendingCalls: PendingCall[] = [];
    const k = tileKind(discardedTile);

    for (let i = 1; i <= 3; i++) {
      const s = ((discarder + i) % 4) as Seat;
      const p = this.state.players[s];

      // ロン判定
      let canRon = false;
      {
        const waits = this.calc!.waitTiles(p.hand, p.melds);
        const inWaits = waits.some(w => tileKind(w) === k);
        if (inWaits) {
          const furiten = p.isFuriten || isSelfDiscardFuriten(p, waits);
          if (!furiten) {
            // is_agari チェック
            const ag = this.calc!.calculateAgari({
              closedHand: p.hand,
              openMelds: p.melds,
              winTile: discardedTile,
              isTsumo: false,
              seatWind: seatWind(s, this.state.dealerSeat),
              roundWind: this.state.round.wind,
              doraIndicators: getDoraIndicators(this.state.wall, this.state.config.redDora),
              uraDoraIndicators: [],
              isRiichi: !!p.riichi,
              isIppatsu: p.riichi?.ippatsu ?? false,
              isDoubleRiichi: p.riichi?.isDouble ?? false,
              isRinshan: false, isHaitei: false,
              isHoutei: remainingDraws(this.state.wall) === 0,
              isChankan: false,
              rules: this.state.config,
            });
            canRon = ag.isAgari;
          } else if (!p.isFuriten) {
            this.state.players[s] = { ...p, isFuriten: true };
          }
        }
      }

      // ポン/大明槓/チー判定 (リーチ中は不可)
      const canPon = !p.riichi && ponCandidates(p.hand, discardedTile).length > 0;
      const canDaiminkan = !p.riichi && daiminkanCandidate(p.hand, discardedTile) !== null;
      const isNextPlayer = s === nextSeat(discarder);
      const canChi = !p.riichi && isNextPlayer && chiCandidates(p.hand, discardedTile).length > 0;

      if (canRon || canPon || canDaiminkan || canChi) {
        pendingCalls.push({ seat: s, canRon, canPon, canDaiminkan, canChi, responded: false, response: null });
      }
    }

    if (pendingCalls.length > 0) {
      this.state.pendingCalls = pendingCalls;
      this.state.turn.phase = 'call';
    } else {
      this.advanceToNextDraw(discarder);
    }
  }

  // ---------- ユーティリティ ----------

  private clearAllIppatsu(): void {
    for (const p of this.state.players) {
      if (p.riichi?.ippatsu) {
        this.state.players[p.seat] = {
          ...p,
          riichi: { ...p.riichi!, ippatsu: false },
        };
      }
    }
  }

  private advanceToNextDraw(discarder: Seat): void {
    this.state.turn.seat = nextSeat(discarder);
    this.state.turn.phase = 'draw';
  }

  private lastDiscardedTile(): Tile | null {
    for (let i = this.state.history.length - 1; i >= 0; i--) {
      const ev = this.state.history[i]!;
      if (ev.kind === 'action' && ev.action.kind === 'discard') return ev.action.tile;
      if (ev.kind === 'riichi') return ev.tile;
    }
    return null;
  }

  private lastDiscardTurn(): Seat {
    for (let i = this.state.history.length - 1; i >= 0; i--) {
      const ev = this.state.history[i]!;
      if (ev.kind === 'action' && ev.action.kind === 'discard') return ev.seat;
      if (ev.kind === 'riichi') return ev.seat;
    }
    throw new Error('lastDiscardTurn: no discard in history');
  }

  private lastTileForSeat(seat: Seat): Tile | null {
    if (this.lastDrawnId == null) return null;
    if (this.state.turn.seat !== seat) return null;
    return tileIdToTile(this.lastDrawnId, this.state.config.redDora);
  }

  // ---------- 観測 ----------

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

  debugState(): GameState { return this.state; }
  events(): GameEvent[] { return [...this.state.history]; }
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
  pendingCalls: Seat[];
  players: Array<{
    seat: Seat;
    melds: PlayerState['melds'];
    discards: PlayerState['discards'];
    score: number;
    riichi: PlayerState['riichi'];
  }>;
}
