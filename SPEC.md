# LLM Mahjong — 仕様ドラフト v0.4

日本リーチ麻雀のコアエンジン。TypeScript / Node.js。
プレイヤー（人間でも LLM でも）はツール呼び出し相当の API で打牌・鳴き・和了を宣言する。

> Kazuhito と Claude の議論用ドラフト。**[要決定]** が未決、**[決定]** が確定済み。
> 各章末尾の **【実装ステータス】** は実装の進捗を示す。詳細は [PLAN.md](./PLAN.md) を参照。

---

## 1. スコープ

含むもの:
- 牌・山・手牌・副露・河の状態管理
- 配牌・ツモ・打牌・鳴き（ポン/チー/カン）・リーチ・和了（ツモ/ロン）の進行制御
- 合法手の列挙（エージェントが選ぶ前にエンジンが提示）
- 役判定・符計算・点数授受
- 1 局〜半荘単位の進行（連荘・流局・本場・供託）
- LLM エージェント向けの自然言語プロンプト整形（Ollama 対応）
- 対局ログ（後から再現可能な決定論的 JSON フォーマット）
- **Web ビューア**（牌譜を読み込み 1 ステップずつ再生）← Phase 5

含まないもの（v1 では）:
- 強化学習・教師あり学習
- ネットワーク対戦サーバ
- 天鳳牌譜互換フォーマット（将来検討）

---

## 2. ルール詳細 **[決定：天鳳鳳凰卓ルール準拠]**

- 局数: **半荘戦（東1〜南4）**（東風戦は `RuleConfig.gameLength: 'tonpu'` で切替）
- 持ち点 / 返し: **25,000 持ち / 30,000 返し**、オカ +20
- ウマ: **5-10**（4位 -10, 3位 -5, 2位 +5, 1位 +10）
- 赤ドラ: あり（5m/5p/5s 各1枚）
- 喰い断・後付け: あり
- 一発・裏ドラ: あり
- 流し満貫: あり
- 二翻縛り: なし（常に1翻縛り）
- 包（責任払い）: 大三元・大四喜・四槓子
- ダブロン: あり（頭ハネなし）
- 途中流局: 九種九牌・四風連打・四家立直・四開槓・三家和
- 喰い替え: 禁止
- 飛び終了: あり（0点未満）
- 連荘条件: 親の聴牌または和了

→ `RuleConfig` で切り替え可能。デフォルトは上記の天鳳鳳凰卓ルール。

**【実装ステータス】** ✅ 完了: `src/types/state.ts`（`RuleConfig`, `DEFAULT_RULES`）。

---

## 3. 牌の表現

```
1m〜9m  : 萬子
1p〜9p  : 筒子
1s〜9s  : 索子
1z〜7z  : 字牌（東=1z, 南=2z, 西=3z, 北=4z, 白=5z, 發=6z, 中=7z）
0m/0p/0s: 赤ドラ（赤5）
```

- 内部では `type Tile = string` の brand 型 + `TileId`（0〜135 の通し番号）の二段構え
- `TileId` は壁山生成・配牌の決定論的再現に使用

**【実装ステータス】** ✅ 完了: `src/types/tile.ts`, `src/tiles/tile.ts`

---

## 3.5 山積み・サイコロ・配牌

実麻雀の物理的な「積み」を再現するため、山構造は以下の固定された情報で表現（`WallState`）:

```ts
interface WallState {
  layout: readonly TileId[];      // 物理 136 牌、構築時に固定
  dice: readonly [number, number];
  breakIndex: number;
  drawnCount: number;             // 初期値 52
  doraIndicatorCount: number;     // 最大 5
}
```

- `dealWall(seed, dealerSeat)` で 136 牌を Mulberry32 でシャッフル
- N 番目のツモ牌 = `layout[(breakIndex + N) % 136]`
- `drawnCount = 122` で荒牌流局
- 王牌 14 牌：開門位置の手前（嶺上・ドラ表示・裏ドラ）

**【実装ステータス】** ✅ 完了: `src/wall/wall.ts`, `src/wall/rng.ts`

---

## 4. 状態モデル

```ts
type GameState = {
  config: RuleConfig;
  round: { wind: 'E' | 'S'; kyoku: 1|2|3|4; honba: number; riichiSticks: number };
  dealerSeat: Seat;
  turn: { seat: Seat; phase: 'draw' | 'discard' | 'call' | 'agari' | 'ryukyoku' };
  wall: WallState;
  players: [PlayerState, PlayerState, PlayerState, PlayerState];
  pendingCalls: PendingCall[];
  history: GameEvent[];
  rngSeed: number;
};

type PlayerState = {
  seat: Seat; seatWind: Wind;
  hand: Tile[]; melds: Meld[]; discards: Discard[];
  score: number;
  riichi: { declared: boolean; ippatsu: boolean; junme: number } | null;
  isFuriten: boolean;
};
```

**【実装ステータス】** ✅ 完了: `src/types/state.ts`

---

## 5. エージェント Tool API

エンジンが `legalActions(seat)` で合法手を返す。エージェントはその中から 1 つ選ぶ。

### ツモ番
| action | 説明 |
|---|---|
| `discard` | 打牌 |
| `riichi` | 立直宣言＋打牌（テンパイ時のみ提示） |
| `tsumo` | ツモ和了（自摸完成時のみ提示） |
| `ankan` | 暗槓 |
| `kakan` | 加槓 |
| `kyushu_kyuhai` | 九種九牌（1巡目のみ） |

### 他家打牌後
| action | 説明 |
|---|---|
| `ron` | ロン和了 |
| `pon` | ポン |
| `daiminkan` | 大明槓 |
| `chi` | チー（上家のみ） |
| `pass` | スキップ |

違反アクションは強制ツモ切り/強制パスに置換し violation ログを記録。

**【実装ステータス】** ✅ 全アクション実装済み: `src/engine/engine.ts`, `src/engine/legal.ts`

---

## 6. 観測（Observation）

`getObservation(seat)` で生成。「そのプレイヤーが見えるもの」のみ:

- 自分の手牌・副露・点数・リーチ状態
- 全員の河・副露・点数・リーチ状態
- ドラ表示牌・場風・自風・本場・供託・残り牌数

**渡さないもの**: 他家の手牌、山の中身、裏ドラ表示牌。

**【実装ステータス】** ✅ 完了: `src/engine/engine.ts: getObservation()`

---

## 7. ターンフロー

```
[配牌] → [draw] → [discard] → [call: 鳴き宣言受付]
             ↑                        ↓
             └── 鳴きなし: 次家へ ──────┘
                  鳴きあり: 鳴いた人の discard へ
```

同時宣言の優先度: **ロン > ポン/カン > チー**

**【実装ステータス】** ✅ 完了: `src/engine/engine.ts`

---

## 8. 役判定・点数計算

`riichi-rs-node`（Rust → WASM）を採用。`ScoreCalculator` インタフェースでラップ。

```ts
interface ScoreCalculator {
  calculateAgari(input: AgariInput): AgariResult;
  calculateShanten(closedTiles: Tile[], openMelds: Meld[]): number;
  riichiCandidates(hand14: Tile[], openMelds: Meld[]): Array<{ discard: Tile; waits: Tile[] }>;
  waitTiles(hand13: Tile[], openMelds: Meld[]): Tile[];
}
```

**重要な実装注意**: `riichiCandidates` では `hairi.now === 0` のチェックが必須。
`riichi-rs-node` の `hairi.waits_after_discard` はシャンテン数に関係なく常に値を返すため、
チェックなしでは非テンパイ手にもリーチ候補が生成されてしまう（修正済み: `src/score/calculator.ts`）。

**【実装ステータス】** ✅ 完了: `src/score/calculator.ts`（`RiichiRsCalculator`）, `src/score/payout.ts`, `src/score/standings.ts`

---

## 9. 半荘進行

`HanchanEngine` が複数の `GameEngine` を束ねて半荘を管理。

- `advanceKyoku()`: スコア更新 → 飛び判定 → 最終局判定 → 連荘/親流れ
- 飛び終了・最終局終了どちらでも残留リーチ棒をトップ者へ配布（両パス必須）
- `standings()`: オカ・ウマ込みの最終順位を返す

**【実装ステータス】** ✅ 完了: `src/engine/hanchan.ts`, `src/score/standings.ts`

---

## 10. 対局ログ

```ts
type GameLog = {
  version: string;
  rngSeed: number;
  kyoku: Array<{ events: GameEvent[] }>;
  standings: FinalStanding[];
};
```

- `exportLog(hanchan)` / `serializeLog()` / `deserializeLog()`: `src/log/log.ts`
- `replayKyoku(events, calculator)`: イベント列からエンジン状態を再構築: `src/log/replay.ts`
- **match ハーネスからのログ書き出しは Phase 5 で接続予定**（`src/cli/match.ts` → JSON ファイル保存）

**【実装ステータス】** ✅ ログ型・シリアライズ・リプレイ関数は完了。match との接続は未実施。

---

## 11. LLM エージェント（Ollama）

- `Player` インタフェース: `src/agent/player.ts`
- `OllamaAgent`: `src/agent/llm/ollama.ts`
  - Ollama `/api/chat` エンドポイントを使用
  - `think: false` でqwen3系のthinkingモードを抑制
  - 英語システムプロンプト（gemma系モデルとの互換性）
  - タイムアウト 120s、fallback: tsumo/ron優先 → 最初の打牌 → acts[0]
- `buildPrompt()`: `src/agent/llm/format.ts`（日本語プロンプト生成）
- `pnpm match`: 4エージェント半荘対局ハーネス: `src/cli/match.ts`

### デフォルトモデル構成
```
seat0: gemma4:e2b
seat1: gemma4:e2b
seat2: gemma3:4b-it-qat
seat3: gemma3:4b-it-qat
```

**【実装ステータス】** ✅ 完了: `src/agent/`, `src/cli/match.ts`

---

## 12. Web ビューア（Phase 5 — 未実装）

牌譜 JSON を読み込み、各ステップを視覚的に追えるブラウザ UI。

### 機能要件
- 牌譜 JSON ファイルの読み込み
- 全プレイヤーの手牌・河・副露・点数の表示
- ステップ送り（前へ/次へ）・局選択
- 各イベントの説明表示（誰が何をしたか）
- リーチ・ドラ・供託の視覚的な強調

### 実装方針
- Vite + React（TypeScript）
- `src/viewer/` 配下に新設
- 既存の `GameLog` / `GameEvent` 型を直接読み込み
- `pnpm viewer` でローカル起動

### 事前作業
- `match.ts` の実行後に JSON ログファイルを保存する機能の追加（`--log-file` オプション等）

---

## 13. モジュール構成

```
src/
  types/       ✅ Tile, Action, State, Yaku 等の型
  tiles/       ✅ 牌操作・整形・赤ドラ変換
  wall/        ✅ 山生成（seed + サイコロ）・ドラ・嶺上
  engine/      ✅ GameEngine（1局）+ HanchanEngine（半荘）
  score/       ✅ 翻・符・点数計算（riichi-rs-node ラッパ）
  agent/       ✅ Player インタフェース・OllamaAgent・ScriptedBot
  log/         ✅ GameLog 型・シリアライズ・replayKyoku
  cli/         ✅ play.ts（人間 CLI）・match.ts（LLM 対局ハーネス）
  viewer/      ⬜ Web ビューア（Phase 5）
```

---

## 14. 決定論的再現

- すべての山生成は `rngSeed: number` から決定
- 局ごとのシード: `(rngSeed + kyokuIndex * 7919) >>> 0`
- ログには seed と全アクションを保存 → 同じ seed + アクション列で完全再現
- `replayKyoku(events, calculator)` でエンジン状態を再構築可能

**【実装ステータス】** ✅ 完了

---

## 15. テスト

```
pnpm test       # Vitest 全テスト（現在 124 件）
pnpm cli        # 人間 CLI 対局
pnpm match      # LLM 4エージェント対局（Ollama 必要）
```

テストファイル:
- `src/tiles/tile.test.ts`
- `src/wall/wall.test.ts`
- `src/engine/engine.test.ts`
- `src/engine/engine-phase2a.test.ts`
- `src/engine/engine-phase2b.test.ts`
- `src/engine/engine-phase2c.test.ts`
- `src/engine/engine-phase3.test.ts`
- `src/score/score.test.ts`
