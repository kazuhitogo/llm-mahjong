# 実装プラン（残タスクのみ）

## 現在のフォーカス: Phase 6 — Viewer ビジュアルリニューアル

**目標**: 現行 viewer の見た目を天鳳風にリニューアル。ゲームロジック・UI 構造（タブ・送り操作・POV 選択）は変更しない。

**詳細仕様**: [`docs/viewer-phase6.md`](./docs/viewer-phase6.md) — 実装に必要な全情報（コードスニペット込み）を記載。

---

## タスク一覧

| # | タスク | 対象ファイル | 状態 |
|---|---|---|---|
| 6-1 | Unicode 絵文字マッピング + CSS 3D 牌（ivory + box-shadow） | `src/viewer/components/TileDisplay.tsx` | ⬜ |
| 6-2 | CSS ダーク 3D 裏面牌（TileDisplay と同サイズ） | `src/viewer/components/TileBack.tsx` | ⬜ |
| 6-3 | WallTiles コンポーネント新規作成（壁牌ストリップ） | `src/viewer/components/WallTiles.tsx` | ⬜ |
| 6-4 | 背景テクスチャ（navy）+ remainingDraws prop + 壁牌 4 辺配置 | `src/viewer/components/TableLayout.tsx` | ⬜ |
| 6-5 | snap.wallRemaining を TableLayout に渡す（1 行変更） | `src/viewer/App.tsx` | ⬜ |
| 6-6 | 白丸 → ダーク角丸パネル、テキスト色を白系に | `src/viewer/components/CenterInfo.tsx` | ⬜ |
| 6-7 | isPov の手牌を normal サイズ（small=false）で表示 + 捨て牌を 6列左寄せ（flex-start）に変更 | `src/viewer/components/SidePanel.tsx` | ⬜ |

## 実装順序

1 → 2 → 3 → 4 → 5 → 6 → 7 の順。各ステップ後に `pnpm typecheck` を実行。

## 完了条件

- `pnpm typecheck` エラーなし
- `pnpm test` 全 124 件通過
- `pnpm viewer` でブラウザ確認: 牌が Unicode 絵文字（🀇🀙🀐など）で表示、壁牌が 4 辺に表示
