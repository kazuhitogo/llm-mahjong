import type { CSSProperties } from 'react';

interface Props { small?: boolean; }

export function TileBack({ small }: Props) {
  const style: CSSProperties = {
    display: 'inline-block',
    width: small ? 14 : 20,
    height: small ? 18 : 26,
    background: '#2c5282',
    border: '1px solid #4a7fa5',
    borderRadius: 2,
    margin: 1,
    verticalAlign: 'middle',
  };
  return <span style={style} />;
}
