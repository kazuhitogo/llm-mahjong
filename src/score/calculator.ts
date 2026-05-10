import { createRequire } from 'node:module';
import type { Tile, TileKind } from '../types/tile.js';
import type { Meld } from '../types/meld.js';
import type { Wind } from '../types/seat.js';
import type { RuleConfig } from '../types/state.js';
import { tileKind, indicatorToDora, isAkaDora, kindToTile } from '../tiles/tile.js';

const _require = createRequire(import.meta.url);
const { calc: _rsCalc } = _require('riichi-rs-node') as RsModule;

interface RsOptions {
  dora?: number[];
  aka_count?: number;
  first_take?: boolean;
  riichi?: boolean;
  ippatsu?: boolean;
  double_riichi?: boolean;
  after_kan?: boolean;
  tile_discarded_by_someone?: number;
  bakaze?: number;
  jikaze?: number;
  allow_aka?: boolean;
  allow_kuitan?: boolean;
  last_tile?: boolean;
}

interface RsInput {
  closed_part: number[];
  open_part: Array<[boolean, number[]]>;
  options: RsOptions;
  calc_hairi?: boolean;
}

interface RsHairi {
  now: number;
  wait: number[];
  waits_after_discard: Array<[number, number[]]>;
}

interface RsResult {
  is_agari: boolean;
  yakuman: number;
  han: number;
  fu: number;
  ten: number;
  outgoing_ten: [number, number];
  yaku: Record<string, number>;
  hairi?: RsHairi;
}

type RsModule = { calc: (input: RsInput) => RsResult };

function tileToRs(t: Tile): number {
  const num = t[0] === '0' ? 5 : Number(t[0]);
  const suit = t[1];
  if (suit === 'm') return num;
  if (suit === 'p') return num + 9;
  if (suit === 's') return num + 18;
  return num + 27;
}

function windToRs(w: Wind): number {
  if (w === 'E') return 28;
  if (w === 'S') return 29;
  if (w === 'W') return 30;
  return 31;
}

function doraIndicatorsToRsDoras(indicators: Tile[]): number[] {
  return indicators.map(ind => tileToRs(kindToTile(indicatorToDora(ind))));
}

function meldToRs(meld: Meld): [boolean, number[]] {
  return [meld.kind !== 'ankan', meld.tiles.map(tileToRs)];
}

export interface AgariInput {
  /** 13 tiles for ron; 14 tiles (win tile last) for tsumo */
  closedHand: Tile[];
  openMelds: Meld[];
  winTile: Tile;
  isTsumo: boolean;
  seatWind: Wind;
  roundWind: Wind;
  doraIndicators: Tile[];
  uraDoraIndicators: Tile[];
  isRiichi: boolean;
  isIppatsu: boolean;
  isDoubleRiichi: boolean;
  isRinshan: boolean;
  isHaitei: boolean;
  isHoutei: boolean;
  isChankan: boolean;
  rules: Pick<RuleConfig, 'redDora' | 'openTanyao'>;
}

export interface AgariResult {
  isAgari: boolean;
  han: number;
  fu: number;
  /** Total score points (before payout distribution) */
  score: number;
  /** [dealer-portion on non-dealer tsumo or per-payer on dealer tsumo, non-dealer portion] */
  outgoingScore: [number, number];
  yakuman: number;
  /** yaku ID → han count */
  yaku: Record<number, number>;
}

export interface ScoreCalculator {
  calculateAgari(input: AgariInput): AgariResult;
  /** Shanten number for a closed hand (13 tiles typical). 0=tenpai, -1=complete. */
  calculateShanten(closedTiles: Tile[], openMelds: Meld[]): number;
  /** For a 14-tile hand, returns discard→waits pairs for riichi candidates. */
  riichiCandidates(hand14: Tile[], openMelds: Meld[]): Array<{ discard: Tile; waits: Tile[] }>;
  /** For a 13-tile tenpai hand, returns the completing tiles. */
  waitTiles(hand13: Tile[], openMelds: Meld[]): Tile[];
}

export class RiichiRsCalculator implements ScoreCalculator {
  calculateAgari(input: AgariInput): AgariResult {
    const doras = [
      ...doraIndicatorsToRsDoras(input.doraIndicators),
      ...doraIndicatorsToRsDoras(input.uraDoraIndicators),
    ];
    const allTiles = [...input.closedHand, ...input.openMelds.flatMap(m => m.tiles)];
    const aka = allTiles.filter(isAkaDora).length;

    const closedPart = input.closedHand.map(tileToRs);
    const tileDiscardedBySomeone = input.isTsumo ? -1 : tileToRs(input.winTile);

    const result = _rsCalc({
      closed_part: closedPart,
      open_part: input.openMelds.map(meldToRs),
      options: {
        dora: doras,
        aka_count: aka,
        riichi: input.isRiichi,
        ippatsu: input.isIppatsu,
        double_riichi: input.isDoubleRiichi,
        after_kan: input.isRinshan || input.isChankan,
        tile_discarded_by_someone: tileDiscardedBySomeone,
        bakaze: windToRs(input.roundWind),
        jikaze: windToRs(input.seatWind),
        allow_aka: input.rules.redDora,
        allow_kuitan: input.rules.openTanyao,
        last_tile: input.isHaitei || input.isHoutei,
      },
      calc_hairi: false,
    });

    return {
      isAgari: result.is_agari,
      han: result.han,
      fu: result.fu,
      score: result.ten,
      outgoingScore: result.outgoing_ten,
      yakuman: result.yakuman,
      yaku: Object.fromEntries(Object.entries(result.yaku).map(([k, v]) => [parseInt(k), v])),
    };
  }

  calculateShanten(closedTiles: Tile[], openMelds: Meld[]): number {
    const result = _rsCalc({
      closed_part: closedTiles.map(tileToRs),
      open_part: openMelds.map(meldToRs),
      options: { tile_discarded_by_someone: -1, bakaze: 28, jikaze: 28 },
      calc_hairi: true,
    });
    return result.hairi?.now ?? 8;
  }

  riichiCandidates(hand14: Tile[], openMelds: Meld[]): Array<{ discard: Tile; waits: Tile[] }> {
    const result = _rsCalc({
      closed_part: hand14.map(tileToRs),
      open_part: openMelds.map(meldToRs),
      options: { tile_discarded_by_someone: -1, bakaze: 28, jikaze: 28 },
      calc_hairi: true,
    });

    const hairi = result.hairi;
    if (!hairi || hairi.waits_after_discard.length === 0) return [];

    const kindMap = new Map<number, Tile[]>();
    for (const t of hand14) {
      const k = tileKind(t);
      if (!kindMap.has(k)) kindMap.set(k, []);
      kindMap.get(k)!.push(t);
    }

    const seen = new Set<number>();
    const candidates: Array<{ discard: Tile; waits: Tile[] }> = [];

    for (const [dk, wks] of hairi.waits_after_discard) {
      if (seen.has(dk)) continue;
      seen.add(dk);
      const waits = wks.map(k => kindToTile(k as TileKind));
      for (const discardTile of (kindMap.get(dk) ?? [])) {
        candidates.push({ discard: discardTile, waits });
      }
    }

    return candidates;
  }

  waitTiles(hand13: Tile[], openMelds: Meld[]): Tile[] {
    const result = _rsCalc({
      closed_part: hand13.map(tileToRs),
      open_part: openMelds.map(meldToRs),
      options: { tile_discarded_by_someone: -1, bakaze: 28, jikaze: 28 },
      calc_hairi: true,
    });
    const hairi = result.hairi;
    if (!hairi || hairi.now !== 0) return [];
    return hairi.wait.map(k => kindToTile(k as TileKind));
  }
}
