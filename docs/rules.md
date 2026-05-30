# ルール・牌表現・壁山構造

## 採用ルール（天鳳鳳凰卓準拠）

- 半荘戦（東1〜南4）、東風戦は `RuleConfig.gameLength: 'tonpu'` で切替
- 25,000 持ち / 30,000 返し、オカ +20、ウマ 5-10
- 赤ドラあり（5m/5p/5s 各1枚）
- 喰い断・後付けあり
- 一発・裏ドラあり
- 流し満貫あり（発動時はノーテン罰符なし）
- 包（責任払い）: 大三元・大四喜（大明槓/ポンで完成させた家）
- ダブロンあり（頭ハネなし）
- 途中流局: 九種九牌・四風連打・四家立直・四開槓・三家和
- 喰い替え禁止（チー後は鳴いた牌の種類を打牌不可）
- 飛び終了あり（0点未満）
- 連荘条件: 親の聴牌または和了（ダブロン時は和了者の**いずれか**が親なら連荘）
- 二翻縛りなし（常に1翻縛り）

`RuleConfig` / `DEFAULT_RULES` → `src/types/state.ts`

---

## 牌表現

```
1m〜9m  萬子   0m = 赤5m
1p〜9p  筒子   0p = 赤5p
1s〜9s  索子   0s = 赤5s
1z      東
2z      南
3z      西
4z      北
5z      白
6z      發
7z      中
```

型: `type Tile = string`（brand 型）+ `TileId`（0〜135 の通し番号）

`TileKind`（0〜33）:
- 0〜8  = 1m〜9m
- 9〜17 = 1p〜9p
- 18〜26 = 1s〜9s
- 27〜33 = 1z〜7z

赤ドラ (`0m/0p/0s`) は TileKind として 5m/5p/5s と同一（種類一致）。

実装: `src/tiles/tile.ts`

---

## 壁山構造（WallState）

```ts
interface WallState {
  layout: readonly TileId[];  // 136 牌の物理配置（シャッフル済み固定）
  dice: readonly [number, number];
  breakIndex: number;         // 開門位置
  drawnCount: number;         // 配牌 52 + ツモ済み枚数（122 で荒牌流局）
  doraIndicatorCount: number; // 公開済みドラ表示牌数（最大 5）
}
```

- `dealWall(seed, dealerSeat)` → Mulberry32 でシャッフル・サイコロ・配牌
- ツモ順: `layout[(breakIndex + drawnCount) % 136]`
- 王牌 14 牌: `deadWall[i] = layout[(breakIndex + 122 + i) % 136]`
  - `deadWall[0..3]` = 嶺上牌（3→2→1→0 の順に使用）
  - `deadWall[4]` = 初期ドラ表示、`deadWall[5]` = 裏ドラ表示 1、以降 +2 ずつ
- `remainingDraws = max(0, 122 - drawnCount)`（viewer の `snap.wallRemaining`）

実装: `src/wall/wall.ts`, `src/wall/rng.ts`
