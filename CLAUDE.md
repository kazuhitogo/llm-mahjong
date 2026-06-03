# CLAUDE.md — Claude Code 向け必読指示

## プロジェクト概要

LLM エージェント同士が対戦する日本リーチ麻雀エンジン（TypeScript / Node.js）。
エンジン・スコア計算・LLM エージェント・Web ビューアで構成される。

---

## ドキュメントマップ

| ファイル | 用途 |
|---|---|
| `SPEC.md` | 仕様概要・モジュール構成・主要インタフェース |
| `PLAN.md` | **残タスクのみ**。実装着手時に必ず最初に読む |
| `docs/rules.md` | 天鳳ルール・牌表現・壁山構造の詳細 |
| `docs/engine.md` | GameState・ターンフロー・アクション API・フリテン |
| `docs/scoring.md` | 役判定・点数計算・半荘進行・連荘判定の詳細 |
| `docs/viewer.md` | Viewer 現行アーキテクチャ（卓レイアウト・牌/鳴き描画・UI） |

---

## 現在のフォーカス

Phase 6（Viewer ビジュアルリニューアル）完了。残タスクなし。

新フェーズ着手時:

1. `PLAN.md` でタスク一覧と実装順序を確認
2. 関連 docs（viewer 変更時は `docs/viewer.md`）で現行アーキテクチャを参照

---

## 必須チェック

```bash
pnpm test        # 全テスト通過（126件）を確認
pnpm typecheck   # TypeScript エラーなしを確認
pnpm viewer      # ブラウザで目視確認（viewer 変更時）
```

---

## コーディングルール

- **変更完了条件**: `pnpm test` + `pnpm typecheck` が通ること
- コメントは WHY が非自明な場合のみ書く（WHAT は書かない）
- SPEC.md / PLAN.md / docs/ は変更内容に合わせて更新する
- PLAN.md の完了タスクは削除し、残タスクのみ残す
- バグ修正時は PLAN.md に履歴を残さない（コミットメッセージに記録）

---

## 既知の設計判断

- `riichi-rs-node` の `hairi.now === 0` チェックは必須（非テンパイでも `waits_after_discard` を返す）
- ダブロン連荘: `events.some(e => e.kind==='agari' && e.winner===dealerSeat)` で判定（`lastAgari` だけ見るのは誤り）
- 流し満貫発動時はノーテン罰符なし（`applyNagashiMangan()` が `true` を返したらスキップ）
- リーチ宣言の tenpai 検証: `waitTiles(handAfterDiscard, melds).length === 0` なら violation
- 西入り: 南4局終了時に全員 returnPoints 未満 → 西場突入（`RuleConfig.nishiiri: true`）
- viewer 手牌ソート: draw/rinshan 後に `sortTiles()` を viewer-state.ts で適用（エンジン側ソートは引き継がれない）
- ライブビューア: `LiveServer`（src/live/server.ts）が SSE /events を提供、replay buffer で接続後に全履歴を送信
