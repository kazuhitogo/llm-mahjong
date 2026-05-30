# Viewer 現行アーキテクチャ

牌譜を上から見た麻雀卓として 1 ステップずつ再生する Web ビューア（Vite + React）。

## データフロー

```
pnpm match --log-file game.json
  → src/logs/{timestamp}.json（GameLog 形式）

ブラウザで JSON 読込
  → buildSnapshots(kyoku.events, startScores): ViewerSnapshot[]
  → React state で stepIdx 管理 → snap: ViewerSnapshot
  → TableLayout + CenterInfo に渡して描画
```

## 主要型（`viewer-state.ts`）

```ts
interface ViewerSnapshot {
  eventIndex: number;
  event: GameEvent;
  description: string;
  prompt?: string;       // think イベント時のプロンプト
  round: { wind: string; kyoku: number; honba: number; riichiSticks: number };
  dealerSeat: number;
  players: [ViewerPlayer, ViewerPlayer, ViewerPlayer, ViewerPlayer];
  wallRemaining: number; // 残りツモ可能枚数
  scores: [number, number, number, number];
}

interface ViewerPlayer {
  hand: Tile[];
  discards: ViewerDiscard[]; // { tile, isRiichiDecl, calledBy }
  melds: ViewerMeld[];
  riichi: boolean;
}

interface ViewerMeld {
  kind: 'pon' | 'chi' | 'daiminkan' | 'ankan' | 'kakan';
  tiles: Tile[];
  calledTile: Tile | null; // 鳴いて入手し横向き表示する牌（暗槓は null）
  from: number | null;     // 鳴いた相手の相対位置 1=下家 2=対面 3=上家（暗槓は null）
  addedTile?: Tile;        // 加槓で追加した牌（横向き牌の上に重ねる）
}
```

## コンポーネント構成

```
App.tsx
  TableLayout.tsx   卓の外枠（720px 正方形・回転ラッパー方式）
    DiscardPart     河（SeatArea.tsx）
    WallStrip.tsx   山（17×2 の寝かせ牌）
    HandPart        手牌＋鳴き（SeatArea.tsx）
  CenterInfo.tsx    局情報・点数（中央のダーク角丸パネル）
```

牌コンポーネント（`Tile.tsx`）。実寸は `TILE_W=18`（短辺）, `TILE_L=24`（表面の長辺）, `TILE_T=11`（伏せ牌の上面）:

- `FrontTile` — 表向き。数字＋スート漢字（萬=赤 / 筒=青 / 索=緑 / 赤5=橙、字牌は黒、發=緑・中=赤）。自家手牌・河・鳴きで使用
- `BackTile` — 立てて伏せた牌の上面（18×11）。他家手牌で使用
- `FlatTile` — 寝かせた牌を上から見た面（18×24、表牌と同じ面サイズ）。山・暗槓の伏せ牌で使用

## レイアウト（TableLayout）

`SIZE = 720` の正方形。各座席を SIZE×SIZE の回転ラッパー div として中心に重ね、`transform: translate(-50%,-50%) rotate(deg)` で回す。
ラッパー内の子は `top: SIZE/2 + R`（R = 中心からその方向への距離）で配置するため、河が増えても他要素が動かない。

```
中心 → 河 → 山 → 手牌 の順にプレイヤー側へ伸びる
R_DISCARD = 90   河の先頭
R_WALL    = 198  山の先頭
R_HAND    = 280  手牌の先頭
```

座席の回転角（POV 視点）:

```ts
const seatAt = { bottom: povSeat, right: (povSeat+1)%4, top: (povSeat+2)%4, left: (povSeat+3)%4 };
// bottom=0° / right=-90° / top=180° / left=90°
```

## 各エリア（SeatArea / WallStrip）

- **河（DiscardPart）**: 6 列固定幅・左揃え。3×6 を基本とし 19 牌目以降は 4 行目へ折り返す。リーチ宣言牌は黄ハイライト、鳴かれた牌は減光
- **山（WallStrip）**: 17×2 段の `FlatTile`。上段＝上山（プレイヤーから見て奥）。消費済みは薄く残し段の長さを一定に保つ
- **手牌（HandPart）**: 自家／全開示は `FrontTile`、他家は `BackTile`。右側に鳴き面子を底辺揃えで並べる
- **鳴き面子（MeldView / buildMeld）**: 入手牌のみ横倒し（`SideTile` = `FrontTile` を 90° 回転）。横倒しの位置は鳴いた相手で決まる（上家=左 / 対面=中 / 下家=右）。加槓は横向き 2 枚を縦に積む。暗槓は両端を `FlatTile` で伏せ中 2 枚を表向き

## CenterInfo

中央のダーク角丸パネル（174×174）。3×3 グリッドの四隅に各家の点数を、それぞれの読みやすい向きへ回転して配置（点数色: 正 `#7ef` / 負 `#f88`）。中央セルに局名・本場・供託・残り枚数（配牌時のサイコロイベント中は出目）を表示。

## UI コントロール

- 局タブ: `log.kyoku[]` から `init` イベントの局ラベルを生成
- ⏮◀▶⏭ ボタン + スライダー + ← → / ↑ ↓ / Home / End キー
- POV 選択（select: seat0〜3）、全開示トグル
- イベント説明文（`viewer-state.ts: describeEvent()`）
- think イベント: 紫背景で推論テキスト表示、入力プロンプトは折り畳み

## ビルド・起動

```bash
pnpm viewer   # Vite dev server（src/viewer/ が root）
```

ビルド成果物: `src/viewer/dist/`
