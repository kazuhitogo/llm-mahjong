# LLM Mahjong — 仕様概要 v0.5

LLM エージェント同士が対戦する日本リーチ麻雀エンジン（TypeScript / Node.js）。

---

## スコープ

**含むもの**:
- 牌・山・手牌・副露・河の状態管理
- 配牌・ツモ・打牌・鳴き・リーチ・和了の進行制御
- 合法手の列挙（LLM エージェントが選択前にエンジンが提示）
- 役判定・符計算・点数授受（`riichi-rs-node` Rust ライブラリ経由）
- 半荘進行（連荘・流局・本場・供託）
- LLM エージェント向け自然言語プロンプト整形（Ollama 対応）
- 対局ログ（決定論的 JSON、後から再現可能）
- Web ビューア（牌譜を 1 ステップずつ再生）

**含まないもの**（v1）:
- 強化学習・教師あり学習
- ネットワーク対戦サーバ
- 天鳳牌譜互換フォーマット

---

## モジュール構成

```
src/
  types/      Tile, Action, GameState, Meld, Seat 等の型定義
  tiles/      牌操作ユーティリティ（ソート・種別判定・赤ドラ変換）
  wall/       山生成（seed + サイコロ）・ドラ・嶺上
  engine/     GameEngine（1局）・HanchanEngine（半荘）・合法手・フリテン
  score/      riichi-rs-node ラッパ・点数支払い計算・順位計算
  agent/      Player インタフェース・OllamaAgent・ScriptedBot
  log/        GameLog 型・シリアライズ・replayKyoku
  cli/        play.ts（人間 CLI）・match.ts（LLM 対局ハーネス）
  viewer/     Web ビューア（Vite + React）
```

---

## 詳細仕様（docs/ 参照）

| ドキュメント | 内容 |
|---|---|
| [`docs/rules.md`](./docs/rules.md) | 天鳳鳳凰卓ルール・牌表現・壁山構造 |
| [`docs/engine.md`](./docs/engine.md) | GameState 型・ターンフロー・アクション API・フリテン・ログ |
| [`docs/scoring.md`](./docs/scoring.md) | 役判定・点数計算・半荘進行・連荘判定 |
| [`docs/viewer.md`](./docs/viewer.md) | Viewer 現行アーキテクチャ（Phase 5 完了済み） |
| [`docs/viewer-phase6.md`](./docs/viewer-phase6.md) | **Phase 6 実装仕様**（ビジュアルリニューアル） |

---

## 主要インタフェース

```ts
// エンジン操作
engine.step()                        // draw フェーズ: ツモ実行
engine.legalActions(seat): Action[]  // 現在の合法手を返す
engine.applyAction(seat, action)     // アクションを適用
engine.getObservation(seat)          // プレイヤー視点の観測情報

// スコア計算
calculator.calculateAgari(input): AgariResult
calculator.riichiCandidates(hand14, melds): { discard, waits }[]
calculator.waitTiles(hand13, melds): Tile[]
calculator.calculateShanten(hand, melds): number

// エージェント
player.decide(obs, legalActions): Promise<{ action, reasoning?, prompt? }>
```

---

## 決定論的再現

- 山生成は `rngSeed: number` から決定
- 局シード: `(rngSeed + kyokuIndex * 7919) >>> 0`
- ログには seed + 全アクションを保存 → `replayKyoku(events, calculator)` で完全再現
