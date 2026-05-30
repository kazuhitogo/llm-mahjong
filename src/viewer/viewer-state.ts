import type { GameEvent } from '../types/state.js';
import type { Seat } from '../types/seat.js';
import type { Tile } from '../types/tile.js';
import { tileKind } from '../tiles/tile.js';
import type { GameLog } from '../log/log.js';

export type { GameLog };

export interface ViewerDiscard {
  tile: Tile;
  isRiichiDecl: boolean;
  calledBy: number | null;
}

export interface ViewerMeld {
  kind: 'pon' | 'chi' | 'daiminkan' | 'ankan' | 'kakan';
  tiles: Tile[];
  calledTile: Tile | null; // 鳴いて入手し横向き表示する牌（暗槓は null）
  from: number | null;     // 鳴いた相手の相対位置 1=下家 2=対面 3=上家（暗槓は null）
  addedTile?: Tile;        // 加槓で追加した牌（横向き牌の上に重ねる）
}

export interface ViewerPlayer {
  hand: Tile[];
  discards: ViewerDiscard[];
  melds: ViewerMeld[];
  riichi: boolean;
}

export interface ViewerSnapshot {
  eventIndex: number;
  event: GameEvent;
  description: string;
  prompt?: string;
  round: { wind: string; kyoku: number; honba: number; riichiSticks: number };
  dealerSeat: number;
  players: [ViewerPlayer, ViewerPlayer, ViewerPlayer, ViewerPlayer];
  wallRemaining: number;
  scores: [number, number, number, number];
}

function emptyPlayer(): ViewerPlayer {
  return { hand: [], discards: [], melds: [], riichi: false };
}

function removeOneTile(hand: Tile[], tile: Tile): Tile[] {
  const idx = hand.indexOf(tile);
  if (idx >= 0) {
    const copy = [...hand];
    copy.splice(idx, 1);
    return copy;
  }
  const kind = tileKind(tile);
  const kindIdx = hand.findIndex(h => tileKind(h) === kind);
  if (kindIdx >= 0) {
    const copy = [...hand];
    copy.splice(kindIdx, 1);
    return copy;
  }
  return [...hand];
}

function removeTilesFromHand(hand: Tile[], toRemove: Tile[]): Tile[] {
  let h = [...hand];
  for (const t of toRemove) h = removeOneTile(h, t);
  return h;
}

// From meld tiles, remove one instance of the called tile, return what remains (caller's hand tiles)
function callerHandTiles(meldTiles: Tile[], calledTile: Tile): Tile[] {
  const copy = [...meldTiles];
  const idx = copy.indexOf(calledTile);
  if (idx >= 0) {
    copy.splice(idx, 1);
  } else {
    const kind = tileKind(calledTile);
    const kindIdx = copy.findIndex(t => tileKind(t) === kind);
    if (kindIdx >= 0) copy.splice(kindIdx, 1);
  }
  return copy;
}

const WIND_JP = ['東', '南', '西', '北'] as const;
function seatLabel(s: number): string {
  return `seat${s}(${WIND_JP[s] ?? s}家)`;
}

function describeEvent(ev: GameEvent): string {
  switch (ev.kind) {
    case 'init':
      return `局開始: ${ev.round.wind === 'E' ? '東' : '南'}${ev.round.kyoku}局 ${ev.round.honba}本場`;
    case 'dice':
      return `サイコロ: ${ev.dice[0]}+${ev.dice[1]}=${ev.dice[0] + ev.dice[1]}`;
    case 'deal':
      return '配牌';
    case 'draw':
      return `${seatLabel(ev.seat)} ツモ ${ev.tile}`;
    case 'rinshan':
      return `${seatLabel(ev.seat)} 嶺上ツモ ${ev.tile}`;
    case 'riichi':
      return `${seatLabel(ev.seat)} リーチ宣言 (${ev.tile}切り)`;
    case 'action': {
      const a = ev.action;
      switch (a.kind) {
        case 'discard': return `${seatLabel(ev.seat)} 打牌 ${a.tile}${a.tsumogiri ? ' (ツモ切り)' : ''}`;
        case 'tsumo': return `${seatLabel(ev.seat)} ツモ和了!`;
        case 'ron': return `${seatLabel(ev.seat)} ロン和了!`;
        case 'kyushu_kyuhai': return `${seatLabel(ev.seat)} 九種九牌`;
        default: return `${seatLabel(ev.seat)} ${a.kind}`;
      }
    }
    case 'meld': {
      const kindNames = { pon: 'ポン', chi: 'チー', daiminkan: '大明槓', ankan: '暗槓', kakan: '加槓' } as const;
      return `${seatLabel(ev.seat)} ${kindNames[ev.meldKind]}: [${ev.tiles.join(' ')}]`;
    }
    case 'agari': {
      const from = ev.from === 'tsumo' ? 'ツモ' : `ロン(seat${ev.from})`;
      const ym = ev.yakuman ? ` 役満×${ev.yakuman}` : '';
      return `和了: seat${ev.winner} ${from} ${ev.han}翻${ev.fu}符 ${ev.score}点${ym}`;
    }
    case 'ryukyoku': {
      const tp = ev.tenpaiSeats ? ` テンパイ:[${ev.tenpaiSeats.join(',')}]` : '';
      return `流局: ${ev.reason}${tp}`;
    }
    case 'violation':
      return `違反: seat${ev.seat} ${ev.attempted.kind} → ${ev.replacement.kind}`;
    case 'think':
      return `💭 seat${ev.seat} 思考: ${ev.reasoning}`;
    default:
      return `[${(ev as { kind: string }).kind}]`;
  }
}

export function buildSnapshots(
  events: GameEvent[],
  startScores: [number, number, number, number] = [25000, 25000, 25000, 25000],
): ViewerSnapshot[] {
  const snapshots: ViewerSnapshot[] = [];

  let round = { wind: 'E', kyoku: 1, honba: 0, riichiSticks: 0 };
  let dealerSeat = 0;
  let players: [ViewerPlayer, ViewerPlayer, ViewerPlayer, ViewerPlayer] = [
    emptyPlayer(), emptyPlayer(), emptyPlayer(), emptyPlayer(),
  ];
  let wallRemaining = 136;
  let lastDiscardTile: Tile | null = null;
  let lastDiscardSeat: number | null = null;
  const pendingRiichi = new Set<number>();
  const scores: [number, number, number, number] = [...startScores] as [number, number, number, number];

  for (let i = 0; i < events.length; i++) {
    const ev = events[i]!;

    switch (ev.kind) {
      case 'init':
        round = { wind: ev.round.wind, kyoku: ev.round.kyoku, honba: ev.round.honba, riichiSticks: ev.round.riichiSticks };
        dealerSeat = ev.dealerSeat;
        wallRemaining = 136;
        break;

      case 'deal':
        players = [
          { hand: [...ev.hands[0]], discards: [], melds: [], riichi: false },
          { hand: [...ev.hands[1]], discards: [], melds: [], riichi: false },
          { hand: [...ev.hands[2]], discards: [], melds: [], riichi: false },
          { hand: [...ev.hands[3]], discards: [], melds: [], riichi: false },
        ];
        // 136 - 52 dealt - 14 dead wall = 70
        wallRemaining = 70;
        break;

      case 'draw': {
        const p = players[ev.seat]!;
        players[ev.seat] = { ...p, hand: [...p.hand, ev.tile] };
        wallRemaining--;
        break;
      }

      case 'rinshan': {
        const p = players[ev.seat]!;
        players[ev.seat] = { ...p, hand: [...p.hand, ev.tile] };
        break;
      }

      case 'riichi':
        players[ev.seat] = { ...players[ev.seat]!, riichi: true };
        round = { ...round, riichiSticks: round.riichiSticks + 1 };
        pendingRiichi.add(ev.seat);
        break;

      case 'action': {
        const a = ev.action;
        if (a.kind === 'discard') {
          const p = players[ev.seat]!;
          const isRiichiDecl = pendingRiichi.has(ev.seat);
          if (isRiichiDecl) pendingRiichi.delete(ev.seat);
          const newHand = removeOneTile(p.hand, a.tile);
          const newDiscards: ViewerDiscard[] = [
            ...p.discards,
            { tile: a.tile, isRiichiDecl, calledBy: null },
          ];
          players[ev.seat] = { ...p, hand: newHand, discards: newDiscards };
          lastDiscardTile = a.tile;
          lastDiscardSeat = ev.seat;
        }
        break;
      }

      case 'meld': {
        const p = players[ev.seat]!;

        if (ev.meldKind === 'ankan') {
          const meld: ViewerMeld = { kind: 'ankan', tiles: [...ev.tiles], calledTile: null, from: null };
          const newHand = removeTilesFromHand(p.hand, ev.tiles);
          players[ev.seat] = { ...p, hand: newHand, melds: [...p.melds, meld] };
        } else if (ev.meldKind === 'kakan') {
          // Remove 1 tile from hand, replace existing pon meld（元ポンの横向き情報を引き継ぐ）
          const addedTile = ev.tiles[ev.tiles.length - 1]!;
          const newHand = removeOneTile(p.hand, addedTile);
          const pon = p.melds.find(
            m => m.kind === 'pon' && tileKind(m.tiles[0]!) === tileKind(ev.tiles[0]!)
          );
          const meld: ViewerMeld = {
            kind: 'kakan',
            tiles: [...ev.tiles],
            calledTile: pon?.calledTile ?? null,
            from: pon?.from ?? null,
            addedTile,
          };
          const newMelds = p.melds.map(m => (m === pon ? meld : m));
          if (!newMelds.some(m => m === meld)) newMelds.push(meld);
          players[ev.seat] = { ...p, hand: newHand, melds: newMelds };
        } else {
          // pon / chi / daiminkan
          const calledTile = lastDiscardTile!;
          const from = lastDiscardSeat !== null ? (lastDiscardSeat - ev.seat + 4) % 4 : null;
          const meld: ViewerMeld = { kind: ev.meldKind, tiles: [...ev.tiles], calledTile, from };
          const fromHand = callerHandTiles(ev.tiles, calledTile);
          const newHand = removeTilesFromHand(p.hand, fromHand);
          players[ev.seat] = { ...p, hand: newHand, melds: [...p.melds, meld] };
          // mark called discard
          if (lastDiscardSeat !== null) {
            const dp = players[lastDiscardSeat]!;
            const dIdx = dp.discards.length - 1;
            if (dIdx >= 0) {
              const newDiscards = [...dp.discards];
              newDiscards[dIdx] = { ...newDiscards[dIdx]!, calledBy: ev.seat };
              players[lastDiscardSeat] = { ...dp, discards: newDiscards };
            }
          }
        }
        break;
      }

      case 'agari': {
        const { winner, from, score } = ev;
        const sticks = round.riichiSticks;
        if (from === 'tsumo') {
          const others = ([0, 1, 2, 3] as Seat[]).filter(s => s !== winner);
          const isWinnerDealer = winner === dealerSeat;
          if (isWinnerDealer) {
            const pay = Math.ceil(score / 3 / 100) * 100;
            others.forEach(s => { scores[s] -= pay; });
            scores[winner] += pay * 3 + sticks * 1000;
          } else {
            let total = 0;
            others.forEach(s => {
              const pay = s === (dealerSeat as Seat)
                ? Math.ceil(score / 2 / 100) * 100
                : Math.ceil(score / 4 / 100) * 100;
              scores[s] -= pay;
              total += pay;
            });
            scores[winner] += total + sticks * 1000;
          }
        } else {
          const payment = score + round.honba * 300;
          scores[from] -= payment;
          scores[winner] += payment + sticks * 1000;
        }
        round = { ...round, riichiSticks: 0 };
        break;
      }

      case 'ryukyoku': {
        const tenpai = ev.tenpaiSeats ?? [];
        if (tenpai.length > 0 && tenpai.length < 4) {
          const noten = ([0, 1, 2, 3] as Seat[]).filter(s => !tenpai.includes(s));
          const payPerNoten = 3000 / noten.length;
          const gainPerTenpai = 3000 / tenpai.length;
          noten.forEach(s => { scores[s] -= payPerNoten; });
          tenpai.forEach(s => { scores[s] += gainPerTenpai; });
        }
        break;
      }
    }

    snapshots.push({
      eventIndex: i,
      event: ev,
      description: describeEvent(ev),
      prompt: ev.kind === 'think' ? ev.prompt : undefined,
      round: { ...round },
      dealerSeat,
      players: players.map(p => ({
        ...p,
        hand: [...p.hand],
        discards: [...p.discards],
        melds: p.melds.map(m => ({ ...m, tiles: [...m.tiles] })),
      })) as [ViewerPlayer, ViewerPlayer, ViewerPlayer, ViewerPlayer],
      wallRemaining,
      scores: [...scores] as [number, number, number, number],
    });
  }

  return snapshots;
}
