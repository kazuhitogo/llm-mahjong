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
  const diceText = event.kind === 'dice' ? `${event.dice[0]}+${event.dice[1]}` : null;

  // 各プレイヤーから読みやすい向きに点数を回転
  const rot: Record<number, number> = {
    [seatAt.bottom]: 0,
    [seatAt.right]: -90,
    [seatAt.top]: 180,
    [seatAt.left]: 90,
  };

  const containerStyle: CSSProperties = {
    position: 'absolute',
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    width: 174,
    height: 174,
    background: 'rgba(10, 10, 20, 0.85)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 10,
    boxShadow: '0 2px 12px rgba(0,0,0,0.6)',
    color: '#eee',
    zIndex: 10,
    pointerEvents: 'none',
    display: 'grid',
    gridTemplateColumns: '1fr 1.3fr 1fr',
    gridTemplateRows: '1fr 1.4fr 1fr',
    alignItems: 'center',
    justifyItems: 'center',
    padding: 4,
    boxSizing: 'border-box',
  };

  const scoreCell = (seat: number): CSSProperties => ({
    transform: `rotate(${rot[seat]}deg)`,
    fontSize: 11,
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: 1.2,
    color: snap.scores[seat]! >= 0 ? '#7ef' : '#f88',
    whiteSpace: 'nowrap',
  });

  const windOf = (seat: number) =>
    `${WIND_JP[(seat - dealerSeat + 4) % 4]}${seat === dealerSeat ? '●' : ''}`;

  const scoreBlock = (seat: number) => (
    <div style={scoreCell(seat)}>
      {windOf(seat)}<br />{snap.scores[seat]}
    </div>
  );

  return (
    <div style={containerStyle}>
      <div />
      {scoreBlock(seatAt.top)}
      <div />

      {scoreBlock(seatAt.left)}
      <div style={{ textAlign: 'center', fontSize: 11, lineHeight: 1.4 }}>
        <div style={{ fontWeight: 'bold', fontSize: 13 }}>{windLabel}{round.kyoku}局</div>
        <div style={{ color: '#ccc' }}>{round.honba}本場</div>
        <div style={{ color: '#9ab' }}>供託 {round.riichiSticks}</div>
        {isDice && diceText
          ? <div style={{ color: '#fc6' }}>🎲 {diceText}</div>
          : <div style={{ color: '#9ab' }}>残 {wallRemaining}</div>}
      </div>
      {scoreBlock(seatAt.right)}

      <div />
      {scoreBlock(seatAt.bottom)}
      <div />
    </div>
  );
}
