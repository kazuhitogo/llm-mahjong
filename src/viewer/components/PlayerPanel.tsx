import type { CSSProperties } from 'react';
import type { ViewerPlayer } from '../viewer-state.js';
import { TileDisplay } from './TileDisplay.js';

interface Props {
  player: ViewerPlayer;
  seat: number;
  dealerSeat: number;
  isDealer: boolean;
}

const WINDS = ['東', '南', '西', '北'] as const;
const MELD_LABELS = { pon: 'ポン', chi: 'チー', daiminkan: '大明槓', ankan: '暗槓', kakan: '加槓' } as const;

export function PlayerPanel({ player, seat, dealerSeat, isDealer }: Props) {
  const seatWind = WINDS[(seat - dealerSeat + 4) % 4] ?? '?';

  const panelStyle: CSSProperties = {
    border: `2px solid ${isDealer ? '#e8a000' : '#ccc'}`,
    borderRadius: 6,
    padding: '8px 10px',
    background: '#fff',
    minHeight: 120,
  };

  const headerStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
    borderBottom: '1px solid #eee',
    paddingBottom: 4,
  };

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <strong>seat{seat}</strong>
        <span style={{ color: '#555' }}>({seatWind}家{isDealer ? ' 親' : ''})</span>
        {player.riichi && (
          <span style={{ color: '#cc0000', fontWeight: 'bold', fontSize: 12, border: '1px solid #cc0000', padding: '0 4px', borderRadius: 3 }}>
            リーチ
          </span>
        )}
      </div>

      <div style={{ marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: '#888', marginRight: 4 }}>手牌</span>
        {player.hand.length === 0
          ? <span style={{ color: '#aaa', fontSize: 12 }}>なし</span>
          : player.hand.map((t, i) => <TileDisplay key={i} tile={t} />)
        }
      </div>

      {player.melds.length > 0 && (
        <div style={{ marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: '#888', marginRight: 4 }}>副露</span>
          {player.melds.map((m, mi) => (
            <span key={mi} style={{ marginRight: 6, display: 'inline-block', border: '1px solid #ddd', borderRadius: 3, padding: '1px 4px', background: '#f9f9f9' }}>
              <span style={{ fontSize: 10, color: '#666', marginRight: 2 }}>{MELD_LABELS[m.kind]}</span>
              {m.tiles.map((t, ti) => <TileDisplay key={ti} tile={t} small />)}
            </span>
          ))}
        </div>
      )}

      <div>
        <span style={{ fontSize: 11, color: '#888', marginRight: 4 }}>河</span>
        {player.discards.length === 0
          ? <span style={{ color: '#aaa', fontSize: 12 }}>なし</span>
          : player.discards.map((d, i) => (
            <TileDisplay key={i} tile={d.tile} highlight={d.isRiichiDecl} dim={d.calledBy !== null} small />
          ))
        }
      </div>
    </div>
  );
}
