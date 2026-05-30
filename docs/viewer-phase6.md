# Phase 6 — Viewer ビジュアルリニューアル 実装仕様

変更範囲: `src/viewer/` 以下の見た目のみ。ゲームロジック・UI 構造（タブ・送り操作・POV 選択）は変更しない。

---

## 実装順序

1. `TileDisplay.tsx` — Unicode 絵文字 + CSS 3D スタイル
2. `TileBack.tsx` — ダーク 3D スタイル（同サイズに合わせる）
3. `WallTiles.tsx` — 新規作成（壁牌ストリップ）
4. `TableLayout.tsx` — 背景テクスチャ + `remainingDraws` prop + 壁牌配置
5. `App.tsx` — `snap.wallRemaining` を TableLayout に渡す（1行変更）
6. `CenterInfo.tsx` — 白丸 → ダーク角丸パネル
7. `SidePanel.tsx` — isPov 時に手牌を normal サイズで表示

---

## 1. TileDisplay.tsx（全面改修）

### Unicode マッピング関数

```ts
function tileToEmoji(tile: string): string {
  const num = tile[0] === '0' ? 5 : Number(tile[0]);
  const suit = tile[1];
  if (suit === 'm') return String.fromCodePoint(0x1F006 + num); // 🀇=1m..🀏=9m
  if (suit === 'p') return String.fromCodePoint(0x1F018 + num); // 🀙=1p..🀡=9p
  if (suit === 's') return String.fromCodePoint(0x1F00F + num); // 🀐=1s..🀘=9s
  // z: 1z=🀀東, 2z=🀁南, 3z=🀂西, 4z=🀃北, 5z=🀆白, 6z=🀅發, 7z=🀄中
  const Z = [0x1F000, 0x1F001, 0x1F002, 0x1F003, 0x1F006, 0x1F005, 0x1F004];
  return String.fromCodePoint(Z[num - 1]!);
}
```

### Props（変更なし）

```ts
interface Props {
  tile: string;
  highlight?: boolean;  // リーチ宣言牌: 黄色ボーダー
  dim?: boolean;        // 鳴かれた牌: 透明度下げ
  small?: boolean;      // 捨て牌・他家手牌: 小サイズ
}
```

### スタイル

```ts
// サイズ
const W = small ? 22 : 32;
const H = small ? 30 : 44;
const FS = small ? 14 : 22; // emoji font-size

// 色
const isAka = tile[0] === '0';

const style: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: W,
  height: H,
  fontSize: FS,
  background: highlight
    ? 'linear-gradient(145deg, #fffbe0 0%, #f5e88a 100%)'
    : 'linear-gradient(145deg, #faf8f0 0%, #e8e4d0 100%)',
  border: `1px solid ${highlight ? '#cc9900' : isAka ? '#cc0000' : '#bbb'}`,
  boxShadow: '2px 3px 0 #999, 3px 4px 0 #777',
  borderRadius: 4,
  margin: small ? 1 : 2,
  opacity: dim ? 0.4 : 1,
  userSelect: 'none',
  lineHeight: 1,
  fontFamily: '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif',
};

return <span style={style}>{tileToEmoji(tile)}</span>;
```

---

## 2. TileBack.tsx（全面改修）

サイズを TileDisplay に合わせる。

```ts
interface Props { small?: boolean; }

export function TileBack({ small }: Props) {
  const style: CSSProperties = {
    display: 'inline-block',
    width: small ? 22 : 32,
    height: small ? 30 : 44,
    background: 'linear-gradient(145deg, #2a2a3e 0%, #1a1a28 100%)',
    border: '1px solid #3a3a52',
    boxShadow: '2px 3px 0 #000, 3px 4px 0 #000',
    borderRadius: 4,
    margin: small ? 1 : 2,
    verticalAlign: 'middle',
  };
  return <span style={style} />;
}
```

---

## 3. WallTiles.tsx（新規作成）

`src/viewer/components/WallTiles.tsx`

```tsx
import type { CSSProperties } from 'react';

interface Props {
  count: number;
  direction: 'h' | 'v'; // 水平 / 垂直
}

export function WallTiles({ count, direction }: Props) {
  const isH = direction === 'h';
  const containerStyle: CSSProperties = {
    display: 'flex',
    flexDirection: isH ? 'row' : 'column',
    gap: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
  };
  const tileStyle: CSSProperties = {
    width: isH ? 8 : 12,
    height: isH ? 12 : 8,
    background: 'linear-gradient(145deg, #2a2a3e 0%, #1a1a28 100%)',
    border: '1px solid #2a2a3a',
    borderRadius: 1,
    flexShrink: 0,
  };
  return (
    <div style={containerStyle}>
      {Array.from({ length: Math.max(0, count) }).map((_, i) => (
        <div key={i} style={tileStyle} />
      ))}
    </div>
  );
}
```

---

## 4. TableLayout.tsx（改修）

### 変更点

1. `remainingDraws: number` prop を追加
2. `background` をダーク navy テクスチャに変更
3. 4辺の壁牌ストリップを absolute で追加

### Props

```ts
interface Props {
  bottom: ReactNode;
  top: ReactNode;
  left: ReactNode;
  right: ReactNode;
  center: ReactNode;
  remainingDraws: number; // ← 追加
}
```

### 背景スタイル

```ts
const containerStyle: CSSProperties = {
  position: 'relative',
  width: '100%',
  maxWidth: 720,
  aspectRatio: '1 / 1',
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
```

### 壁牌ストリップ配置

```ts
const wallCount = Math.round(remainingDraws / 4);

// bottom wall (top edge of bottom panel area = bottom of center)
const wallBottomStyle: CSSProperties = {
  position: 'absolute', bottom: '22%', left: '22%', right: '22%', height: 14,
};
// top wall
const wallTopStyle: CSSProperties = {
  position: 'absolute', top: '22%', left: '22%', right: '22%', height: 14,
};
// left wall
const wallLeftStyle: CSSProperties = {
  position: 'absolute', left: '22%', top: '26%', bottom: '26%', width: 14,
};
// right wall
const wallRightStyle: CSSProperties = {
  position: 'absolute', right: '22%', top: '26%', bottom: '26%', width: 14,
};
```

JSX（`center` div の後に追加）:
```tsx
<div style={wallBottomStyle}><WallTiles count={wallCount} direction="h" /></div>
<div style={wallTopStyle}><WallTiles count={wallCount} direction="h" /></div>
<div style={wallLeftStyle}><WallTiles count={wallCount} direction="v" /></div>
<div style={wallRightStyle}><WallTiles count={wallCount} direction="v" /></div>
```

---

## 5. App.tsx（1行変更）

`TableLayout` に `remainingDraws={snap.wallRemaining}` を追加するだけ。

```tsx
<TableLayout
  remainingDraws={snap.wallRemaining}  // ← 追加
  bottom={...}
  top={...}
  ...
/>
```

---

## 6. CenterInfo.tsx（スタイル変更のみ）

`containerStyle` を以下に変更:

```ts
const containerStyle: CSSProperties = {
  position: 'absolute',
  top: '25%',
  left: '25%',
  right: '25%',
  bottom: '25%',
  background: 'rgba(10, 10, 20, 0.80)',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 8,                    // 円形 → 角丸
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 11,
  color: '#eee',                      // 白系テキスト
  textAlign: 'center',
  boxShadow: '0 2px 12px rgba(0,0,0,0.6)',
  zIndex: 10,
  pointerEvents: 'none',
};
```

スコアの色を変更:
```ts
// before: '#1a4a2e' / '#cc0000'
// after:
color: snap.scores[seat]! >= 0 ? '#7ef' : '#f88',
```

---

## 7. SidePanel.tsx（手牌サイズ変更 + 捨て牌左寄せ）

### 手牌サイズ

POV（bottom プレイヤー）の手牌のみ `small` を外す（normal サイズで表示）。

```ts
player.hand.map((t, i) =>
  showFace
    ? <TileDisplay key={i} tile={t} small={!isPov} />  // isPov なら normal
    : <TileBack key={i} small />                         // 裏牌は常に small
)
```

### 捨て牌: 6列左寄せ

現行は center 揃い。捨て牌エリアのコンテナを `alignItems: 'flex-start'` に変更し、行を左詰めにする。

```ts
// 変更前
<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>

// 変更後
<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1, width: '100%' }}>
```

各行 div は `display: flex`（`justifyContent` 指定なし → デフォルト flex-start）のままでよい。

---

## 完了条件

- `pnpm typecheck` エラーなし
- `pnpm viewer` でブラウザ起動、牌が Unicode 絵文字で表示される
- 壁牌が 4 辺に表示され、ツモが進むにつれて減少する
- `pnpm test` 全 124 件通過（viewer はテスト対象外だが engine 系が壊れていないことを確認）
