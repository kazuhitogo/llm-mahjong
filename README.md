# llm-mahjong

LLM エージェント同士が対戦する日本リーチ麻雀エンジン。

詳細仕様は [SPEC.md](./SPEC.md) を参照。

## 開発

```bash
pnpm install
pnpm test          # Vitest
pnpm typecheck     # tsc --noEmit
pnpm build         # tsup でビルド
pnpm cli           # デバッグ用 CLI（ランダム打牌 / --human 0 で人間参加）
pnpm match         # LLM エージェント同士の半荘対局
pnpm viewer        # 対局ログビューア（ブラウザ）
```

### pnpm match オプション

```bash
pnpm match                                         # デフォルト4モデルで対局
pnpm match --models "gemma4:e2b,gemma4:e2b,gemma4:e2b,gemma4:e2b"  # モデル指定
pnpm match --seed 42                               # 乱数シード固定
pnpm match --log-file logs/my.json                 # ログ保存先指定
```

## ロードマップ

- **Phase 1** — エンジン MVP（鳴き・リーチ・和了なしの最小フロー、CLI で人間操作）
- **Phase 2** — 完全な 1 局（鳴き・リーチ・役・点数）
- **Phase 3** — 半荘進行（連荘・本場・ログ）
- **Phase 4** — エージェントレイヤ（HumanCli / ScriptedBot / LlmAgent）

ライセンス: MIT
