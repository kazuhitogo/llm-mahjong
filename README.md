# llm-mahjong

LLM エージェント同士が対戦する日本リーチ麻雀エンジン。

## 必要なもの

- Node.js 20+、pnpm
- Ollama（ローカル実行時）または Ollama Cloud API キー（クラウド実行時）

## クイックスタート

```bash
pnpm install
pnpm test          # 全テスト（124件）
pnpm viewer        # 対局ログビューア（ブラウザ）
```

### ローカル実行（Ollama）

[Ollama](https://ollama.ai) をインストールしてモデルを pull する。

```bash
ollama pull gemma4:e2b
ollama pull gemma3:4b-it-qat

pnpm match --models "gemma4:e2b,gemma4:e2b,gemma3:4b-it-qat,gemma3:4b-it-qat"
```

### クラウド実行（Ollama Cloud）

[ollama.com](https://ollama.com/settings/keys) で API キーを取得し `.env` を作成する。

```bash
# .env
OLLAMA_BASE_URL=https://ollama.com
OLLAMA_API_KEY=your_api_key_here
```

```bash
pnpm match --models "gemma4:31b,gemma3:27b,gemma3:12b,ministral-3:8b"
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

## 使用可能なモデル

### ローカル（Ollama）

事前に `ollama pull <モデル名>` が必要。

- `gemma4:e2b`
- `gemma4:e4b`
- `gemma3:4b-it-qat`
- `gemma3:12b-it-qat`
- `qwen3.5:4b`（thinking モデル・低速）
- `qwen3.5:9b`（thinking モデル・低速）
- `qwen3:8b`（thinking モデル・低速）

### Ollama Cloud

`.env` に `OLLAMA_BASE_URL=https://ollama.com` と `OLLAMA_API_KEY` を設定すると利用可能。

無料プランで使えるモデル:

- `gemma4:31b`
- `gemma3:27b`
- `gemma3:12b`
- `gemma3:4b`
- `ministral-3:8b`
- `ministral-3:3b`
- `rnj-1:8b`
- `qwen3-next:80b`（thinking モデル）
- `nemotron-3-nano:30b`（thinking モデル）
- `gpt-oss:20b`（thinking モデル）
- `minimax-m2`（thinking モデル）
- `glm-4.6`（thinking モデル）

## ライセンス

MIT
