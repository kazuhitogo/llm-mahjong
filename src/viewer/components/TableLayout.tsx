import type { CSSProperties, ReactNode } from 'react';
import type { ViewerPlayer } from '../viewer-state.js';
import { SeatArea } from './SeatArea.js';
import { WallStrip } from './WallStrip.js';

interface Props {
  players: [ViewerPlayer, ViewerPlayer, ViewerPlayer, ViewerPlayer];
  seatAt: { bottom: number; right: number; top: number; left: number };
  povSeat: number;
  showAll: boolean;
  remainingDraws: number;
  center: ReactNode;
}

const SIZE = 720;
const R_HAND = 352; // 手牌の下端を卓端付近へ
// 山は各辺 17 牌 ≈ 306px（±153）。中心から 190px に置くと 4 辺が重ならず、
// 中央パネルから離れてプレイヤー側に寄る。
const R_WALL = 190;

export function TableLayout({ players, seatAt, povSeat, showAll, remainingDraws, center }: Props) {
  const containerStyle: CSSProperties = {
    position: 'relative',
    width: SIZE,
    height: SIZE,
    maxWidth: '100%',
    margin: '0 auto',
    background: 'radial-gradient(ellipse at center, #1a3a60 0%, #0a1a30 100%)',
    backgroundImage: [
      'radial-gradient(ellipse at center, #1a3a60 0%, #0a1a30 100%)',
      'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,0.012) 4px, rgba(255,255,255,0.012) 8px)',
    ].join(', '),
    borderRadius: 12,
    boxShadow: '0 4px 20px rgba(0,0,0,0.8)',
    overflow: 'hidden',
  };

  const wallPerSide = Math.min(34, Math.round(remainingDraws / 4));

  // seatAt.bottom = povSeat（自家を手前）。右=下家, 上=対面, 左=上家。
  const seats = [
    { seat: seatAt.bottom, deg: 0 },
    { seat: seatAt.right, deg: -90 },
    { seat: seatAt.top, deg: 180 },
    { seat: seatAt.left, deg: 90 },
  ];

  const seatStyle = (deg: number): CSSProperties => ({
    position: 'absolute',
    left: '50%',
    top: '50%',
    transformOrigin: 'center center',
    transform: `translate(-50%, -50%) rotate(${deg}deg) translateY(calc(${R_HAND}px - 50%))`,
  });

  const wallStyle = (deg: number): CSSProperties => ({
    position: 'absolute',
    left: '50%',
    top: '50%',
    transformOrigin: 'center center',
    transform: `translate(-50%, -50%) rotate(${deg}deg) translateY(${R_WALL}px)`,
  });

  return (
    <div style={containerStyle}>
      {[0, -90, 180, 90].map((deg, i) => (
        <div key={`w${i}`} style={wallStyle(deg)}>
          <WallStrip remaining={wallPerSide} />
        </div>
      ))}
      {seats.map((s, i) => (
        <div key={`s${i}`} style={seatStyle(s.deg)}>
          <SeatArea player={players[s.seat]!} isPov={s.seat === povSeat} showAll={showAll} />
        </div>
      ))}
      {center}
    </div>
  );
}
