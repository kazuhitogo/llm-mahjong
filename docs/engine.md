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
| `riichi` | 未リーチ, score≥1000, テンパイになる牌がある |
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
リーチ宣言でテンパイにならない牌を指定した場合も violation 扱い。

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

## フリテン

- `isSelfDiscardFuriten`: 過去の捨て牌に待ち牌が含まれる
- `applyPassFuriten`: ロンパス時 → `isFuriten = true`（リーチ後は永続）
- `resetSameTurnFuriten`: 自分のツモ時に同巡フリテンをリセット

実装: `src/engine/furiten.ts`

---

## GameLog（対局ログ）

```ts
type GameLog = {
  version: string;
  rngSeed: number;
  kyoku: Array<{ kyokuIndex: number; events: GameEvent[] }>;
  standings: FinalStanding[];
};
```

`exportLog(hanchan)` → `serializeLog()` → JSON  
`deserializeLog(json)` → `replayKyoku(events, calculator)`

主な `GameEvent.kind`: `init` / `dice` / `deal` / `dora` / `draw` / `rinshan` / `action` / `riichi` / `meld` / `agari` / `ryukyoku` / `violation` / `think`。
`dora` イベント（`{ kind:'dora'; tile }`）は配牌時の初期ドラと、カンごとのカンドラ公開時に発行。`replayKyoku` は無視（エンジンが内部で再導出するため）。

実装: `src/log/log.ts`, `src/log/replay.ts`
