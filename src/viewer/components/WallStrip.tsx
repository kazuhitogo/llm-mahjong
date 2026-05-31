import type { CSSProperties } from 'react';
import type { WallCell, WallStack } from '../viewer-state.js';
import { FlatTile, FrontTile, TILE_W } from './Tile.js';

interface Props {
  stacks: WallStack[]; // この席の壁（17 スタック）。物理消費位置を反映。
}

function Cell({ cell }: { cell: WallCell }) {
  if (cell.dora) return <FrontTile tile={cell.dora} />;
  return <FlatTile spent={cell.state === 'consumed'} dead={cell.state === 'dead'} />;
}

// 17 スタック×2 段の山。各スタックは upper（奥＝中央寄り）/ lower を縦に積む。
// 消費済みは薄く、王牌は琥珀、ドラ表示牌は表向き。開門位置にギャップを入れる。
export function WallStrip({ stacks }: Props) {
  const rowStyle: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 1 };
  const BREAK_GAP = TILE_W; // 割れ目の隙間（牌1枚ぶん）
  return (
    <div style={rowStyle}>
      {stacks.map((st, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            marginLeft: st.breakBefore ? BREAK_GAP : 0,
          }}
        >
          <Cell cell={st.upper} />
          <Cell cell={st.lower} />
        </div>
      ))}
    </div>
  );
}
