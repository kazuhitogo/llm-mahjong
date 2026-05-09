# LLM Mahjong — 仕様ドラフト v0.3

日本リーチ麻雀のコアエンジン。TypeScript / Node.js。
プレイヤー（人間でも LLM でも）はツール呼び出し相当の API で打牌・鳴き・和了を宣言する。
**v1 は LLM 連携を含めず、人間が API/CLI から各プレイヤーを操作できる状態をゴールとする。**

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
- LLM エージェント向けの **Tool スキーマ定義**
- 対局ログ（後から再現可能な決定論的フォーマット）

含まないもの（v1 では）:
- Web UI / 可視化（後で別レイヤとして追加できるよう疎結合に）
- 強化学習・教師あり学習
- ネットワーク対戦サーバ

---

## 2. ルール詳細 **[決定：天鳳鳳凰卓ルール準拠]**

| 項目 | 値 | 備考 |
|---|---|---|
| 局数 | **半荘戦（東1〜南4 + 西入なし）** | 東風戦は `RuleConfig.gameLength: 'tonpu'` で切替 |
| 持ち点 / 返し | **25,000 持ち / 30,000 返し** | オカ +20 |
| ウマ | **5 - 10** | 4位 -10, 3位 -5, 2位 +5, 1位 +10 |
| 赤ドラ | **あり**（5m/5p/5s 各1枚 = 計3枚） | 鳳凰卓基準 |
| 喰い断 | あり | |
| 後付け | あり | |
| 一発・裏ドラ | あり | リーチ時のみ |
| 流し満貫 | **あり** | 親聴牌で連荘 |
| 二翻縛り | **なし** | 常に 1 翻縛り |
| 包（責任払い） | 大三元・大四喜・四槓子 | |
| ダブロン | あり（頭ハネなし） | |
| 途中流局 | **九種九牌・四風連打・四家立直・四開槓・三家和** | 5 種すべて有効 |
| 喰い替え | 禁止 | |
| 飛び終了 | あり（0 点未満） | |
| 連荘条件 | 親の聴牌または和了 | |

→ これらは `RuleConfig` で切り替え可能。デフォルトは上記の天鳳鳳凰卓ルール。

**【実装ステータス】** ✅ 型・デフォルト値定義済み: `src/types/state.ts`（`RuleConfig`, `DEFAULT_RULES`）。
ルールに依存する挙動（流し満貫・包・喰い断）は Phase 2 以降で個別実装。

---

## 3. 牌の表現

文字列ベースの軽量表現を採用:

```
1m〜9m  : 萬子
1p〜9p  : 筒子
1s〜9s  : 索子
1z〜7z  : 字牌（東=1z, 南=2z, 西=3z, 北=4z, 白=5z, 發=6z, 中=7z）
0m/0p/0s: 赤ドラ（赤5）
```

- 内部では `type Tile = string` の brand 型 + `TileId`（0〜135 の通し番号）の二段構え
- `TileId` は壁山生成・配牌の決定論的再現に使用
- 並べ替えユーティリティ、シャンテン数計算、有効牌列挙などはここに集約

**【実装ステータス】** ✅ 完了: `src/types/tile.ts`, `src/tiles/tile.ts`（型定義・変換・ソート・ドラ表示計算・赤ドラ判定）。
シャンテン数・有効牌列挙は Phase 2a で `riichi-rs-node` 統合時に追加。

---

## 3.5 山積み・サイコロ・配牌

実麻雀の物理的な「積み」を再現するため、山構造は以下の固定された情報で表現される（`src/types/state.ts: WallState`）:

```ts
interface WallState {
  layout: readonly TileId[];      // 物理 136 牌（席ごとに 34 牌、4 席分）、構築時に固定
  dice: readonly [number, number]; // 親が振った 2 つのサイコロ
  breakIndex: number;              // 開門位置（layout 上の絶対インデックス）
  drawnCount: number;              // 配牌＋ツモで消費した枚数（初期値 52）
  doraIndicatorCount: number;      // 公開済みドラ表示牌の枚数（最大 5）
}
```

### 積み（layout）

- `dealWall(seed, dealerSeat)` で 136 牌を Mulberry32（seed）でシャッフルして `layout` に格納
- 以後 `layout` は不変。**ツモ順は構築時点で完全に確定**
- `layout[0..33]` = 親席の壁、`[34..67]` = 下家、`[68..101]` = 対面、`[102..135]` = 上家

### サイコロ

- 親が 2 個振る（同じ Mulberry32 から `nextInt(6)+1` を 2 回引く）
- 出目の合計 N (2〜12) から開門席と開門位置を計算:
  - `breakSeat = (dealerSeat + (N - 1) % 4) % 4`（親=1, 下家=2, 対面=3, 上家=4, 親=5, …）
  - 当該壁の右端から N スタック目（= 2N 牌目）が開門位置
  - `breakIndex = breakSeat * 34 + 2N`（mod 136）

### ツモ順

- N 番目のツモ牌 = `layout[(breakIndex + N) % 136]`
- 配牌完了時点で `drawnCount = 52`、最初のツモは `drawnCount = 52` の牌
- `drawnCount = 122` で荒牌流局（残りツモ可能枚数 = `122 - drawnCount`）

### 王牌（14 牌）

- 開門位置の手前 14 牌、`deadWall[i] = layout[(breakIndex + 122 + i) % 136]`
- `deadWall[0..3]` = 嶺上牌（カン補充、`3→2→1→0` の順に使用）
- `deadWall[4]` = 初期ドラ表示
- `deadWall[5]` = 裏ドラ表示 1
- `deadWall[6,8,10,12]` = ドラ表示 2〜5（カンごとにめくる）
- `deadWall[7,9,11,13]` = 裏ドラ表示 2〜5

### 配牌

- 開門位置から `layout` を順に取り、親→下家→対面→上家 に 4 枚ずつ × 3 巡 = 48 枚
- その後各家に 1 枚ずつ = 4 枚、計 52 枚配って各家 13 枚
- 親は最初のツモで 14 枚に揃える（chonchon は実装上不採用）

### 決定論性

- 同じ `(seed, dealerSeat)` から完全に同じ layout・dice・breakIndex が再現される
- イベントログには `dice` イベント（`{kind:'dice', dice, breakSeat, breakIndex}`）が記録される

**【実装ステータス】** ✅ 完了: `src/wall/wall.ts`, `src/wall/rng.ts`, `src/wall/wall.test.ts`。

---

## 4. 状態モデル

```ts
type GameState = {
  config: RuleConfig;
  round: { wind: 'E' | 'S'; kyoku: 1|2|3|4; honba: number; riichiSticks: number };
  dealerSeat: 0|1|2|3;
  turn: { seat: 0|1|2|3; phase: 'draw' | 'discard' | 'call' | 'agari' | 'ryukyoku' };
  wall: WallState;
  players: [PlayerState, PlayerState, PlayerState, PlayerState];
  pendingCalls: PendingCall[];   // ロン/ポン/カン/チーの宣言待ち
  history: GameEvent[];
  rngSeed: number;
};

type PlayerState = {
  seat: 0|1|2|3;
  seatWind: 'E'|'S'|'W'|'N';
  hand: Tile[];                  // 手牌（13 or 14 枚）
  melds: Meld[];                 // 副露
  discards: Discard[];           // 河（リーチ宣言牌・鳴かれフラグつき）
  score: number;
  riichi: { declared: boolean; ippatsu: boolean; junme: number } | null;
  isFuriten: boolean;
};

// WallState の詳細は §3.5 参照
type WallState = {
  layout: readonly TileId[];
  dice: readonly [number, number];
  breakIndex: number;
  drawnCount: number;
  doraIndicatorCount: number;
};
```

**【実装ステータス】** ✅ 状態モデル定義: `src/types/state.ts`。
`riichi`・`isFuriten` フィールドは型として用意済み、ロジックは Phase 2a で実装。

---

## 5. エージェント Tool API

エンジンが各エージェントのターンに `getLegalActions(seat)` で合法手を返す。
エージェントはその中から 1 つ tool call で選ぶ。

### ターン中（自分のツモ番）に呼べるツール

| tool | 引数 | 説明 |
|---|---|---|
| `discard` | `{ tile: Tile, tsumogiri: boolean }` | 打牌 |
| `riichi` | `{ tile: Tile }` | 立直宣言＋打牌 |
| `tsumo` | `{}` | ツモ和了 |
| `ankan` | `{ tile: Tile }` | 暗槓 |
| `kakan` | `{ tile: Tile }` | 加槓 |
| `kyushu_kyuhai` | `{}` | 九種九牌で流局宣言（1 巡目のみ） |

### 他家の打牌に対して呼べるツール

| tool | 引数 | 説明 |
|---|---|---|
| `ron` | `{}` | ロン和了 |
| `pon` | `{ tiles: [Tile, Tile] }` | ポン |
| `daiminkan` | `{}` | 大明槓 |
| `chi` | `{ tiles: [Tile, Tile] }` | チー（上家のみ） |
| `pass` | `{}` | スキップ |

エンジンは各 tool 呼び出しで:
1. 合法性を再検証
2. **[決定]** 違反時は **強制ツモ切り**（自分の番）/ **強制パス**（鳴き宣言時）として処理し、ログにバイオレーション記録を残す
3. 合法ならイベント発火 → 状態遷移

**【実装ステータス】**
- ✅ 型定義（全アクション）: `src/types/action.ts`
- ✅ `discard` / `pass` の実装: `src/engine/legal.ts`
- ✅ 違反時の強制ツモ切り: `fallbackAction()` + violation ログ
- ⬜ `riichi` `tsumo` `ron` `pon` `chi` `kan` `kyushu_kyuhai` は Phase 2 で実装

---

## 6. 観測（Observation）

LLM に渡す情報は厳密に「そのプレイヤーが見えるもの」だけに絞る:

- 自分の手牌・副露・点数・リーチ状態
- 全員の河・副露・点数・リーチ状態
- ドラ表示牌・場風・自風・本場・供託・残り牌数
- 直前のイベント（誰が何を打った/鳴いた/和了した）

**渡さないもの**: 他家の手牌、山の中身、裏ドラ表示牌、未公開の王牌。

→ `getObservation(seat): Observation` という関数で生成。
→ **[決定]** v1 では JSON 形式で返す。LLM 連携時に自然言語整形を別レイヤで追加。
→ **[決定]** 思考過程（reasoning）の記録は **オプショナル** 。Tool call の引数に `reason?: string` を入れておき、入れたければ入れる方針。

**【実装ステータス】** ✅ 完了: `src/engine/engine.ts: getObservation()`。
サイコロ・ドラ表示牌・全員の河と副露・点数・リーチ状態を JSON で返す。
他家の手牌・山の中身・裏ドラは含めない。

---

## 7. ターンフロー（状態遷移）

```
[配牌] → [ツモ phase] → [打牌 phase] → [他家の鳴き宣言受付 phase]
                ↑                              ↓
                └── 鳴きなし: 次家へ ──────────┘
                         鳴きあり: 鳴いた人の打牌 phase へ

各 phase 終了時に和了/流局チェック
```

- **[決定]** エージェント間進行は **同期・イベント駆動**。Engine がステートマシンとして進行し、該当エージェントに `await onTurn(observation, legalActions)` で問い合わせ
- 同時宣言の優先度: **ロン > ポン/カン > チー**
- ダブロンは下家側から順に処理
- 嶺上開花・搶槓・海底・河底などは phase で識別

**【実装ステータス】**
- ✅ `deal → draw → discard → 次家` のループ: `src/engine/engine.ts`
- ✅ 荒牌流局: 山切れで `phase=ryukyoku` → `end`
- ⬜ `call` phase（鳴き宣言受付）は Phase 2b
- ⬜ `agari` phase は Phase 2a
- ⬜ 優先度解決・ダブロンは Phase 2b

---

## 8. 役判定・点数計算

### TypeScript/JavaScript 製ライブラリの現状（2026 年 5 月時点で調査）

| ライブラリ | 提供 | 状態 | 備考 |
|---|---|---|---|
| **riichi-rs-node** / **riichi-rs-bundlers** | Rust → WASM (MahjongPantheon) | 現役 | `riichi-ts` の後継。シャンテン・役・点数すべて。型定義あり |
| **riichi** (npm, takayama-lily) | 純 JS | 安定（古い） | `new Riichi(hand).calc()` の単純 API。プロトタイプ向け |
| **riichi-ts** | 純 TS (MahjongPantheon) | **非推奨**（riichi-rs に移行） | 参考実装として価値あり |
| **riichi-core** | npm | 古い | エンジン部分も含むが更新停止 |
| **MahjongRepository/mahjong** | Python | 現役・デファクト | TS では使えないが、テスト用の正解出力を生成するのに便利 |

### 方針 **[決定（C 案ベース）]**

- **シャンテン数 / 和了形分解 / 役判定 / 点数計算** は **`riichi-rs-node`** を v1 で採用
  - Rust 実装で速く、テスト済み、TS 型あり
  - 出力が標準的な日本麻雀ルールに沿っている
- **エンジン本体（状態機械・進行制御・合法手列挙・観測生成）は自作**
  - ここがプロジェクトの本体
- 将来カスタムルール（赤ドラ枚数違いなど）が必要になったら役・点数部だけ差し替えられるようインタフェースで抽象化する:

```ts
interface ScoreCalculator {
  calculateAgari(hand: AgariInput): AgariResult;   // 役・翻・符・点数
  calculateShanten(tiles: Tile[]): number;
  effectiveTiles(hand: Tile[]): Tile[];            // 有効牌
}
```

→ 実装は `RiichiRsCalculator` クラスを `riichi-rs-node` のラッパとして用意。

**【実装ステータス】** ⬜ 未着手（Phase 2a）。`src/score/` 配下に新設予定。

---

## 9. モジュール構成

```
src/
  types/         ✅ Tile, Action, State, Yaku 等の型
  tiles/         ✅ 牌操作・整形・赤ドラ変換
  wall/          ✅ 山生成（seed + サイコロ）・ドラ・嶺上
  engine/        ✅ 状態機械（GameEngine クラス）
  cli/           ✅ 動作確認 CLI（Phase 1 用）
  score/         ⬜ 翻・符・点数計算（Phase 2a で riichi-rs-node ラッパ）
  agent/         ⬜ Player インタフェース、LLM 統合（Phase 4）
  log/           ⬜ イベントログのリプレイ機能（Phase 3）
```

---

## 10. 決定論的再現

- すべての山生成は `rngSeed: number` から決定
- ログには seed と全アクションを保存 → 同じ seed + 同じアクション列で完全再現
- LLM の出力は揺れるので、**ログには「何を選んだか」だけ**を残す（思考は別フィールド任意）

**【実装ステータス】** ✅ Phase 1 範囲では完了:
- Mulberry32 で seed → layout シャッフル + サイコロを完全に決定論的に再現
- 同じ seed + 同じアクション列で `engine.events()` の JSON が一致することをテスト済み
- リプレイ機能（ログ → エンジン状態の再構築）は Phase 3 で追加

---

## 11. テスト戦略

- 役判定: 既知の和了形に対する単体テスト（数百ケース）
- 点数計算: 公式点数表とのつき合わせ
- ターンフロー: シナリオベースのインテグレーションテスト
- 合法手列挙: ファジング（手牌をランダム生成して合法性を検証）

**【実装ステータス】**
- ✅ Vitest セットアップ: `vitest.config.ts`
- ✅ Phase 1 範囲のテスト: `src/tiles/tile.test.ts`, `src/wall/wall.test.ts`, `src/engine/engine.test.ts`（合計 32 件、サンドボックスでスモーク全パス）
- ⬜ 役判定・点数計算のテストは Phase 2a で追加

---

## 12. 実装フェーズ計画

### Phase 1 — エンジン MVP（LLM なし、人間が API を叩いて遊べる）
- [ ] 牌・山・手牌・河の型と操作
- [ ] 配牌・ツモ・打牌だけの単純フロー（鳴き・リーチ・和了なし）
- [ ] `riichi-rs-node` 統合 → 和了判定だけ動く
- [ ] CLI ハーネス：1 局を 4 人分のターミナルから手で進められる

### Phase 2 — 完全な 1 局
- [ ] 鳴き（ポン・チー・カン）と優先度解決
- [ ] リーチ・一発・フリテン
- [ ] 流局（荒牌 + 途中流局）
- [ ] 役・点数計算とスコア授受

### Phase 3 — 半荘進行
- [ ] 連荘・本場・供託
- [ ] 親流れ・終局判定
- [ ] 対局ログ（決定論的フォーマット）と再生機能

### Phase 4 — エージェントレイヤ
- [ ] Player インタフェースを 3 種類（HumanCli, ScriptedBot, LlmAgent）で実装
- [ ] LLM プロンプト用に Observation を JSON → 自然言語整形
- [ ] tool スキーマを Anthropic / OpenAI 両対応で定義

---

## 13. 残り未決事項

1. §2 ルール詳細テーブルのデフォルトでよいか（赤ドラ・喰い断・流し満貫など）
2. 半荘戦 vs 東風戦のデフォルト
3. パッケージ管理とビルド構成（pnpm? Vitest? tsup?）
4. ディレクトリ構成は §9 の提案でよいか
