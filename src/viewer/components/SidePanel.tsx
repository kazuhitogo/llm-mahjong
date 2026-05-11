import type { CSSProperties } from 'react';
import type { ViewerPlayer } from '../viewer-state.js';
import { TileDisplay } from './TileDisplay.js';
import { TileBack } from './TileBack.js';

interface Props {
  player: ViewerPlayer;
  seat: number;
  dealerSeat: number;
  isPov: boolean;
  showAll: boolean;
  score: number;
  modelName?: string;
}

const WINDS = ['東', '南', '西', '北'] as const;
const MELD_LABELS = { pon: 'P', chi: 'C', daiminkan: 'K', ankan: 'AK', kakan: 'KK' } as const;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function SidePanel({ player, seat, dealerSeat, isPov, showAll, score }: Props) {
  const seatWind = WINDS[(seat - dealerSeat + 4) % 4]!;
  const isDealer = seat === dealerSeat;
  const showFace = isPov || showAll;

  // content arranged top→bottom = center→edge
  const panelStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-start',
    padding: '2px 4px',
    boxSizing: 'border-box',
    color: '#fff',
  };

  const discardRows = chunk(player.discards, 6);

  return (
    <div style={panelStyle}>
      {/* Discards: toward center (top of panel) */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
        {discardRows.map((row, ri) => (
          <div key={ri} style={{ display: 'flex', gap: 1 }}>
            {row.map((d, di) => (
              <TileDisplay key={di} tile={d.tile} highlight={d.isRiichiDecl} dim={d.calledBy !== null} small />
            ))}
          </div>
        ))}
      </div>

      {/* Melds */}
      {player.melds.length > 0 && (
        <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center', margin: '1px 0' }}>
          {player.melds.map((m, mi) => (
            <span key={mi} style={{ display: 'inline-flex', alignItems: 'center', gap: 1, background: 'rgba(255,255,255,0.15)', borderRadius: 2, padding: '0 2px' }}>
              <span style={{ fontSize: 8, color: '#ccc' }}>{MELD_LABELS[m.kind]}</span>
              {m.tiles.map((t, ti) => <TileDisplay key={ti} tile={t} small />)}
            </span>
          ))}
        </div>
      )}

      {/* Hand */}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 1, margin: '1px 0' }}>
        {player.hand.length === 0
          ? <span style={{ fontSize: 9, opacity: 0.4 }}>-</span>
          : player.hand.map((t, i) =>
              showFace
                ? <TileDisplay key={i} tile={t} small />
                : <TileBack key={i} small />
            )
        }
      </div>

      {/* Player info: toward edge (bottom of panel) */}
      <div style={{ fontSize: 10, display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'nowrap', marginTop: 'auto' }}>
        <span style={{ fontWeight: 'bold', color: isDealer ? '#e8a000' : '#fff' }}>
          {seatWind}{isDealer ? '●' : ''}
        </span>
        <span style={{ opacity: 0.6 }}>s{seat}</span>
        {player.riichi && (
          <span style={{ color: '#ff6666', fontWeight: 'bold', fontSize: 9, border: '1px solid #ff6666', padding: '0 2px', borderRadius: 2 }}>R</span>
        )}
        <span style={{ color: score >= 0 ? '#aef' : '#f88', fontSize: 10 }}>{score}</span>
      </div>
    </div>
  );
}
