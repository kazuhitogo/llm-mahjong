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
  wallRemaining: number; // 残りツモ可能枚数（カンで海底繰り上げ反映）
  scores: [number, number, number, number];
  wall: ViewerWall;      // 物理的な山描画用ジオメトリ
}

interface ViewerWall {
  breakSeat: number;      // 開門した壁の席（絶対）
  dieSum: number;         // サイコロ合計（右端から数える開門スタック位置）
  drawnCount: number;     // 配牌52＋ツモ。ツモ順 o がこの値未満なら消費済み
  doraIndicators: Tile[]; // めくれたドラ表示牌（初期1＋カンごと、表向き描画用）
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
App.tsx（3 カラム flex。狭画面では縦積みフォールバック）
  左カラム(~240px)  タイトル・ログ読込・seed / 局タブ / 再生コントローラー / POV・全開示
  中央             TableLayout.tsx   卓の外枠（720px 正方形・回転ラッパー方式・位置不動）
                     DiscardPart     河（SeatArea.tsx）
                     WallStrip.tsx   山（17×2 の寝かせ牌）
                     HandPart        手牌＋鳴き（SeatArea.tsx）
                   CenterInfo.tsx    局情報・点数（中央のダーク角丸パネル）
  右カラム(~300px)  イベント説明 / 推論(think) / 入力プロンプト（縦スクロール）
```

可変高さの要素（説明・推論・プロンプト）は右カラムに隔離し縦スクロールさせる。
これによりステップ送りで説明高さが変動しても中央の卓は一切動かない。

牌コンポーネント（`Tile.tsx`）。実寸は `TILE_W=18`（短辺）, `TILE_L=24`（表面の長辺）, `TILE_T=11`（伏せ牌の上面）:

- `FrontTile` — 表向き。数字＋スート漢字（萬=赤 / 筒=青 / 索=緑 / 赤5=橙、字牌は黒、發=緑・中=赤）。自家手牌・河・鳴きで使用
- `BackTile` — 立てて伏せた牌の上面（18×11）。他家手牌で使用
- `FlatTile` — 寝かせた牌を上から見た面（18×24、表牌と同じ面サイズ）。山・暗槓の伏せ牌で使用。`spent`=消費済み（薄）/`dead`=王牌（琥珀）

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
- **山（WallStrip / wallStacksForSeat）**: 17×2 段。実麻雀の開門・王牌・ツモ順を再現する。各物理位置（席・右端からのスタック・段）にツモ順 `o`（0=配牌開始, +1 で反時計回り）を割り当て、状態を分類する:
  - 開門壁では右端から `dieSum+1` スタック目が配牌開始（`o=0`）。王牌（`o≥122`, 14枚）は割れ目の直右7スタックに配置（T≥7 時）。嶺上牌（`deadIdx 0..3`）= 割れ目に最も近い左2スタック、ドラ表示牌（`deadIdx 4`）= 上段・左から3番目。偶数 deadIdx = 上段（表ドラ位置）、奇数 = 下段（裏ドラ位置）。
  - 非開門壁は壁順 `breakSeat → breakSeat-1 → -2 → -3` で右端(o小)→左端(o大)。
  - `o<drawnCount`=消費済み（薄）、王牌（`o≥122` ＋カン繰り上げ `o≥liveLimit`）=琥珀、ドラ表示牌位置（`deadWall[4],[6],…`）=表向き（`FrontTile`）。嶺上で取られた王牌スロットは消費済み表示で王牌を常に14枚に保つ
- **手牌（HandPart）**: 自家／全開示は `FrontTile`、他家は `BackTile`。右側に鳴き面子を底辺揃えで並べる
- **鳴き面子（MeldView / buildMeld）**: 入手牌のみ横倒し（`SideTile` = `FrontTile` を 90° 回転）。横倒しの位置は鳴いた相手で決まる（上家=左 / 対面=中 / 下家=右）。加槓は横向き 2 枚を縦に積む。暗槓は両端を `FlatTile` で伏せ中 2 枚を表向き

## CenterInfo

中央のダーク角丸パネル（174×174）。3×3 グリッドの四隅に各家の点数を、それぞれの読みやすい向きへ回転して配置（点数色: 正 `#7ef` / 負 `#f88`）。中央セルに局名・本場・供託・その局のサイコロ出目（🎲 常時表示）・残り枚数を表示。

## UI コントロール

すべて左カラムに集約（卓に高さ影響を与えないため）:

- タイトル・ログ読込（`<label>` で `<input type=file>` を包む）・seed 表示・モデル名（`log.models` があるとき seat0〜3 を一覧）
- 局タブ: `log.kyoku[]` から `init` イベントの局ラベルを生成（縦並び/折り返し）
- ⏮◀▶⏭ ボタン + スライダー + ← → / ↑ ↓ / Home / End キー
- POV 選択（select: seat0〜3）、全開示トグル

右カラム:

- イベント説明文（`viewer-state.ts: describeEvent()`）
- think イベント: 紫背景で推論テキスト表示
- 入力プロンプトは折り畳み（`<details>`）。カラム内で縦スクロール

## ビルド・起動

```bash
pnpm viewer   # Vite dev server（src/viewer/ が root）
```

ビルド成果物: `src/viewer/dist/`
