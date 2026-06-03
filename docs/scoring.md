# スコア計算・点数授受・半荘進行

## ScoreCalculator インタフェース

```ts
interface ScoreCalculator {
  calculateAgari(input: AgariInput): AgariResult;
  calculateShanten(closedTiles: Tile[], openMelds: Meld[]): number;
  riichiCandidates(hand14: Tile[], openMelds: Meld[]): Array<{ discard: Tile; waits: Tile[] }>;
  waitTiles(hand13: Tile[], openMelds: Meld[]): Tile[];
}
```

実装: `RiichiRsCalculator`（`riichi-rs-node` Rust ライブラリラッパ） → `src/score/calculator.ts`

**注意**: `riichiCandidates` は `hairi.now === 0`（テンパイ）チェックが必須。
`riichi-rs-node` は非テンパイ手でも `waits_after_discard` を返すため、チェックなしでは誤候補を生成する。

---

## AgariResult

```ts
interface AgariResult {
  isAgari: boolean;
  han: number;
  fu: number;
  score: number;          // 総支払額（ロン: 放銃者の支払い、ツモ: 点数合計）
  outgoingScore: [number, number]; // [親支払額 or 全員均等額, 子支払額]
  yakuman: number;
  yaku: Record<number, number>;   // yaku ID → han
}
```

---

## 点数計算関数（src/score/payout.ts）

- `computeRonPayout(winner, loser, result, honba, riichiSticks)` → ロン
- `computeTsumoPayout(winner, dealerSeat, result, honba, riichiSticks)` → ツモ
- `computeNagashiManganPayout(winner, dealerSeat)` → 流し満貫（本場・供託なし）
- `computePaoRonPayout / computePaoTsumoPayout` → 包（責任払い）
- `computeNotenPayout(tenpaiSeats)` → 流局時ノーテン罰符（総額 3000 点）
- `riichiSticksWinner(winners, loser)` → ダブロン時の供託取得者（放銃者の下家優先）

---

## 半荘進行（HanchanEngine）

`src/engine/hanchan.ts`

```
new HanchanEngine({ rngSeed, calculator, rules? })
  → _engine (GameEngine)
  → advanceKyoku(): スコア更新 → 飛び判定 → 最終局判定 → 連荘/親流れ
  → standings(): FinalStanding[]（オカ・ウマ込み）
```

### 連荘判定

- agari イベントが 1 つ以上: **agari.winner の中に dealerSeat が含まれれば**連荘
  （`events.some(e => e.kind==='agari' && e.winner===dealerSeat)`）
  ← ダブロン対応のため `lastAgari.winner` だけを見るのは誤り
- 荒牌流局: 親テンパイなら連荘
- 途中流局: 常に連荘

### 局シード生成

```ts
const seed = (rngSeed + kyokuIndex * 7919) >>> 0;
```

### 終局条件

- 飛び（score < 0）→ 即終了、残留リーチ棒をトップへ
- 西場中に誰かが returnPoints（30,000）以上 → 即終了、残留リーチ棒をトップへ
- 最終局（半荘: 南4局 or 西4局、東風: 東4局）終了 → 残留リーチ棒をトップへ

### 西入り（`RuleConfig.nishiiri: true`）

南4局終了時に全員が `returnPoints` 未満の場合、西場（西1〜西4局）へ突入する。

- 各局終了後: 誰かが `returnPoints` 以上 → 終了
- 西4局終了 → 強制終了
- 連荘・本場・供託は通常どおり引き継ぐ
- 無効にするには `nishiiri: false` を `HanchanEngine` の `rules` に渡す

---

## FinalStanding（順位計算）

`src/score/standings.ts`

```ts
interface FinalStanding {
  seat: Seat;
  rank: 1 | 2 | 3 | 4;
  rawScore: number;    // 終局時の素点
  finalScore: number;  // (rawScore - returnPoints) / 1000 + uma[rank-1] + oka(1位のみ)
}
```
