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

/** 席を自風名で（親基準の相対風） */
function seatWind(seat: number, dealerSeat: number): string {
  return SEAT_WIND[(seat - dealerSeat + 4) % 4]!;
}

/** 席ラベル: 自風家(seatN) */
function seatLabel(seat: number, dealerSeat: number): string {
  return `${seatWind(seat, dealerSeat)}家(seat${seat})`;
}

function meldKindJp(kind: Meld['kind']): string {
  return kind === 'pon' ? 'ポン' : kind === 'chi' ? 'チー'
    : kind === 'daiminkan' ? '大明槓' : kind === 'ankan' ? '暗槓' : '加槓';
}

function meldStr(m: Meld, dealerSeat: number): string {
  const from = m.kind !== 'ankan' && m.calledTile
    ? `(${seatWind(m.from, dealerSeat)}家から)`
    : '';
  return `[${meldKindJp(m.kind)}${from}:${handStr(m.tiles)}]`;
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

/** 順位表（点数降順）。同点は席順で安定 */
function standings(obs: Observation): Array<{ seat: number; score: number; rank: number }> {
  const sorted = obs.players
    .map(p => ({ seat: p.seat, score: p.score }))
    .sort((a, b) => b.score - a.score || a.seat - b.seat);
  return sorted.map((p, i) => ({ ...p, rank: i + 1 }));
}

/** 全員の打牌を時系列（巡目→打牌順）に並べた進行ログ */
function timelineStr(obs: Observation): string[] {
  type Flat = {
    seat: number;
    junme: number;
    tile: Tile;
    tsumogiri: boolean;
    riichi: boolean;
    calledBy: number | null;
  };
  const flat: Flat[] = [];
  for (const p of obs.players) {
    for (const d of p.discards) {
      flat.push({
        seat: p.seat,
        junme: d.junme,
        tile: d.tile,
        tsumogiri: d.tsumogiri,
        riichi: d.isRiichiDeclaration,
        calledBy: d.calledBy,
      });
    }
  }
  if (flat.length === 0) return ['  （まだ打牌なし）'];

  // 巡目昇順、同巡内は親起家からの席順
  const rel = (s: number) => (s - obs.dealerSeat + 4) % 4;
  flat.sort((a, b) => a.junme - b.junme || rel(a.seat) - rel(b.seat));

  const callerMeldJp = (callerSeat: number, fromSeat: number, tile: Tile): string => {
    const caller = obs.players.find(p => p.seat === callerSeat);
    const m = caller?.melds.find(mm => mm.from === fromSeat && mm.calledTile === tile);
    return `→${seatWind(callerSeat, obs.dealerSeat)}家${m ? meldKindJp(m.kind) : '鳴き'}`;
  };

  const lines: string[] = [];
  let curJunme = -1;
  let parts: string[] = [];
  const flush = () => {
    if (parts.length > 0) lines.push(`  ${curJunme}巡目: ${parts.join('  ')}`);
  };
  for (const f of flat) {
    if (f.junme !== curJunme) {
      flush();
      curJunme = f.junme;
      parts = [];
    }
    let s = `${seatWind(f.seat, obs.dealerSeat)}家 ${tileStr(f.tile)}`;
    if (f.riichi) s += '[リーチ]';
    if (f.tsumogiri) s += '(ツ)';
    if (f.calledBy !== null) s += callerMeldJp(f.calledBy, f.seat, f.tile);
    parts.push(s);
  }
  flush();
  return lines;
}

export function buildPrompt(obs: Observation, actions: Action[], seatName: string): string {
  const baFu = WIND_JP[obs.round.wind];
  const round = `${baFu}${obs.round.kyoku}局 ${obs.round.honba}本場`;
  const myWind = seatWind(obs.seat, obs.dealerSeat);
  const board = standings(obs);
  const topScore = board[0]!.score;
  const myRank = board.find(b => b.seat === obs.seat)!.rank;
  const myScore = obs.myScore;
  const diffTop = myScore - topScore; // 自分がトップなら 0 以上（2位との差で表示し直す）
  const [d0, d1] = obs.dice;

  const lines: string[] = [];

  // --- ゴール ---
  lines.push(`あなたは4人麻雀（半荘）の対局者「${seatName}」。`);
  lines.push('最終目標は半荘終了時に「順位ウマ込みの最終スコア」で1位になること。');
  lines.push('（順位ウマ 1位+10 / 2位+5 / 3位-5 / 4位-10、持ち点は(点数-30000)/1000 で加算）');
  lines.push('目先の和了点だけでなく、現在の順位・トップとの点差・残り局数を踏まえ、1位を取る期待値が最も高い行動を選べ。');
  lines.push('');

  // --- 場況サマリ ---
  lines.push('【現在の場況】');
  lines.push(`${round} / ${obs.junme}巡目 / 場風:${baFu} / 親:${seatLabel(obs.dealerSeat, obs.dealerSeat)} / あなた:${seatLabel(obs.seat, obs.dealerSeat)}`);
  lines.push(`さいの目: ${d0 + d1} (${d0}+${d1}) / 山残り: ${obs.remainingDraws}枚 / 供託リーチ棒: ${obs.round.riichiSticks}本`);
  lines.push(`ドラ表示牌: ${obs.doraIndicators.map(tileStr).join(' ') || 'なし'}`);
  lines.push('得点と順位:');
  for (const b of board) {
    const who = b.seat === obs.seat ? `あなた(${myWind}家)` : `${seatWind(b.seat, obs.dealerSeat)}家`;
    let note = '';
    if (b.seat === obs.seat) {
      note = myRank === 1
        ? `  ← トップ（2位との差 +${myScore - (board[1]?.score ?? myScore)}）`
        : `  ← トップとの差 ${diffTop}`;
    } else if (b.rank === 1) {
      note = '  ← トップ';
    }
    lines.push(`  ${b.rank}位 ${who}(seat${b.seat}) ${b.score}点${note}`);
  }
  lines.push('');

  // --- 自分の手牌 ---
  lines.push('【あなたの手牌】');
  lines.push(`  ${handStr(obs.myHand)}`);
  const myState: string[] = [];
  myState.push(obs.myMelds.length > 0 ? `副露: ${obs.myMelds.map(m => meldStr(m, obs.dealerSeat)).join(' ')}` : '副露なし');
  myState.push(obs.myRiichi ? 'リーチ中' : '門前');
  if (obs.myFuriten) myState.push('フリテン');
  lines.push(`  ${myState.join(' / ')}`);
  lines.push('');

  // --- 進行（時系列） ---
  lines.push('【進行（時系列・全員の打牌）】');
  lines.push('  記号: [リーチ]=リーチ宣言牌 (ツ)=ツモ切り →○家ポン/チー等=その牌が鳴かれた');
  for (const l of timelineStr(obs)) lines.push(l);
  lines.push('');

  // --- 各家の副露（時系列では位置が曖昧なため静的に明示） ---
  const meldLines: string[] = [];
  for (const p of obs.players) {
    if (p.melds.length === 0) continue;
    const riichiMark = p.riichi ? ' [リーチ中]' : '';
    meldLines.push(`  ${seatWind(p.seat, obs.dealerSeat)}家(seat${p.seat})${riichiMark}: ${p.melds.map(m => meldStr(m, obs.dealerSeat)).join(' ')}`);
  }
  if (meldLines.length > 0) {
    lines.push('【各家の副露】');
    for (const l of meldLines) lines.push(l);
    lines.push('');
  }

  // --- 合法手 ---
  lines.push('【合法手】');
  for (let i = 0; i < actions.length; i++) {
    lines.push(`  ${actionLabel(actions[i]!, i)}`);
  }
  lines.push('');

  // --- 回答形式 ---
  lines.push('【回答手順】');
  lines.push('次の観点を踏まえ、結論より先に思考を書け: 手牌のシャンテン数と狙う手役 / 待ちと有効牌 / 他家のリーチ・副露による危険度 / 順位とトップ差から見た打点と安全のバランス。');
  lines.push('最後に合法手の番号を1つ選ぶ。以下の形式で回答する:');
  lines.push('REASON: <上記の分析と、その行動を選ぶ理由>');
  lines.push('ACTION: <番号>');

  return lines.join('\n');
}
