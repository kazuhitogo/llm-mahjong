import type { CSSProperties, ReactNode } from 'react';
import type { ViewerPlayer, ViewerWall } from '../viewer-state.js';
import { wallStacksForSeat } from '../viewer-state.js';
import { DiscardPart, HandPart } from './SeatArea.js';
import { WallStrip } from './WallStrip.js';

interface Props {
  players: [ViewerPlayer, ViewerPlayer, ViewerPlayer, ViewerPlayer];
  seatAt: { bottom: number; right: number; top: number; left: number };
  povSeat: number;
  showAll: boolean;
  wall: ViewerWall;
  center: ReactNode;
}

const SIZE = 720;

// 中心からの距離（各要素のTOPエッジをここに固定）。
// 中心 → 河 → 山 → 手牌 の順でプレイヤー側へ伸びる。padding を挟んで重ならせない。
// 河は 3〜4 行（最大 ≈99px）、山は 2 行（≈49px）。
const R_DISCARD = 90;  // 河の先頭（中央パネル直外）
const R_WALL    = 198; // 山の先頭（河4行+padding）
const R_HAND    = 280; // 手牌の先頭（山2行+padding）

export function TableLayout({ players, seatAt, povSeat, showAll, wall, center }: Props) {
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

  // SIZE×SIZE の回転ラッパー。中心で回転し、子を position:absolute で配置する。
  // 子に top: SIZE/2 + R を指定すると、R が「中心からの距離（その方向）」になる。
  const wrapStyle = (deg: number): CSSProperties => ({
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: SIZE,
    height: SIZE,
    transform: `translate(-50%, -50%) rotate(${deg}deg)`,
    pointerEvents: 'none',
  });

  // R を top: に変換し、水平方向は常に中央揃え。
  const child = (R: number): CSSProperties => ({
    position: 'absolute',
    top: SIZE / 2 + R,
    left: '50%',
    transform: 'translateX(-50%)',
  });

  const seats = [
    { seat: seatAt.bottom, deg: 0 },
    { seat: seatAt.right,  deg: -90 },
    { seat: seatAt.top,    deg: 180 },
    { seat: seatAt.left,   deg: 90 },
  ];

  return (
    <div style={containerStyle}>
      {center}
      {seats.map((s, i) => (
        <div key={i} style={wrapStyle(s.deg)}>
          <div style={child(R_DISCARD)}>
            <DiscardPart discards={players[s.seat]!.discards} />
          </div>
          <div style={child(R_WALL)}>
            <WallStrip stacks={wallStacksForSeat(wall, s.seat)} />
          </div>
          <div style={child(R_HAND)}>
            <HandPart player={players[s.seat]!} isPov={s.seat === povSeat} showAll={showAll} />
          </div>
        </div>
      ))}
    </div>
  );
}
