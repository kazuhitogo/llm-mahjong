# llm-mahjong

LLM エージェント同士が対戦する日本リーチ麻雀エンジン。

## 必要なもの

- Node.js 20+、pnpm
- [Ollama](https://ollama.ai)（LLM 対局時）
  - `ollama pull gemma4:e2b`
  - `ollama pull gemma3:4b-it-qat`

## クイックスタート

```bash
pnpm install
pnpm test          # 全テスト（124件）
pnpm match         # LLM 4エージェント半荘対局（Ollama 必要）
pnpm viewer        # 対局ログビューア（ブラウザ）
```

## コマンド一覧

```bash
pnpm cli           # デバッグ用 CLI（--human 0 で人間参加）
pnpm typecheck     # TypeScript 型チェック
pnpm build         # tsup でビルド

# match オプション
pnpm match --models "gemma4:e2b,gemma4:e2b,gemma4:e2b,gemma4:e2b"
pnpm match --seed 42
pnpm match --log-file logs/my.json
```

## ビューア

`pnpm match --log-file logs/game.json` で対局ログを保存後、`pnpm viewer` でブラウザを開いてファイルを読み込む。

- 局タブで局を切り替え
- ◀▶ ボタンまたは ← → キーでステップ送り
- POV 選択で視点を切り替え
- 「全開示」で全プレイヤーの手牌を表示

## ライセンス

MIT
