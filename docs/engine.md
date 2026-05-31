# エンジン設計（状態・フロー・アクション）

## GameState 主要フィールド

```ts
interface GameState {
  config: RuleConfig;
  round: { wind: 'E'|'S'; kyoku: 1|2|3|4; honba: number; riichiSticks: number };
  dealerSeat: Seat;
  turn: { seat: Seat; phase: GamePhase; junme: number };
  wall: WallState;
  players: [PlayerState, PlayerState, PlayerState, PlayerState];
  pendingCalls: PendingCall[];
  chiKuikaeKinds: number[];  // チー後の打牌禁止 TileKind 値
  history: GameEvent[];
  rngSeed: number;
}

interface PlayerState {
  seat: Seat;
  hand: Tile[];      // ソート済み 13 or 14 枚
  melds: Meld[];
  discards: DiscardEntry[];
  score: number;
  riichi: { declared: boolean; junme: number; isDouble: boolean; ippatsu: boolean } | null;
  isFuriten: boolean;
  paoSeat: Seat | null;
}
```

`GamePhase`: `'draw' | 'discard' | 'call' | 'end'`

実装: `src/types/state.ts`, `src/engine/engine.ts`

---

## ターンフロー

```
[draw] → step() でツモ → [discard]
   ↓ applyAction(discard/riichi/tsumo/ankan/kakan/kyushu_kyuhai)
[call] ← 他家の鳴き宣言受付（calc あり時のみ）
   ↓ 全員 responded → resolveCallPhase()
   ├─ ロン → doRon() → [end]
   ├─ ポン/カン → [discard]
   ├─ チー → [discard]
   └─ 全員パス → advanceToNextDraw() → [draw]
```

同時宣言の優先度: **ロン > ポン/大明槓 > チー**

---

## アクション API（legalActions）

### ツモ番（discard phase, 自席）

| action | 条件 |
|---|---|
| `discard` | 常に（手牌の枚数が合法） |
| `riichi` | 未リーチ, **門前**（ankan のみ許容）, score≥1000, テンパイになる牌がある |
| `tsumo` | 和了形（calc あり） |
| `ankan` | 手牌に同種4枚（リーチ中不可） |
| `kakan` | ポン副露あり + 手牌に同種1枚（リーチ中不可） |
| `kyushu_kyuhai` | 1巡目, 手牌にヤオチュー牌9種以上 |

### 他家打牌後（call phase）

| action | 条件 |
|---|---|
| `ron` | 和了形, フリテンなし |
| `pon` | 手牌に同種2枚以上 |
| `daiminkan` | 手牌に同種3枚 |
| `chi` | 上家打牌, 手牌で順子完成可能 |
| `pass` | 常に |

**違反アクション**: 強制ツモ切り（discard の最後の牌）に置換し `violation` イベントを記録。
リーチ宣言でテンパイにならない牌・門前でない手からのリーチ宣言も violation 扱い。

実装: `src/engine/legal.ts`, `src/engine/engine.ts`

---

## Observation（getObservation）

エージェントに渡す観測情報。「見えるもの」のみ。

```ts
interface Observation {
  seat, phase, currentTurn, junme, remainingDraws, round, dealerSeat, dice,
  doraIndicators,
  myHand, myMelds, myScore, myRiichi, myFuriten, pendingCalls,
  players: [{ seat, melds, discards, score, riichi }, ...]  // 全員分
}
```

渡さないもの: 他家の手牌、山の中身、裏ドラ。

---

## プロンプト構成（buildPrompt）

`buildPrompt()` が生成するプロンプトは以下の順で構成する（`src/agent/llm/format.ts`）。

1. **ゴール**: 半荘終了時に順位ウマ込みの最終スコアで1位を取ることが目標、と明示。
2. **現在の場況**: 局/本場/巡目・場風・親/自席・さいの目・山残り・供託・ドラ表示牌、および得点と順位（点数降順、自分の順位とトップ差を併記）。
3. **あなたの手牌**: 手牌・副露・門前/リーチ・フリテン。
4. **進行（時系列）**: 全員の打牌を **巡目→打牌順（親起家からの席順）に統合** して列挙。プレイヤー毎ではなく時系列で並べ、各プレイヤーの行動の前後関係を保つ。鳴かれた牌は `→○家ポン` 等で注記。
5. **各家の副露**: 時系列上は位置が曖昧なため静的に明示。
6. **合法手**: 番号付きリスト。
7. **回答手順**: 観点（シャンテン/待ち/他家危険度/順位・トップ差）を先に考えるよう促し、**REASON → ACTION** の順で出力させる（CoT のため思考を先に生成）。

```
REASON: <分析と選んだ行動の理由>
ACTION: <番号>
```

モデルが Tool Use をサポートする場合は `select_action` ツールを使用（パラメータ: `reasoning`, `action_number` の順）。
Tool Use 非対応の場合は上記テキスト形式にフォールバックし、`_parseCot()` でパース。

出力例（one-shot）はモデルがその文面に引きずられるため**意図的に入れていない**。

---

## フリテン

- `isSelfDiscardFuriten`: 過去の捨て牌に待ち牌が含まれる
- `applyPassFuriten`: ロンパス時 → `isFuriten = true`（リーチ後は永続）
- `resetSameTurnFuriten`: 自分のツモ時に同巡フリテンをリセット

実装: `src/engine/furiten.ts`

---

## GameLog（対局ログ）

```ts
interface GameLog {
  version: 1;
  rngSeed: number;
  models?: [string, string, string, string]; // seat 順モデル名（pnpm match が記録）
  kyoku: Array<{ kyokuIndex: number; events: GameEvent[] }>;
  standings: FinalStanding[];
}
```

`exportLog(hanchan, models?)` → `serializeLog()` → JSON  
`deserializeLog(json)` → `replayKyoku(events, calculator)`

主な `GameEvent.kind`: `init` / `dice` / `deal` / `dora` / `draw` / `rinshan` / `action` / `riichi` / `meld` / `agari` / `ryukyoku` / `violation` / `think`。
`dora` イベント（`{ kind:'dora'; tile }`）は配牌時の初期ドラと、カンごとのカンドラ公開時に発行。`replayKyoku` は無視（エンジンが内部で再導出するため）。

`think` イベント（`{ kind:'think'; seat; reasoning; prompt?; model?; inputTokens?; outputTokens?; chosenAction? }`）は LLM 推論ごとに記録。`model` はエージェント名、`inputTokens`/`outputTokens` は Ollama レスポンスの `prompt_eval_count`/`eval_count`、`chosenAction` は LLM が選択した Action オブジェクト（viewer の「選択行動」欄に表示）。

実装: `src/log/log.ts`, `src/log/replay.ts`
