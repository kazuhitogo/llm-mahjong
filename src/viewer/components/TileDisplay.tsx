import type { CSSProperties } from 'react';

interface Props {
  tile: string;
  highlight?: boolean;
  dim?: boolean;
  small?: boolean;
}

const HONORS = ['東', '南', '西', '北', '白', '發', '中'];

function tileText(tile: string): string {
  if (tile.endsWith('z')) {
    const n = parseInt(tile);
    return HONORS[n - 1] ?? tile;
  }
  if (tile[0] === '0') return `赤5${tile[1]}`;
  return tile;
}

function tileColor(tile: string): string {
  if (tile.endsWith('z')) return '#333';
  if (tile[0] === '0') return '#e65c00';
  if (tile.endsWith('m')) return '#cc0000';
  if (tile.endsWith('p')) return '#0055cc';
  if (tile.endsWith('s')) return '#006600';
  return '#333';
}

export function TileDisplay({ tile, highlight, dim, small }: Props) {
  const color = tileColor(tile);
  const style: CSSProperties = {
    display: 'inline-block',
    padding: small ? '1px 3px' : '2px 5px',
    margin: '1px',
    background: highlight ? '#ffee44' : '#fff',
    border: `1px solid ${color}`,
    borderRadius: 3,
    color,
    fontFamily: 'monospace',
    fontSize: small ? 10 : 13,
    fontWeight: highlight ? 'bold' : 'normal',
    opacity: dim ? 0.35 : 1,
    userSelect: 'none',
  };

  return <span style={style}>{tileText(tile)}</span>;
}
