import type { CSSProperties } from 'react';
import type { ViewerPlayer } from '../viewer-state.js';
import { FrontTile, BackTile, TILE_W, TILE_L } from './Tile.js';

interface Props {
  player: ViewerPlayer;
  isPov: boolean;
  showAll: boolean;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// 横向き（倒した）牌 1 枚。鳴き牌で使用。
function SideTile({ tile }: { tile: string }) {
  const wrap: CSSProperties = {
    width: TILE_L,
    height: TILE_W,
    position: 'relative',
    flexShrink: 0,
  };
  const inner: CSSProperties = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%) rotate(90deg)',
  };
  return (
    <div style={wrap}>
      <div style={inner}><FrontTile tile={tile} /></div>
    </div>
  );
}

// 下向き（自家視点）基準でレイアウト。回転は呼び出し側（TableLayout）が行う。
// 上 = 卓中央寄り（河）、下 = 卓の端（手牌）。
export function SeatArea({ player, isPov, showAll }: Props) {
  const showFace = isPov || showAll;
  const discardRows = chunk(player.discards, 6);

  const containerStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
  };

  return (
    <div style={containerStyle}>
      {/* 河（捨て牌）: 中央寄り。6 列、左上から */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minHeight: TILE_L }}>
        {discardRows.map((row, ri) => (
          <div key={ri} style={{ display: 'flex', gap: 1 }}>
            {row.map((d, di) => (
              <FrontTile key={di} tile={d.tile} highlight={d.isRiichiDecl} dim={d.calledBy !== null} />
            ))}
          </div>
        ))}
      </div>

      {/* 手牌（端）＋ 鳴き（右下） */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
        <div style={{ display: 'flex', gap: 1 }}>
          {player.hand.map((t, i) =>
            showFace ? <FrontTile key={i} tile={t} /> : <BackTile key={i} />
          )}
        </div>
        {player.melds.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4 }}>
            {player.melds.map((m, mi) => (
              <div key={mi} style={{ display: 'flex', gap: 0 }}>
                {m.tiles.map((t, ti) => <SideTile key={ti} tile={t} />)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
