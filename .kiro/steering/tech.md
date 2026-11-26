---
inclusion: always
---

# 技術方針

## 言語・応答

- ユーザーへの説明・質問は日本語で行う。コード中のコメントは日本語でも英語でもよい
- TypeScript を全体で使う(strict モード)

## 構成

| 役割 | ローカル開発 | AWS 本番 |
|---|---|---|
| 画面(スマホ向け Web) | Vite + React | S3 + CloudFront |
| リアルタイム同期 | Node.js の `ws` サーバー | API Gateway WebSocket API + Lambda |
| 部屋・接続の保存 | メモリ上 | DynamoDB(TTL で自動削除) |
| AI 司会者 | 固定の仮コメント(モック) | Amazon Bedrock(Converse API、画像入力) |
| インフラ定義 | — | AWS CDK(TypeScript) |

## 重要なルール

- **ローカルサーバーと Lambda は同じロジックを使う**。部屋の処理・メッセージの処理は `packages/core` に置き、
  ローカルサーバーと Lambda はそれを呼ぶだけの薄い層にする。保存先は interface で差し替える(メモリ / DynamoDB)
- AI の呼び出しも interface で差し替える(モック / Bedrock)。環境変数 `AI_MODE=mock|bedrock`
- WebSocket のメッセージは `packages/core` に型として定義し、画面とサーバーで共有する
- 位置は geohash 6文字(約1.2km×0.6km)に丸めて送る。検索は「自分のマス + 周囲8マス」。
  一覧は近い順(同じマスを先)に並べる。正確な緯度経度はサーバーに送らない
- 同じ接続元 IP の部屋は一覧で上に出す(補助的な手がかり。IP は保存しない、またはハッシュ化する)
- 絵は PNG(縮小して 512px 以下)で送る。WebSocket の1メッセージは 32KB 制限があるため、
  大きい画像は S3 の署名付き URL でアップロードしてキーだけ送る
- Bedrock は**1筆ごとに呼ばない**。「送信したとき」または「部屋全体で最短20秒に1回」に限る
- AI の出力は短く(日本語40文字程度、やさしい言葉)。不適切な絵には反応せず、穏やかに話題を変える

## 命名規約(AWS リソース)

- アプリのスタック名は `DoodleNearby*` で始める(例: `DoodleNearbyWebStack`)
- Web 用 S3 バケット名は `doodle-nearby-web-*` で始める(`infra/lib/constants.ts` の `WEB_BUCKET_PREFIX`)
- `WebBucketName` / `WebDistributionId` を出力するスタックは `DoodleNearbyWebStack` という名前にする(`cd.yml` がこの名前で出力を読むため)
- スタック出力名は `WebBucketName` / `WebDistributionId`。WebSocket API を作る場合は `WebSocketUrl` も出力する

## AWS の制約

- すべてのリソースはプロジェクトの選択 Region に作る(`aws-starter-rules.md` に従う)
- Bedrock のモデルは選択 Region で使えるものを選ぶ。モデル ID は環境変数で差し替えられるようにする
- 秘密情報をコードに書かない
