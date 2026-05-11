import type { CSSProperties } from 'react';
import type { ViewerSnapshot } from '../viewer-state.js';

interface Props {
  snap: ViewerSnapshot;
  seatAt: { bottom: number; right: number; top: number; left: number };
}

const WIND_JP = ['東', '南', '西', '北'] as const;

export function CenterInfo({ snap, seatAt }: Props) {
  const { round, dealerSeat, wallRemaining, event } = snap;
  const windLabel = round.wind === 'E' ? '東' : '南';
  const isDice = event.kind === 'dice';

  const containerStyle: CSSProperties = {
    position: 'absolute',
    top: '30%',
    left: '30%',
    right: '30%',
    bottom: '30%',
    background: 'rgba(255,255,255,0.92)',
    borderRadius: '50%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    color: '#222',
    textAlign: 'center',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    zIndex: 10,
    pointerEvents: 'none',
  };

  const scoreStyle = (seat: number): CSSProperties => ({
    fontSize: 10,
    fontWeight: 'bold',
    color: snap.scores[seat]! >= 0 ? '#1a4a2e' : '#cc0000',
    whiteSpace: 'nowrap',
  });

  return (
    <div style={containerStyle}>
      <div style={{ fontWeight: 'bold', fontSize: 12 }}>
        {windLabel}{round.kyoku}局 {round.honba}本場
      </div>
      {isDice && event.kind === 'dice' ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '3px 0', gap: 2 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {event.dice.map((d, i) => (
              <span key={i} style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 22, height: 22, border: '2px solid #333', borderRadius: 4,
                fontWeight: 'bold', fontSize: 14, background: '#fff',
              }}>{d}</span>
            ))}
          </div>
          <div style={{ fontSize: 10, color: '#666' }}>{event.dice[0]}+{event.dice[1]}={event.dice[0]+event.dice[1]}</div>
        </div>
      ) : (
        <>
          <div style={{ color: '#555', marginTop: 1 }}>
            供託 {round.riichiSticks}本
          </div>
          <div style={{ color: '#555' }}>
            残り {wallRemaining}枚
          </div>
        </>
      )}
      <div style={{ marginTop: 4, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gridTemplateRows: '1fr 1fr 1fr', gap: 1, width: '100%', padding: '0 4px' }}>
        <div />
        <div style={scoreStyle(seatAt.top)}>
          {WIND_JP[(seatAt.top - dealerSeat + 4) % 4]}{seatAt.top === dealerSeat ? '●' : ''}<br />
          {snap.scores[seatAt.top]}
        </div>
        <div />
        <div style={scoreStyle(seatAt.left)}>
          {WIND_JP[(seatAt.left - dealerSeat + 4) % 4]}{seatAt.left === dealerSeat ? '●' : ''}<br />
          {snap.scores[seatAt.left]}
        </div>
        <div />
        <div style={scoreStyle(seatAt.right)}>
          {WIND_JP[(seatAt.right - dealerSeat + 4) % 4]}{seatAt.right === dealerSeat ? '●' : ''}<br />
          {snap.scores[seatAt.right]}
        </div>
        <div />
        <div style={scoreStyle(seatAt.bottom)}>
          {WIND_JP[(seatAt.bottom - dealerSeat + 4) % 4]}{seatAt.bottom === dealerSeat ? '●' : ''}<br />
          {snap.scores[seatAt.bottom]}
        </div>
        <div />
      </div>
    </div>
  );
}
