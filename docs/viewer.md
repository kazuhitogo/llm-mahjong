# Viewer 現行アーキテクチャ（Phase 5 完了済み）

## データフロー

```
pnpm match --log-file game.json
  → logs/{timestamp}.json（GameLog 形式）

ブラウザで JSON 読込
  → buildSnapshots(kyoku.events, startScores): ViewerSnapshot[]
  → React state で stepIdx 管理 → snap: ViewerSnapshot
  → TableLayout + 4×SidePanel + CenterInfo に渡して描画
```

## 主要型

```ts
interface ViewerSnapshot {
  eventIndex: number;
  event: GameEvent;
  description: string;
  prompt?: string;       // think イベント時のプロンプト
  round: { wind: string; kyoku: number; honba: number; riichiSticks: number };
  dealerSeat: number;
  players: [ViewerPlayer, ViewerPlayer, ViewerPlayer, ViewerPlayer];
  wallRemaining: number; // 残りツモ可能枚数（0〜70）
  scores: [number, number, number, number];
}

interface ViewerPlayer {
  hand: Tile[];
  discards: ViewerDiscard[];   // { tile, isRiichiDecl, calledBy }
  melds: ViewerMeld[];         // { kind, tiles }
  riichi: boolean;
}
```

## コンポーネント構成

```
App.tsx
  TableLayout.tsx  ← 卓の外枠（正方形、absolute positioning）
    SidePanel.tsx  × 4（bottom/top/left/right）
      TileDisplay.tsx   手牌・捨て牌・副露の表牌
      TileBack.tsx      裏牌（他家の手牌）
    CenterInfo.tsx     局情報・スコア（中央円形パネル）
```

## レイアウト（TableLayout）

```
[top panel: top=0, height=22%, rotate 180°]
[left: left=0, width=22%, rotate 90°]  [center: 56%×56%]  [right: right=0, width=22%, rotate -90°]
[bottom panel: bottom=0, height=22%]
```

座席マッピング（POV 視点）:
```ts
const seatAt = {
  bottom: povSeat,
  right:  (povSeat + 1) % 4,
  top:    (povSeat + 2) % 4,
  left:   (povSeat + 3) % 4,
};
```

## SidePanel レイアウト

flex-column（center 寄り → edge 寄り）:
1. 捨て牌エリア（最大 6枚×3行）
2. 副露エリア（鳴き牌は常に表向き）
3. 手牌エリア（POVまたは全開示なら表向き、そうでなければ TileBack）
4. プレイヤー情報行（風・親マーク・リーチ・スコア）

## UI コントロール

- 局タブ: log.kyoku[].events から `init` イベントで局ラベルを生成
- ⏮◀▶⏭ ボタン + スライダー + ← → キー
- POV 選択（select: seat0〜3）、全開示トグル
- イベント説明文（`viewer-state.ts: describeEvent()`）
- think イベント: 紫背景で推論テキスト表示、プロンプト詳細は折り畳み

## ビルド・起動

```bash
pnpm viewer   # Vite dev server（src/viewer/ が root）
```

ビルド成果物: `src/viewer/dist/`
