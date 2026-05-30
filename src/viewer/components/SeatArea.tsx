import type { CSSProperties } from 'react';
import type { ViewerPlayer, ViewerDiscard } from '../viewer-state.js';
import { FrontTile, BackTile, TILE_W, TILE_L } from './Tile.js';

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function SideTile({ tile }: { tile: string }) {
  const wrap: CSSProperties = { width: TILE_L, height: TILE_W, position: 'relative', flexShrink: 0 };
  const inner: CSSProperties = {
    position: 'absolute', top: '50%', left: '50%',
    transform: 'translate(-50%, -50%) rotate(90deg)',
  };
  return <div style={wrap}><div style={inner}><FrontTile tile={tile} /></div></div>;
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
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
      <div style={{ display: 'flex', gap: 1 }}>
        {player.hand.map((t, i) =>
          showFace ? <FrontTile key={i} tile={t} /> : <BackTile key={i} />
        )}
      </div>
      {player.melds.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 3 }}>
          {player.melds.map((m, mi) => (
            <div key={mi} style={{ display: 'flex', gap: 0 }}>
              {m.tiles.map((t, ti) => <SideTile key={ti} tile={t} />)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
