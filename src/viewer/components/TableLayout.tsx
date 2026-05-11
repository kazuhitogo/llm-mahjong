import type { CSSProperties, ReactNode } from 'react';

interface Props {
  bottom: ReactNode;
  top: ReactNode;
  left: ReactNode;
  right: ReactNode;
  center: ReactNode;
}

const TABLE_BG = '#1a4a2e';

export function TableLayout({ bottom, top, left, right, center }: Props) {
  const containerStyle: CSSProperties = {
    position: 'relative',
    width: '100%',
    maxWidth: 720,
    aspectRatio: '1 / 1',
    margin: '0 auto',
    background: TABLE_BG,
    borderRadius: 12,
    boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
    overflow: 'hidden',
  };

  const sideBase: CSSProperties = {
    position: 'absolute',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const bottomStyle: CSSProperties = {
    ...sideBase,
    bottom: 0,
    left: 0,
    right: 0,
    height: '22%',
  };

  const topStyle: CSSProperties = {
    ...sideBase,
    top: 0,
    left: 0,
    right: 0,
    height: '22%',
    transform: 'rotate(180deg)',
    transformOrigin: 'center center',
  };

  const leftStyle: CSSProperties = {
    ...sideBase,
    left: 0,
    top: '22%',
    bottom: '22%',
    width: '22%',
    transform: 'rotate(90deg)',
    transformOrigin: 'center center',
  };

  const rightStyle: CSSProperties = {
    ...sideBase,
    right: 0,
    top: '22%',
    bottom: '22%',
    width: '22%',
    transform: 'rotate(-90deg)',
    transformOrigin: 'center center',
  };

  const centerStyle: CSSProperties = {
    position: 'absolute',
    top: '22%',
    left: '22%',
    right: '22%',
    bottom: '22%',
  };

  return (
    <div style={containerStyle}>
      <div style={bottomStyle}>{bottom}</div>
      <div style={topStyle}>{top}</div>
      <div style={leftStyle}>{left}</div>
      <div style={rightStyle}>{right}</div>
      <div style={centerStyle}>{center}</div>
    </div>
  );
}
