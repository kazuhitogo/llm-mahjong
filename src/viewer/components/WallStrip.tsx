import type { CSSProperties } from 'react';
import { FlatTile } from './Tile.js';

interface Props {
  remaining: number; // この辺の残り山牌数（上山+下山, 最大34）
}

// 17×2 段の山。牌は寝かせた面（手牌と同サイズ）。
// 上段=上山（プレイヤーから見て奥=中央寄りの列）、下段=下山。
// 消費済みは薄く残し、段の長さを一定に保つ。
export function WallStrip({ remaining }: Props) {
  const PER_ROW = 17;
  const upper = Array.from({ length: PER_ROW }, (_, i) => i < remaining);
  const lower = Array.from({ length: PER_ROW }, (_, i) => i + PER_ROW < remaining);

  const rowStyle: CSSProperties = { display: 'flex', gap: 1 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <div style={rowStyle}>
        {upper.map((on, i) => <FlatTile key={i} spent={!on} />)}
      </div>
      <div style={rowStyle}>
        {lower.map((on, i) => <FlatTile key={i} spent={!on} />)}
      </div>
    </div>
  );
}
