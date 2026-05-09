import type { Tile } from '../types/tile.js';
import type { DiscardEntry, PlayerState } from '../types/state.js';
import type { Observation } from '../engine/engine.js';

const SEAT_NAMES = ['東', '南', '西', '北'] as const;

/** 牌を見やすい和文字に変換（デバッグ用、オプション） */
export function tileFancy(t: Tile): string {
  const n = t[0]!;
  const s = t[1]!;
  const sChar = s === 'm' ? '萬' : s === 'p' ? '筒' : s === 's' ? '索' : '';
  if (s === 'z') {
    const honors = ['', '東', '南', '西', '北', '白', '發', '中'];
    return honors[Number(n)]!;
  }
  // 赤ドラは [赤5萬] のように表現
  if (n === '0') return `\x1b[31m赤5${sChar}\x1b[0m`;
  return `${n}${sChar}`;
}

/** 牌列を空白区切り（赤は赤色） */
export function fmtHand(hand: readonly Tile[]): string {
  return hand.map(tileFancy).join(' ');
}

/** 河（捨て牌列）を 6 列折り返しで表示 */
export function fmtDiscards(discards: readonly DiscardEntry[]): string {
  if (discards.length === 0) return '(empty)';
  const cells = discards.map((d) => {
    const base = tileFancy(d.tile);
    const suffix = d.calledBy != null ? '*' : d.tsumogiri ? ' ' : ' ';
    return base + suffix;
  });
  const lines: string[] = [];
  for (let i = 0; i < cells.length; i += 6) {
    lines.push(cells.slice(i, i + 6).join(' '));
  }
  return lines.join('\n');
}

const DICE_GLYPH = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'] as const;

/** 観測情報全体を 1 画面に整形 */
export function fmtObservation(obs: Observation): string {
  const out: string[] = [];
  const round = `${obs.round.wind === 'E' ? '東' : '南'}${obs.round.kyoku}局 ${obs.round.honba}本場`;
  const dice = `${DICE_GLYPH[obs.dice[0]]}${DICE_GLYPH[obs.dice[1]]} (${obs.dice[0]}+${obs.dice[1]}=${obs.dice[0] + obs.dice[1]})`;
  const dora = obs.doraIndicators.length > 0
    ? obs.doraIndicators.map(tileFancy).join(' ')
    : '(none)';
  out.push(`========== ${round}  巡目=${obs.junme}  山残=${obs.remainingDraws}  供託=${obs.round.riichiSticks} ==========`);
  out.push(`サイコロ: ${dice}    ドラ表示: ${dora}`);
  out.push('');

  for (const seat of [0, 1, 2, 3] as const) {
    const p = obs.players[seat]!;
    const isMe = seat === obs.seat;
    const isDealer = seat === obs.dealerSeat;
    const isCurrent = seat === obs.currentTurn;
    const marker =
      (isCurrent ? '▶ ' : '  ') +
      (isDealer ? '[親] ' : '     ') +
      `${SEAT_NAMES[seat]}家(${seat})${isMe ? ' (自分)' : ''}  点数=${p.score}`;
    out.push(marker);
    if (isMe) {
      out.push(`  手牌: ${fmtHand(obs.myHand)}`);
    }
    if (p.melds.length > 0) {
      out.push(`  副露: ${p.melds.map((m) => `[${m.kind}] ${fmtHand(m.tiles)}`).join(', ')}`);
    }
    out.push(`  河:`);
    const disc = fmtDiscards(p.discards);
    for (const line of disc.split('\n')) out.push(`    ${line}`);
    out.push('');
  }

  return out.join('\n');
}

/** プレイヤー状態を直接整形（観測ではなく内部状態用） */
export function fmtPlayerHand(p: PlayerState, hidden: boolean): string {
  if (hidden) return `(${p.hand.length} 枚)`;
  return fmtHand(p.hand);
}
