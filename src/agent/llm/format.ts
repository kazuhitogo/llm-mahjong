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

function meldStr(m: Meld, dealerSeat: number): string {
  const k = m.kind === 'pon' ? 'ポン' : m.kind === 'chi' ? 'チー' : m.kind === 'daiminkan' ? '大明槓' : m.kind === 'ankan' ? '暗槓' : '加槓';
  const from = m.kind !== 'ankan' && m.calledTile
    ? `(${SEAT_WIND[(m.from - dealerSeat + 4) % 4]}家から)`
    : '';
  return `[${k}${from}:${handStr(m.tiles)}]`;
}

function actionLabel(a: Action, idx: number): string {
  const i = idx + 1;
  switch (a.kind) {
    case 'tsumo': return `${i}. ツモ和了`;
    case 'ron': return `${i}. ロン和了`;
    case 'riichi': return `${i}. リーチ宣言 (${tileStr(a.tile)}を切る)`;
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

function discardHistoryStr(
  discards: Observation['players'][number]['discards'],
): string {
  if (discards.length === 0) return 'なし';
  return discards.map(d => {
    let s = `${d.junme}巡:${tileStr(d.tile)}`;
    if (d.isRiichiDeclaration) s += '[リ]';
    if (d.tsumogiri) s += '(ツ)';
    if (d.calledBy !== null) s += '★';
    return s;
  }).join(' ');
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
    lines.push(`  副露: ${obs.myMelds.map(m => meldStr(m, obs.dealerSeat)).join(' ')}`);
  }
  if (obs.myRiichi) {
    lines.push(`  リーチ中`);
  }
  if (obs.myFuriten) {
    lines.push(`  フリテン`);
  }

  // 自分の捨て牌履歴
  const myPlayer = obs.players.find(p => p.seat === obs.seat);
  if (myPlayer && myPlayer.discards.length > 0) {
    lines.push(`  自捨て: ${discardHistoryStr(myPlayer.discards)}`);
  }

  lines.push('');
  lines.push('【他家の捨て牌・副露履歴】');
  lines.push('  記号: [リ]=リーチ宣言牌 (ツ)=ツモ切り ★=鳴かれた牌');

  for (const p of obs.players) {
    if (p.seat === obs.seat) continue;
    const w = SEAT_WIND[(p.seat - obs.dealerSeat + 4) % 4]!;
    const riichiMark = p.riichi ? ' [リーチ中]' : '';
    lines.push(`  ${w}家(seat ${p.seat}) 点数:${p.score}${riichiMark}`);
    if (p.melds.length > 0) {
      lines.push(`    副露: ${p.melds.map(m => meldStr(m, obs.dealerSeat)).join(' ')}`);
    }
    lines.push(`    捨て牌: ${discardHistoryStr(p.discards)}`);
  }

  lines.push('');
  lines.push('【合法手】');
  for (let i = 0; i < actions.length; i++) {
    lines.push(`  ${actionLabel(actions[i]!, i)}`);
  }

  lines.push('');
  lines.push('以下の形式で回答してください:');
  lines.push('REASON: <選んだ行動とその理由（例: 「9万を切ります。孤立牌で手に不要なため。」）>');
  lines.push('ACTION: <番号>');

  return lines.join('\n');
}
