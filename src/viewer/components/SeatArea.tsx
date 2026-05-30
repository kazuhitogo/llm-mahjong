import type { CSSProperties } from 'react';
import type { ViewerPlayer, ViewerDiscard, ViewerMeld } from '../viewer-state.js';
import { FrontTile, BackTile, FlatTile, TILE_W, TILE_L } from './Tile.js';

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// 横倒しの牌（鳴いて入手した牌）。stack があれば上に重ねる（加槓）。
function SideTile({ tile, stack }: { tile: string; stack?: string }) {
  const wrap: CSSProperties = { width: TILE_L, height: TILE_W, position: 'relative', flexShrink: 0 };
  const inner: CSSProperties = {
    position: 'absolute', top: '50%', left: '50%',
    transform: 'translate(-50%, -50%) rotate(90deg)',
  };
  const one = (t: string) => <div style={wrap}><div style={inner}><FrontTile tile={t} /></div></div>;
  if (!stack) return one(tile);
  // 加槓: 横向き2枚を縦に積む
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {one(stack)}
      {one(tile)}
    </div>
  );
}

interface MeldTile { tile: string; sideways: boolean; faceDown: boolean; stack?: string }

// 鳴き面子を表示順の牌列へ変換。横倒しは入手牌のみ、位置は鳴いた相手で決まる。
function buildMeld(m: ViewerMeld): MeldTile[] {
  if (m.kind === 'ankan') {
    // 暗槓: 両端を伏せ、中2枚を表
    return m.tiles.map((t, i) => ({
      tile: t, sideways: false, faceDown: i === 0 || i === m.tiles.length - 1,
    }));
  }
  const rest = [...m.tiles];
  const idx = m.calledTile ? rest.indexOf(m.calledTile) : -1;
  if (idx >= 0) rest.splice(idx, 1);
  const calledTile = m.calledTile ?? m.tiles[0]!;
  const result: MeldTile[] = rest.map(t => ({ tile: t, sideways: false, faceDown: false }));
  // 横倒し位置: 上家=先頭, 対面=中央, 下家=末尾
  const pos = m.from === 3 ? 0 : m.from === 2 ? 1 : result.length;
  const side: MeldTile = { tile: calledTile, sideways: true, faceDown: false };
  if (m.kind === 'kakan' && m.addedTile) side.stack = m.addedTile;
  result.splice(pos, 0, side);
  return result;
}

function MeldView({ meld }: { meld: ViewerMeld }) {
  const tiles = buildMeld(meld);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 0 }}>
      {tiles.map((mt, i) =>
        mt.sideways ? <SideTile key={i} tile={mt.tile} stack={mt.stack} />
        : mt.faceDown ? <FlatTile key={i} />
        : <FrontTile key={i} tile={mt.tile} />
      )}
    </div>
  );
}

// 河（捨て牌）。3×6 を基本とし、左上から詰める（固定幅・左揃え）。
// 19 牌目以降は 4 行目へ折り返す。
const DISCARD_COLS = 6;
const DISCARD_WIDTH = DISCARD_COLS * TILE_W + (DISCARD_COLS - 1); // 6 列分の固定幅

export function DiscardPart({ discards }: { discards: ViewerDiscard[] }) {
  const rows = chunk(discards, DISCARD_COLS);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, width: DISCARD_WIDTH }}>
      {rows.map((row, ri) => (
        <div key={ri} style={{ display: 'flex', gap: 1 }}>
          {row.map((d, di) => (
            <FrontTile key={di} tile={d.tile} highlight={d.isRiichiDecl} dim={d.calledBy !== null} />
          ))}
        </div>
      ))}
    </div>
  );
}

// 手牌＋鳴き牌。卓の端付近に独立配置する。
export function HandPart({ player, isPov, showAll }: { player: ViewerPlayer; isPov: boolean; showAll: boolean }) {
  const showFace = isPov || showAll;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4 }}>
      <div style={{ display: 'flex', gap: 1 }}>
        {player.hand.map((t, i) =>
          showFace ? <FrontTile key={i} tile={t} /> : <BackTile key={i} />
        )}
      </div>
      {player.melds.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3 }}>
          {player.melds.map((m, mi) => <MeldView key={mi} meld={m} />)}
        </div>
      )}
    </div>
  );
}
