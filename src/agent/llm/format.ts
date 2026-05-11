import type { Observation } from '../../engine/engine.js';
import type { Action } from '../../types/action.js';
import type { Tile } from '../../types/tile.js';
import type { Meld } from '../../types/meld.js';

const WIND_JP = { E: '東', S: '南', W: '西', N: '北' } as const;
const SEAT_WIND = ['東', '南', '西', '北'] as const;

function tileStr(t: Tile): string {
  const n = t[0] === '0' ? '赤5' : t[0];
  const s = t[1] === 'm' ? '万' : t[1] === 'p' ? '筒' : t[1] === 's' ? '索' : '';
  if (t[1] === 'z') {
    return ['', '東', '南', '西', '北', '白', '発', '中'][Number(t[0])]!;
  }
  return `${n}${s}`;
}

function handStr(tiles: readonly Tile[]): string {
  return tiles.map(tileStr).join(' ');
}

function meldStr(m: Meld): string {
  const k = m.kind === 'pon' ? 'ポン' : m.kind === 'chi' ? 'チー' : m.kind === 'daiminkan' ? '大明槓' : m.kind === 'ankan' ? '暗槓' : '加槓';
  return `[${k}:${handStr(m.tiles)}]`;
}

function actionLabel(a: Action, idx: number): string {
  const i = idx + 1;
  switch (a.kind) {
    case 'tsumo': return `${i}. ツモ和了`;
    case 'ron': return `${i}. ロン和了`;
    case 'riichi': return `${i}. リーチ (${tileStr(a.tile)}を切る)`;
    case 'discard': return `${i}. 打牌: ${tileStr(a.tile)}${a.tsumogiri ? ' (ツモ切り)' : ''}`;
    case 'pon': return `${i}. ポン`;
    case 'chi': return `${i}. チー [${handStr(a.tiles)}]`;
    case 'daiminkan': return `${i}. 大明槓`;
    case 'ankan': return `${i}. 暗槓 (${tileStr(a.tile)})`;
    case 'kakan': return `${i}. 加槓 (${tileStr(a.tile)})`;
    case 'kyushu_kyuhai': return `${i}. 九種九牌（流局）`;
    case 'pass': return `${i}. パス（見送り）`;
  }
}

export function buildPrompt(obs: Observation, actions: Action[], seatName: string): string {
  const wind = WIND_JP[obs.round.wind];
  const round = `${wind}${obs.round.kyoku}局 ${obs.round.honba}本場`;
  const myWindName = SEAT_WIND[(obs.seat - obs.dealerSeat + 4) % 4]!;

  const lines: string[] = [
    `あなたは麻雀プレイヤー「${seatName}」です。以下の局面で合法手を1つ選んでください。`,
    '',
    `【局情報】${round}  供託: ${obs.round.riichiSticks}本  山残: ${obs.remainingDraws}枚  巡目: ${obs.junme}`,
    `【ドラ表示牌】${obs.doraIndicators.map(tileStr).join(' ') || 'なし'}`,
    '',
    `【自分】${myWindName}家(seat ${obs.seat}) 点数: ${obs.myScore}`,
    `  手牌: ${handStr(obs.myHand)}`,
  ];

  if (obs.myMelds.length > 0) {
    lines.push(`  副露: ${obs.myMelds.map(meldStr).join(' ')}`);
  }
  if (obs.myRiichi) {
    lines.push(`  リーチ中`);
  }
  if (obs.myFuriten) {
    lines.push(`  フリテン`);
  }

  lines.push('');
  lines.push('【他家情報】');

  for (const p of obs.players) {
    if (p.seat === obs.seat) continue;
    const w = SEAT_WIND[(p.seat - obs.dealerSeat + 4) % 4]!;
    const riichiMark = p.riichi ? ' [リーチ]' : '';
    const meldsPart = p.melds.length > 0 ? ` 副露: ${p.melds.map(meldStr).join(' ')}` : '';
    const discPart = p.discards.length > 0
      ? ` 河: ${p.discards.slice(-6).map(d => tileStr(d.tile) + (d.calledBy !== null ? '★' : '')).join(' ')}`
      : '';
    lines.push(`  ${w}家(seat ${p.seat}) 点数: ${p.score}${riichiMark}${meldsPart}${discPart}`);
  }

  lines.push('');
  lines.push('【合法手】');
  for (let i = 0; i < actions.length; i++) {
    lines.push(`  ${actionLabel(actions[i]!, i)}`);
  }

  lines.push('');
  lines.push('THINK: <1-2 sentence reasoning> ACTION: <number>');

  return lines.join('\n');
}
