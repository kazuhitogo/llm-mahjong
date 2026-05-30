import type { CSSProperties } from 'react';

// 牌の実寸（全牌で幅を統一。倒し/立てで見える縦横比だけ変える）
export const TILE_W = 18; // 短辺（幅）
export const TILE_L = 24; // 正面・表面の長辺
export const TILE_T = 11; // 伏せて立てた牌の上面（厚みの面）

const SUIT_KANJI: Record<string, string> = { m: '萬', p: '筒', s: '索' };
const SUIT_COLOR: Record<string, string> = { m: '#c81e1e', p: '#1763c8', s: '#138a3a' };
const HONORS = ['東', '南', '西', '北', '白', '發', '中'];
const HONOR_COLOR = ['#222', '#222', '#222', '#222', '#222', '#138a3a', '#c81e1e'];

interface FrontProps {
  tile: string;
  highlight?: boolean;
  dim?: boolean;
}

// 表向きの牌（正面）。自家手牌・河・鳴きで使用。
export function FrontTile({ tile, highlight, dim }: FrontProps) {
  const isAka = tile[0] === '0';
  const isHonor = tile[1] === 'z';

  let main: string;
  let sub: string | null;
  let color: string;
  if (isHonor) {
    const n = Number(tile[0]) - 1;
    main = HONORS[n]!;
    sub = null;
    color = HONOR_COLOR[n]!;
  } else {
    main = isAka ? '5' : tile[0]!;
    sub = SUIT_KANJI[tile[1]!]!;
    color = isAka ? '#e6720a' : SUIT_COLOR[tile[1]!]!;
  }

  const style: CSSProperties = {
    display: 'inline-flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: TILE_W,
    height: TILE_L,
    background: highlight
      ? 'linear-gradient(160deg, #fffbe0 0%, #f5e88a 100%)'
      : 'linear-gradient(160deg, #fffefb 0%, #ece7d6 100%)',
    border: `1px solid ${highlight ? '#cc9900' : isAka ? '#cc0000' : '#cfc8b4'}`,
    boxShadow: '0 1px 0 #fff inset, 1px 1px 1px rgba(0,0,0,0.25)',
    borderRadius: 3,
    opacity: dim ? 0.4 : 1,
    userSelect: 'none',
    lineHeight: 1,
    color,
    fontFamily: '"Hiragino Sans","Yu Gothic",sans-serif',
    boxSizing: 'border-box',
    flexShrink: 0,
  };

  return (
    <span style={style}>
      <span style={{ fontSize: 13, fontWeight: 700 }}>{main}</span>
      {sub && <span style={{ fontSize: 8, fontWeight: 600, marginTop: -1 }}>{sub}</span>}
    </span>
  );
}

// 伏せて立てた牌の上面（薄い面）。他家手牌で使用。
export function BackTile({ spent }: { spent?: boolean } = {}) {
  const style: CSSProperties = {
    width: TILE_W,
    height: TILE_T,
    background: spent
      ? 'rgba(255,255,255,0.04)'
      : 'linear-gradient(180deg, #3f3f59 0%, #22222f 100%)',
    border: `1px solid ${spent ? 'rgba(255,255,255,0.06)' : '#14141d'}`,
    borderTop: spent ? '1px solid rgba(255,255,255,0.06)' : '1px solid #50506a',
    borderRadius: 2,
    boxSizing: 'border-box',
    flexShrink: 0,
  };
  return <div style={style} />;
}

// 寝かせた牌（倒した牌）を上から見た面。山で使用。手牌と同じ面サイズ。
export function FlatTile({ spent }: { spent?: boolean } = {}) {
  const style: CSSProperties = {
    width: TILE_W,
    height: TILE_L,
    background: spent
      ? 'rgba(255,255,255,0.04)'
      : 'linear-gradient(155deg, #45456080 0%, #2a2a3e 45%, #1a1a28 100%)',
    border: `1px solid ${spent ? 'rgba(255,255,255,0.06)' : '#14141d'}`,
    boxShadow: spent ? undefined : 'inset 0 2px 0 rgba(255,255,255,0.07)',
    borderRadius: 3,
    boxSizing: 'border-box',
    flexShrink: 0,
  };
  return <div style={style} />;
}
