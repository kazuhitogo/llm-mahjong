# 実装プラン / 進捗管理

各 Phase の項目について、実装ステータスと関連ファイルを記録する。
詳細仕様は [SPEC.md](./SPEC.md) を参照。

ステータス記号:

- ✅ 完了（テスト含む）
- 🟡 進行中
- ⬜ 未着手

最終更新: 2026-05-10 (Phase 2b 完了)

---

## Phase 1 — エンジン MVP（CLI で人間が打てる最小フロー）

| 項目 | 状態 | 場所 | 備考 |
|---|---|---|---|
| プロジェクト設定 | ✅ | `package.json` `tsconfig.json` `tsup.config.ts` `vitest.config.ts` | pnpm + Vitest + tsup, strict TS, ESM, Node 20+ |
| コア型定義 | ✅ | `src/types/` | Tile, TileId, Seat, Wind, Meld, Action, GameState, RuleConfig |
| 牌操作ユーティリティ | ✅ | `src/tiles/tile.ts` + `tile.test.ts` | tile 構築、kind 変換、ソート、ドラ表示計算、ID 変換 |
| 決定論的 RNG | ✅ | `src/wall/rng.ts` | Mulberry32 |
| 山積み（layout 136 牌） | ✅ | `src/wall/wall.ts` | シャッフル後固定、`WallState.layout` |
| サイコロ + 開門位置計算 | ✅ | `src/wall/wall.ts` | 親が 2 個振る、`breakIndex` を計算 |
| 配牌 | ✅ | `src/wall/wall.ts` | 親→下家→対面→上家、4×3+1 で各 13 枚 |
| ツモ（決定論的順序） | ✅ | `src/wall/wall.ts` | `peekNextDraw` `drawTile`、layout から順次 |
| 王牌・ドラ表示・嶺上 | ✅ | `src/wall/wall.ts` | `getDoraIndicators` `rinshanTileId` |
| GameEngine 状態機械 | ✅ | `src/engine/engine.ts` | draw → discard → 次家 のループ |
| 合法手列挙 | ✅ | `src/engine/legal.ts` | Phase 1 は discard のみ |
| 違反処理 | ✅ | `src/engine/legal.ts` | 不正アクションは強制ツモ切りに置換 |
| 観測情報生成 | ✅ | `src/engine/engine.ts` | `getObservation(seat)`、サイコロ・ドラ含む |
| 荒牌流局 | ✅ | `src/engine/engine.ts` | 山切れで `phase=ryukyoku` → `end` |
| イベントログ | ✅ | `src/engine/engine.ts` | init / dice / deal / draw / action / violation / ryukyoku |
| CLI ハーネス | ✅ | `src/cli/play.ts` `src/cli/format.ts` | `pnpm cli --human SEAT --seed N` |
| 単体テスト | ✅ | `src/**/*.test.ts` | tile / wall / engine、サンドボックスで 32 件パス |

---

## Phase 2 — 完全な 1 局

### 2a — 鳴きなしで和了通す

| 項目 | 状態 | 場所 | 備考 |
|---|---|---|---|
| `riichi-rs-node` 統合 | ✅ | `src/score/calculator.ts` | createRequire で同期ロード、RiichiRsCalculator |
| `ScoreCalculator` インタフェース | ✅ | `src/score/calculator.ts` | calculateAgari/calculateShanten/riichiCandidates/waitTiles |
| ツモ和了アクション | ✅ | engine | `tsumo` action, legalActions に tsumo 追加, 点数授受 |
| ロン和了アクション | ✅ | engine | call phase, `ron`/`pass` action, ダブロン対応 |
| リーチ宣言 | ✅ | engine | `riichi` action, 1000点減点, ippatsu フラグ管理 |
| フリテン判定 | ✅ | `src/engine/furiten.ts` | 自家河・同順・リーチ後 |
| 嶺上開花・海底・河底 | ✅ | engine | isHaitei/isHoutei を agari 計算時に渡す |
| 点数授受 | ✅ | `src/score/payout.ts` | 親子・ツモ・ロン・本場・供託 |

### 2b — 鳴きを追加

| 項目 | 状態 | 場所 | 備考 |
|---|---|---|---|
| ポン | ✅ | engine | 副露生成、鳴き優先度 |
| チー | ✅ | engine | 上家のみ、喰い替え禁止 |
| 大明槓 | ✅ | engine | 嶺上ツモ |
| 暗槓・加槓 | ✅ | engine | 自分の番、搶槓考慮 |
| 鳴き宣言の優先度解決 | ✅ | engine | ロン > ポン/カン > チー、ダブロン |
| 喰い断・喰い延ばし | ✅ | engine + score | RuleConfig 連動 |

### 2c — 途中流局・特殊役

| 項目 | 状態 | 場所 | 備考 |
|---|---|---|---|
| 九種九牌 | ✅ | engine | 1 巡目自分の番、字牌+1/9 が 9 種以上 |
| 四風連打 | ✅ | engine | 1 巡目で全員同じ風牌切り |
| 四家立直 | ✅ | engine | 4 人がリーチ完了で流局 |
| 四開槓 | ✅ | engine | 同一プレイヤー以外で 4 槓 |
| 三家和 | ✅ | engine | トリプルロン |
| 流し満貫 | ⬜ | engine + score | ヤオチュー牌のみで鳴かれていない |
| 役満 | ⬜ | score | 13 役満（国士・四暗刻・大三元 etc.） |
| 包（責任払い） | ⬜ | score | 大三元・大四喜・四槓子 |

---

## Phase 3 — 半荘進行

| 項目 | 状態 | 場所 | 備考 |
|---|---|---|---|
| 連荘・親流れ判定 | ⬜ | engine | 親聴牌・和了で連荘 |
| 本場の加算 | ⬜ | engine | 1500 点の上乗せ |
| 供託（リーチ棒）の引き継ぎ | ⬜ | engine | 局またぎ |
| 半荘終了判定 | ⬜ | engine | 南 4 局終了 + 親 30000 以上、または飛び |
| 順位計算（オカ・ウマ） | ⬜ | `src/score/standings.ts`（新規） | 25000-30000 オカ +20、ウマ 5-10 |
| 対局ログ JSON 出力 | ⬜ | `src/log/`（新規） | 完全な決定論的リプレイ可能 |
| ログから状態再現（リプレイ） | ⬜ | `src/log/replay.ts` | seed + アクション列で同一トレース |

---

## Phase 4 — エージェントレイヤ

| 項目 | 状態 | 場所 | 備考 |
|---|---|---|---|
| Player インタフェース定義 | ⬜ | `src/agent/player.ts`（新規） | `decide(observation, legalActions): Promise<Action>` |
| HumanCli プレイヤー | ⬜ | `src/agent/human.ts` | 既存 CLI のリファクタ |
| ScriptedBot プレイヤー | ⬜ | `src/agent/scripted.ts` | ランダム / ヒューリスティック |
| Observation の自然言語整形 | ⬜ | `src/agent/llm/format.ts` | LLM プロンプト用 |
| Anthropic tool スキーマ | ⬜ | `src/agent/llm/anthropic.ts` | Action を tool call に対応付け |
| OpenAI tool スキーマ | ⬜ | `src/agent/llm/openai.ts` | 同上 |
| LlmAgent ランナー | ⬜ | `src/agent/llm/runner.ts` | API 呼び出し、retry、reasoning ログ |
| 4 エージェント対局ハーネス | ⬜ | `src/cli/match.ts`（新規） | 4 つの player を組み合わせて対局 |

---

## 観測中の検討事項

- `riichi-rs-node` を実際に組み込んでみて API が想定通りか確認（Phase 2a 着手時）
- LLM のレイテンシ次第で同期進行が現実的か → 必要なら Phase 4 で非同期化検討
- リプレイファイルのフォーマットは天鳳牌譜互換を視野に入れるか
