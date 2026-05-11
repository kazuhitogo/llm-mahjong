# 実装プラン / 進捗管理

各 Phase の項目について、実装ステータスと関連ファイルを記録する。
詳細仕様は [SPEC.md](./SPEC.md) を参照。

ステータス記号:
- ✅ 完了（テスト含む）
- 🟡 進行中
- ⬜ 未着手

最終更新: 2026-05-11 (Phase 5c 完了)

---

## Phase 1 — エンジン MVP

| 項目 | 状態 | 場所 |
|---|---|---|
| プロジェクト設定 | ✅ | `package.json` `tsconfig.json` `tsup.config.ts` `vitest.config.ts` |
| コア型定義 | ✅ | `src/types/` |
| 牌操作ユーティリティ | ✅ | `src/tiles/tile.ts` |
| 決定論的 RNG | ✅ | `src/wall/rng.ts` |
| 山積み・サイコロ・配牌・ツモ | ✅ | `src/wall/wall.ts` |
| 王牌・ドラ表示・嶺上 | ✅ | `src/wall/wall.ts` |
| GameEngine 状態機械 | ✅ | `src/engine/engine.ts` |
| 合法手列挙（打牌のみ） | ✅ | `src/engine/legal.ts` |
| 観測情報生成 | ✅ | `src/engine/engine.ts` |
| 荒牌流局 | ✅ | `src/engine/engine.ts` |
| イベントログ | ✅ | `src/engine/engine.ts` |
| CLI ハーネス | ✅ | `src/cli/play.ts` `src/cli/format.ts` |
| 単体テスト | ✅ | `src/**/*.test.ts` |

---

## Phase 2 — 完全な 1 局

### 2a — 鳴きなしで和了通す

| 項目 | 状態 | 場所 |
|---|---|---|
| `riichi-rs-node` 統合 | ✅ | `src/score/calculator.ts` |
| `ScoreCalculator` インタフェース | ✅ | `src/score/calculator.ts` |
| ツモ和了・ロン和了アクション | ✅ | engine |
| リーチ宣言 | ✅ | engine |
| フリテン判定 | ✅ | `src/engine/furiten.ts` |
| 嶺上開花・海底・河底 | ✅ | engine |
| 点数授受 | ✅ | `src/score/payout.ts` |

### 2b — 鳴きを追加

| 項目 | 状態 | 場所 |
|---|---|---|
| ポン・チー・大明槓・暗槓・加槓 | ✅ | engine |
| 鳴き宣言の優先度解決 | ✅ | engine |
| 喰い断・喰い延ばし | ✅ | engine + score |

### 2c — 途中流局・特殊役

| 項目 | 状態 | 場所 |
|---|---|---|
| 九種九牌・四風連打・四家立直・四開槓・三家和 | ✅ | engine |
| 流し満貫 | ✅ | engine + score |
| 役満（13役満） | ✅ | score |
| 包（責任払い） | ✅ | score |

---

## Phase 3 — 半荘進行

| 項目 | 状態 | 場所 |
|---|---|---|
| 連荘・親流れ判定 | ✅ | engine |
| 本場の加算 | ✅ | engine |
| 供託（リーチ棒）の引き継ぎ | ✅ | engine |
| 半荘終了判定 | ✅ | engine |
| 飛び終了時のリーチ棒配布 | ✅ | `src/engine/hanchan.ts` |
| 順位計算（オカ・ウマ） | ✅ | `src/score/standings.ts` |
| 対局ログ JSON 出力 | ✅ | `src/log/log.ts` |
| ログから状態再現（リプレイ） | ✅ | `src/log/replay.ts` |

---

## Phase 4 — エージェントレイヤ

| 項目 | 状態 | 場所 |
|---|---|---|
| Player インタフェース定義 | ✅ | `src/agent/player.ts` |
| ScriptedBot プレイヤー | ✅ | `src/agent/scripted.ts` |
| Observation の自然言語整形 | ✅ | `src/agent/llm/format.ts` |
| LlmAgent ランナー（Ollama） | ✅ | `src/agent/llm/ollama.ts` |
| 4 エージェント対局ハーネス | ✅ | `src/cli/match.ts` |

### Phase 4 で発見・修正したバグ

| バグ | 修正場所 | 内容 |
|---|---|---|
| `riichiCandidates` 非テンパイ手にリーチ候補を生成 | `src/score/calculator.ts` | `hairi.now === 0` チェック追加。`riichi-rs-node` は非テンパイ手でも `waits_after_discard` を返すため必須 |
| 飛び終了時のリーチ棒消滅 | `src/engine/hanchan.ts` | 飛びパスで `distributeSticks()` を呼ぶよう修正 |
| qwen3 系 thinking モード | `src/agent/llm/ollama.ts` | `think: false` を API リクエストに追加 |
| `legalActions` アクション順 | `src/engine/engine.ts` | ツモ→打牌→リーチの順に変更（モデルが先頭番号を選びやすいため） |
| `riichiCandidates` no yaku エラー | `src/engine/engine.ts` | try-catch で握りつぶし |

---

## Phase 5 — Web ビューア（次フェーズ）

### 5a — match ログ出力接続

| 項目 | 状態 | 場所 | 備考 |
|---|---|---|---|
| `match.ts` に `--log-file` オプション追加 | ✅ | `src/cli/match.ts` | 対局後に JSON 保存 |
| `exportLog` / `serializeLog` 呼び出し接続 | ✅ | `src/cli/match.ts` | `src/log/log.ts` の関数を使う |

### 5b — Web ビューア実装

| 項目 | 状態 | 場所 | 備考 |
|---|---|---|---|
| Vite + React プロジェクト設定 | ✅ | `src/viewer/`, `vite.config.ts` | TypeScript, 既存型を import |
| 牌譜 JSON 読み込み UI | ✅ | `src/viewer/App.tsx` | ファイル選択 |
| 局選択・ステップ送り UI | ✅ | `src/viewer/App.tsx` | 前へ/次へ・スライダー・← →キー |
| 手牌・河・副露の表示 | ✅ | `src/viewer/components/` | 4 プレイヤー分 |
| 点数・供託・ドラ表示 | ✅ | `src/viewer/App.tsx` | 供託・残り牌数・最終結果 |
| イベント説明テキスト表示 | ✅ | `src/viewer/viewer-state.ts` | 「seat1(南家) 打牌 3m」等 |
| `pnpm viewer` スクリプト | ✅ | `package.json` | `vite` (root: src/viewer) |

### 5c — 麻雀卓スタイルビューア（一人称視点）

既存の 2×2 グリッドを天鳳風麻雀卓レイアウトに置換する。  
詳細仕様は [SPEC.md §12c〜12f](./SPEC.md) を参照。

| 項目 | 状態 | 場所 | 備考 |
|---|---|---|---|
| POV 選択 state + ヘッダー UI | ✅ | `App.tsx` | `povSeat: 0-3`, `showAll: bool` |
| `TileBack` コンポーネント | ✅ | `src/viewer/components/TileBack.tsx` | 裏向き牌（濃い青矩形） |
| `TableLayout` コンポーネント | ✅ | `src/viewer/components/TableLayout.tsx` | 正方形卓、absolute + rotate |
| `SidePanel` コンポーネント | ✅ | `src/viewer/components/SidePanel.tsx` | 手牌・副露・捨て牌・スコア |
| `CenterInfo` コンポーネント | ✅ | `src/viewer/components/CenterInfo.tsx` | 局/本場/供託/残り牌数/4者スコア |
| `App.tsx` メインエリア差し替え | ✅ | `src/viewer/App.tsx` | 2×2 → `TableLayout` へ |

#### 実装順序
1. `TileBack.tsx` を新規作成
2. `CenterInfo.tsx` を新規作成
3. `SidePanel.tsx` を新規作成（props: player, seat, dealerSeat, isPov, showAll, position, modelName）
4. `TableLayout.tsx` を新規作成（absolute + rotate で 4 辺配置）
5. `App.tsx` を改修（POV state 追加 + メインエリア差し替え）

#### 座席マッピング
```ts
const seatAt = {
  bottom: povSeat,
  right:  (povSeat + 1) % 4,
  top:    (povSeat + 2) % 4,
  left:   (povSeat + 3) % 4,
};
```

#### 捨て牌レイアウト（天鳳準拠）
- 各 `SidePanel` 内で描画（外部 `DiscardArea` コンポーネントは不要）
- 最大 6 枚 × 3 行 = 18 枚
- bottom: 捨て牌が手牌より卓中央寄り（上側）に来る flex-column
- top/left/right: `transform: rotate(N deg)` で回転後も同じ構造で可

#### スタイル定数
```ts
const TABLE_BG = '#1a4a2e';    // フェルト
const TILE_BACK_BG = '#2c5282'; // 裏牌
```

---

## 観測中の検討事項

- 天鳳牌譜互換フォーマット（XML）: 要求あれば Phase 5 後に追加
- Anthropic / OpenAI API エージェント: Ollama で代替済み、必要なら追加
- LLM モデルの応答品質: gemma3/gemma4(2B) は空返答→fallback が多い。qwen3.5:9b は推論するが遅い
- `qwen3-vl:8b` の空返答: `num_predict: 256` に対して thinking が長すぎてトークン不足。増やせば改善する可能性あり
