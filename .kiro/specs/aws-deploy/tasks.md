# Implementation Plan: aws-deploy

## Overview

local-prototype の `RoomService` を、API Gateway WebSocket + Lambda + DynamoDB の上で動かし、画面を S3 + CloudFront で配って、審査員が使える公開 URL を作る。新しく書くのは、`DynamoDbRoomStore`、Lambda ハンドラー、CDK の3スタック、スモークテスト、英語の文書である。`packages/core`(`RoomService`、`RoomStore`、メッセージ型)、`apps/web`、`apps/local-server`、`.github/workflows/cd.yml`、`GithubOidcStack` は変えない(契約テストのスイート `runRoomStoreContract` は、S 側の `@doodle-nearby/core/testing` にすでにある。この Spec は使うだけで、作らず、core の `./testing` export や `coreAlias` も足さない。決定事項 4)。

CI(lint / typecheck / test / synth)は、各タスクの終わりに通る状態を保つ。Windows では `npm` を `npm.cmd` で呼ぶ。

### 前提

- **タスク 1(疎通の確認)は、ほかのタスクに依存しない最初のタスクである。** 通らなければ、決定事項 1 の代替案を所有者に相談するまで、タスク 5.3 と 7 に進まない。
- タスク 3.3、4.3、4.4、7 は、local-prototype の次のタスクが `main` に入っていることが前提である: 4.3〜4.11(`RoomStore`、`MemoryRoomStore`、(契約テストのスイート `runRoomStoreContract` は、4.4 として S 側にすでにある)、`RoomService`)、4.20、4.21(`MESSAGE_SPECS`、`orderRoomSummaries`)、グループ W(画面)。入っていなければ、そのタスクは保留にして、ほかのタスクを進める。
- AWS のリソースを作る・消すタスク(1.2、1.3、3.6、7.1)と、`git push`、`DEPLOY_ENABLED` の変更(7.3)は、実行の前に所有者に確認する。操作は ap-southeast-2 だけで行う。
- Lambda の同時実行の上限は 1,000 に引き上げ済みである。受け付ける量の上限は、ステージのスロットリング(20 req/秒、バースト 40)が決める。

### 決定事項の反映

- WebSocket は CloudFront の `/ws` 経由(同じオリジン)。ステージ名は `ws`(決定事項 1、設計判断 2)。
- `DynamoDbRoomStore` と `ConnectionStore` は `backend/lambdas` に置く(決定事項 2)。
- `ManageConnections` は `webSocketApi.grantManageConnections(handler)`。`cdk synth` で循環参照が出たら `*/ws/POST/@connections/*` に戻し、design の決定事項 9 に理由を書く(タスク 5.2)。
- ステージのスロットリングは 20 req/秒、バースト 40(リスク 9)。
- ping、CSP、Budgets、API Gateway のアクセスログ、予約同時実行は入れない(決定事項 3、5〜8)。
- Spec(requirements.md、design.md)を直したときは、その修正だけで別のコミットにする。

### 必須のテスト

| # | 必須のテスト | タスク | 満たす要件 |
|---|---|---|---|
| ① | 項目と値の変換のラウンドトリップ、TTL の範囲(プロパティテスト。Property 1、2) | 3.2 | 4.1、4.9、5.1、6.2 |
| ② | `DynamoDbRoomStore` の契約テスト + 50枚 × 約30KB の `listDrawings`(実際の DynamoDB。opt-in) | 3.5、3.6 | 4.2〜4.8、10.3 |
| ③ | ハンドラーの動作と一覧の宛先(Property 3) | 4.4 | 3.3〜3.9、5.3〜5.5、10.1 |
| ④ | CDK のアサーション(`Host` を転送しないことを含む) | 5.4 | 10.2、1.x、2.1、7.x、8.x、9.x |
| ⑤ | CI 条件での `synth`(Docker、認証情報、`dist` なし) | 5.5 | 7.5、7.6 |
| ⑥ | 公開 URL でのスモークテスト(手動) | 7.2 | 10.4 |

任意(`*`)にするのは、ハンドラーの Property 4〜6 のテスト(4.5)だけである。

## Tasks

- [x] 1. 【最初・ほかに依存しない】CloudFront 経由の WebSocket の疎通(空のハンドラー)
  - [x] 1.1 使い捨ての疎通用アプリを作る
    - 触るファイル(新規。**コミットしない**。1.3 で削除する): `infra/spike/spike-app.ts`、`infra/spike/check.ts`
    - スタック名は `SpikeWsStack`。**`DoodleNearby*` で始めない**(CD が `cdk deploy 'DoodleNearby*'` で拾わないように)。`infra/bin/infra.ts` には足さず、`--app "npx tsx spike/spike-app.ts"` で単独に実行する
    - 中身: ステージ `ws` の WebSocket API、3ルートを受ける Lambda(`lambda.Code.fromInline`、Node.js 22、arm64)、CloudFront 配信(既定 behavior は何でもよい、`/ws` は `HttpOrigin('<apiId>.execute-api.<region>.amazonaws.com')`、`HTTPS_ONLY`、`CACHING_DISABLED`、`ALL_VIEWER_EXCEPT_HOST_HEADER`、`ALLOW_GET_HEAD`)
    - Lambda の動作: `$connect` は 200。`$default` は、受けた本文をそのまま `postToConnection` で返す(宛先は `https://${requestContext.domainName}/${requestContext.stage}`)。あわせて、`domainName` と `Origin` ヘッダーを CloudWatch Logs に出す(ログに残るのは疎通の確認のためだけ)
    - `check.ts`: `ws` で `wss://<配信のドメイン>/ws` につなぎ、`hello` を送って、同じ本文が返ることを確かめる。直接の `wss://<apiId>.execute-api.<region>.amazonaws.com/ws` でも同じことを確かめる(診断用)。終了コードで成否を返す
    - 完了の確認: `npx tsc --noEmit -p infra` と `cdk synth --app "npx tsx spike/spike-app.ts" --no-lookups`(`infra` ディレクトリ)が通る。まだデプロイしない
    - _Requirements: 2.1, 2.2, 2.5_

  - [x] 1.2 手動でデプロイして疎通を確かめる(所有者の認証情報。実行前に確認する)
    - `cd infra && npx cdk deploy SpikeWsStack --app "npx tsx spike/spike-app.ts"`(`--hotswap`、`--express` は使わない)。CloudFront の作成に数分〜15分かかる
    - `check.ts` を実行する。確認する点: ① CloudFront 経由で往復できる ② Lambda のログの `domainName` が CloudFront ではなく `execute-api` のドメインで、`postToConnection` が成功する(管理 API の宛先を `domainName` と `stage` から作る設計の根拠) ③ `Origin` ヘッダーが届く ④ 直接の URL でも往復できる
    - 通らない場合: 原因(`Host` の転送、パス、ポリシー)を切り分け、直らなければ**ここで止めて**所有者に決定事項 1 の代替案(`VITE_WS_URL` と `cd.yml` の変更)を相談する
    - _Requirements: 2.1, 2.2, 2.5_

  - [x] 1.3 結果を design に記録し、使い捨てのスタックとコードを削除する
    - `cdk destroy SpikeWsStack`(所有者に確認してから)。削除が終わったことを `aws cloudformation describe-stacks` で確認する(`does not exist`)
    - `infra/spike/` を削除する(コミットしていないので履歴には残らない)
    - 触るファイル: `.kiro/specs/aws-deploy/design.md`(「調査で確認した事項」に、疎通の結果と日付、①〜④の結果を1行ずつ追記し、「未確認の点」の 1 を確認済みに直す。代替案を採る場合は決定事項 1 を書き換える)。**この修正だけで別のコミット**にする(Spec の修正)
    - 完了の確認: `git status` に `infra/spike/` が残っていない。`npm.cmd run lint`、`npm.cmd run typecheck`
    - _Requirements: 2.5_

- [ ] 2. 【基盤】依存、定数、S 側の契約テストを使う準備
  - [x] 2.1 依存と定数を足す
    - 触るファイル: `infra/lib/constants.ts`、`infra/package.json`、`backend/lambdas/package.json`、`package-lock.json`
    - `constants.ts` に追記: `WS_STAGE_NAME = 'ws'`、`TTL_MARGIN_SECONDS = 3600`、`CONNECTION_TTL_SECONDS = 10800`、スタック名 `DATA_STACK_NAME`、`API_STACK_NAME`、`WEB_STACK_NAME`(`DoodleNearbyDataStack` など)
    - `infra/package.json` の `devDependencies` に `esbuild` を**完全固定**で足す(入っていないと `NodejsFunction` が Docker に切り替わり、Docker のない CI の `synth` が落ちる)
    - `backend/lambdas/package.json` の `dependencies` に `@aws-sdk/client-dynamodb`、`@aws-sdk/lib-dynamodb`、`@aws-sdk/client-apigatewaymanagementapi` を完全固定で足す(型とテストのため。Lambda ではランタイムのものを使い、バンドルしない)。`fast-check` はルートにある
    - `.gitattributes` は `* text=auto eol=lf` のまま。改行だけの差分が出ないことを確認する。`npm audit` で新しい指摘が出ないことを確認する
    - 完了の確認: `npm.cmd install` のあと `npm.cmd ci`、`npm.cmd run lint`、`npm.cmd run typecheck`、`npm.cmd test`、`npm.cmd run build`、`npm.cmd run synth -w infra`
    - _Requirements: 7.6, 9.8_

  - [ ] 2.2 S 側の契約テストのスイートの状態を確認する(作らない)
    - S 側の `@doodle-nearby/core/testing` の `runRoomStoreContract(name, createStore, options?)` を、読んで確認するだけのタスク(コードは変えない)。**この Spec では契約テストを作らない。**
    - 確認する点: ① `@doodle-nearby/core/testing` から `runRoomStoreContract` が export されている(`createStore` は `RoomStore | Promise<RoomStore>` を返すファクトリ)。`index.ts` からは export されていない ② `MemoryRoomStore` で通っている ③ **`deletesImmediately` のオプションが入っているか。** 入る予定で、まだなら、タスク 3.5、3.6 を保留にして、S 側に状況を確認する。`DynamoDbRoomStore` は `deletesImmediately: false` で呼ぶ ④ 期限切れの `roomCode` の置き換えで、古い部屋と絵が消えることを求めているか(求めるなら、`createRoom` の後始末を省略しない) ⑤ 契約に不足がある(例: `listDrawings` の全ページ、競合のケース)場合は、S 側に追加を依頼する。この Spec では、タスク 3.5 の追加ケースとして書く
    - ③④の結果を、このタスクのコミットメッセージに書く。design の決定事項 4 と食い違う場合は、design を直す(Spec の修正として別コミット)
    - 触るファイル: なし
    - 完了の確認: `npm.cmd test`(`MemoryRoomStore` の契約テストが通る)
    - _Requirements: 4.2, 4.8, 10.6_

  - [ ] 2.3 `backend/lambdas` から S 側の `@doodle-nearby/core/testing` を使えるようにする
    - 前提: タスク 2.2
    - `backend/lambdas` のテストから `import { runRoomStoreContract } from '@doodle-nearby/core/testing'` が、型(`tsc -b`)と Vitest の両方で解決できることを確かめる。`./testing` の export、`coreAlias`、契約テストのファイルは**足さない・変えない**(S 側にある)
    - 解決できない場合だけ、`backend/lambdas` 側の設定(`vitest.config.ts` が `coreAlias` を使っているか、`tsconfig.json` の `references`)を直す。`packages/core` の変更が必要だと分かったら、変更せずに S 側へ依頼する
    - 触るファイル: 必要な場合だけ `backend/lambdas/vitest.config.ts`、`backend/lambdas/tsconfig.json`
    - 完了の確認: `npm.cmd run typecheck`、`npm.cmd test`、`npm.cmd run lint`
    - _Requirements: 4.1, 4.2, 10.6_
- [ ] 3. 【保存】`DynamoDbRoomStore` と `ConnectionStore`
  - [ ] 3.1 キーと変換の純関数を作る
    - 触るファイル: `backend/lambdas/src/dynamo-keys.ts`(新規)
    - 作るもの: キーの組み立て(`ROOM#`、`DRAWING#<10桁>`、`CODE#`、`CONN#`、`GEO#`)、項目 ↔ `Room` / `StoredDrawing` / `ConnectionState` の変換、`ttl` の計算(部屋・絵・予約は `ceil(expiresAt/1000) + TTL_MARGIN_SECONDS`、接続は `floor(now/1000) + CONNECTION_TTL_SECONDS`)、`UpdateItem` の式と `ExpressionAttributeNames` / `Values` の組み立て(`addParticipant`、`removeParticipant`、`appendDrawing`。接続 ID は `#c` で渡し、式に直接埋め込まない)
    - 緯度経度、IP、名前の項目を作らない。位置なしの部屋は `geohash` と GSI キーを省略する。接続の GSI キーは `geohash` があり `roomId` がないときだけ付ける(スパース)
    - AWS SDK を import しない(純関数にする)
    - 完了の確認: `npm.cmd run typecheck`、`npm.cmd run lint`
    - _Requirements: 4.1, 4.9, 5.1, 5.2, 6.1, 6.2_

  - [ ] 3.2 項目の変換と TTL のプロパティテストを書く(必須①)
    - 触るファイル: `backend/lambdas/src/dynamo-keys.test.ts`(新規)
    - **Property 1: 項目と値の変換はラウンドトリップする**(参加者 0〜8 人、`geohash` あり / なしの `Room`、`StoredDrawing`、`ConnectionState`)。100ケース以上
    - **Property 2: TTL の範囲**(部屋・絵・予約は `expiresAt/1000` 以上、`+ TTL_MARGIN_SECONDS + 1` 以下。接続は `now/1000` より大きく `+ CONNECTION_TTL_SECONDS` 以下)
    - 例示テスト: 接続の GSI キーが、`roomId` あり / なし、`geohash` あり / なしの4通りで正しく付く / 付かない
    - **Validates: Requirements 4.1, 4.9, 5.1, 6.2**
    - 完了の確認: `npm.cmd test`、`npm.cmd run lint`、`npm.cmd run typecheck`

  - [ ] 3.3 `DynamoDbRoomStore` を作る
    - 前提: local-prototype の `RoomStore` interface(タスク 4.3)が `main` にあること
    - 触るファイル: `backend/lambdas/src/dynamodb-room-store.ts`(新規)
    - design の 1.3 の表のとおりに、`RoomStore` の全メソッドを実装する。要点: `createRoom` は予約項目の条件付き `Put` を含む `TransactWriteItems`(キャンセル理由で `code_taken` を決める。期限切れの予約は置き換え、古い部屋の絵は後で消す)。`addParticipant` は1回の条件付き `UpdateItem` で、失敗時は `ALL_OLD` を見て `not_found` / `added: false` / `full` / `identity_taken` を決める。`appendDrawing` は `nextSeq` の加算 → 絵の `Put` → 超過分の `DeleteItem`
    - 部屋・絵・予約の読み取りは `ConsistentRead`。**すべての `Query`(`listDrawings`、`listRoomsByGeohashes`)と `Scan`(`listActiveRoomCodes`)で `LastEvaluatedKey` をたどり、全ページを連結する。`Limit` で切らない**(50枚 × 約30KB は1回の上限 1MB を超える)
    - `Scan` は `listActiveRoomCodes` だけで使う。`deleteExpired` は TTL に任せ、何も消さず `[]` を返す(読める期限切れの部屋を消すかどうかは任意で、入れない。決定事項 4)
    - コンストラクターで `DynamoDBDocumentClient` とテーブル名を受け取る(テストで差し替えられる)
    - 完了の確認: `npm.cmd run typecheck`、`npm.cmd run lint`、`npm.cmd run build`(実際の動作はタスク 3.5、3.6 で確認する)
    - _Requirements: 4.1〜4.10, 6.1, 6.2, 6.4_

  - [ ] 3.4 `ConnectionStore` を作る
    - 触るファイル: `backend/lambdas/src/connection-store.ts`(新規)
    - `get`(`ConsistentRead`)、`put`(`ttl` を更新。GSI キーは 3.1 の規則)、`delete`、`listSubscribers(geohash)`(`gsi1pk = GEO#<geohash>`、`gsi1sk begins_with CONN#`、全ページをたどる)を実装する
    - interface `ConnectionStore` と DynamoDB 実装を同じファイルに置く。テスト用のメモリ実装は、テストのファイルの中に作る
    - 完了の確認: `npm.cmd run typecheck`、`npm.cmd run lint`
    - _Requirements: 5.1, 5.2, 5.4_

  - [ ] 3.5 `DynamoDbRoomStore` の統合テストを書く(必須②。opt-in)
    - 触るファイル: `backend/lambdas/src/dynamodb-room-store.integration.test.ts`(新規)、`backend/lambdas/vitest.config.ts`(統合テストは `RUN_AWS_INTEGRATION=1` のときだけ実行。それ以外は `describe.skip` にする)
    - `beforeAll` で一時テーブル `doodle-nearby-it-<ランダム>` を、本番と同じスキーマ(`pk`/`sk`、`gsi1`、TTL 属性、オンデマンド)で作成し、`ACTIVE` まで待つ。`afterAll` で必ず削除する(テストが失敗しても)。テーブル名の接頭辞を出力する
    - `runRoomStoreContract`(`@doodle-nearby/core/testing`、S 側のもの)を `DynamoDbRoomStore` で、**`deletesImmediately: false`** を付けて実行する
    - **追加のケース**: 1つの部屋に、`imageData` が 30,000 文字の絵を 50 枚 `appendDrawing` し、`listDrawings` が 50 枚すべてを `seq` の昇順(1〜50)で返し、各 `imageData` が送った内容と一致すること(合計約 1.5MB で、1回の `Query` の上限を超える)。51枚目を追加すると `seq` 1 の絵が消えて 50 枚のままであること
    - 競合のケース: 最後の1席に `addParticipant` を同時に2回(`full`)、同じ識別で同時に2回(`identity_taken`)、同じ `roomCode` で `createRoom` を同時に2回(`code_taken`)。それぞれ成功がちょうど1回であること
    - `npm.cmd test`(`RUN_AWS_INTEGRATION` なし)では、このテストがスキップされること
    - **Validates: Requirements 4.2〜4.8, 10.3**
    - 完了の確認: `npm.cmd test`(スキップされる)、`npm.cmd run lint`、`npm.cmd run typecheck`

  - [ ] 3.6 統合テストを実際の DynamoDB で実行する(所有者の認証情報。実行前に確認する)
    - `RUN_AWS_INTEGRATION=1` と `AWS_REGION=ap-southeast-2` で `npm.cmd test -w backend/lambdas` を実行する。一時テーブルが作成・削除されることを確かめ、`aws dynamodb list-tables` に `doodle-nearby-it-` のテーブルが残っていないことを確認する
    - 失敗したケースは、条件式(`dynamo-keys.ts`、`dynamodb-room-store.ts`)を直して再実行する。**このタスクが通るまで、7.1(初回デプロイ)に進まない**
    - _Requirements: 4.2〜4.8, 10.3_

- [ ] 4. 【ハンドラー】Lambda の薄い層
  - [ ] 4.1 `ports.ts` を作る
    - 触るファイル: `backend/lambdas/src/ports.ts`(新規)
    - `createPorts({ endpoint, sender, connections, buildRoomList, pending })` は `{ ports, flusher }` を返す。`send`(`JSON.stringify` して `postToConnection`。410 とその他の失敗はその接続だけ無視。410 のときは接続状態を削除。`MAX_MESSAGE_BYTES` 超は送らずログだけ)。`roomsChanged(geohash)` は geohash を `flusher.changed` に記録するだけ(I/O をしない)。`flusher.flush()` が、記録した geohash の近傍の購読者を `listSubscribers` で引き(`connectionId` で重複なし)、購読者の `geohash` ごとに `buildRoomList` を1回だけ呼び、最大10接続ずつ並行で送る。送ったら `changed` を空にする
    - `send` が返した `Promise` を `pending` にも積む(`RoomService` が `await` しない場合でも、ハンドラーが完了を待てるように)
    - 完了の確認: `npm.cmd run typecheck`、`npm.cmd run lint`
    - _Requirements: 3.7, 3.9, 5.3, 5.4, 5.5_

  - [ ] 4.2 `handler.ts` を作る
    - 触るファイル: `backend/lambdas/src/handler.ts`(新規)
    - `createWsHandler(deps)`: `$connect`(空の接続状態を保存)、`$disconnect`(状態があれば `handleDisconnect`、状態を削除)、`$default`(バイナリ → `invalid_json`、`Buffer.byteLength` が `MAX_MESSAGE_BYTES` 超 → `message_too_large`、`parseClientMessage` の失敗 → そのコード、成功 → 状態を読む(なければ空)→ `handleMessage` → 新しい状態を保存)。サイズはパースの前に測る。ちょうど `MAX_MESSAGE_BYTES` は受け付ける
    - 全体を `try/catch` で囲み、本人へ `internal_error` を送る(送れなければ無視)。常に `statusCode: 200`。**順序: 接続状態の読み取り → `handleMessage` → 新しい状態の保存 → `flusher.flush()` → `pending` を `allSettled` で待つ → `return`。** `$disconnect` は、`handleDisconnect` → 状態の削除 → `flush()` → `pending` を待つ。`handleMessage` が例外を投げても、保存できる状態を保存してから `flush()` する
    - 管理 API の宛先はイベントの `domainName` と `stage` から作る(環境変数を使わない)
    - ログは `type`、バイト数、エラーコード、接続 ID の先頭8文字だけ。geohash、部屋番号、`imageData`、IP を出さない。イベントの送信元 IP を読まない
    - イベントごとに `RoomService` を作る(`createPorts` の宛先と `pending` が変わるため)
    - 完了の確認: `npm.cmd run typecheck`、`npm.cmd run lint`
    - _Requirements: 3.3〜3.10, 6.4_

  - [ ] 4.3 `index.ts` で実物を組み立てる
    - 前提: local-prototype の `RoomService`、`orderRoomSummaries`(タスク 4.5、4.21)が `main` にあること
    - 触るファイル: `backend/lambdas/src/index.ts`(既存の `import '@doodle-nearby/core'` を、`export const handler` に置き換える)
    - モジュールのスコープで `DynamoDBDocumentClient`、`DynamoDbRoomStore`、`ConnectionStore` を1回だけ作る。環境変数は `TABLE_NAME` だけ(未設定なら起動時に分かるエラーにする)。`orderRooms` は core の `orderRoomSummaries`。`clock`、`random`、`newId` は既定
    - `backend/lambdas/src/index.test.ts`(既存)を、この変更に合わせて直す
    - 完了の確認: `npm.cmd test`、`npm.cmd run typecheck`、`npm.cmd run lint`、`npm.cmd run build`
    - _Requirements: 3.1〜3.3, 3.11_

  - [ ] 4.4 ハンドラーのテストを書く(必須③)
    - 触るファイル: `backend/lambdas/src/handler.test.ts`(新規)
    - 偽の `ConnectionStore`(メモリ)、偽の送信(送ったメッセージを記録)、`MemoryRoomStore` + 実物の `RoomService` を使う
    - 確認する点: 位置なしの部屋の作成 → 部屋番号での参加 → 絵の送信で、両方に `drawing_added` が届く。`MAX_MESSAGE_BYTES` ちょうどは受け付け、1バイト超は `message_too_large` で `RoomService` を呼ばない。バイナリは `invalid_json`。不正な JSON は parser のコード。`$disconnect` で `participant_left` が他の参加者に届き、状態が消える。410 の接続は状態が消え、ほかの接続への送信は続く。一斉送信が10接続ずつ
    - **Property 3: 一覧の宛先**(接続の集合と変更された geohash から、`flush` の送信先が「部屋に入っておらず、`geohash` が近傍に含まれる接続」と等しい。位置なしと部屋の中の接続には送らない)。あわせて例示テスト: 部屋を作った・入った本人には、そのあとの `room_list` が届かない(状態の保存が先)。`roomsChanged` の呼び出し中は何も送られず、`flush` で初めて送られる
    - **Validates: Requirements 3.3〜3.9, 5.3〜5.5, 10.1**
    - 完了の確認: `npm.cmd test`、`npm.cmd run lint`、`npm.cmd run typecheck`

  - [ ]* 4.5 ハンドラーの Property 4〜6 のテストを書く
    - 触るファイル: `backend/lambdas/src/handler.test.ts`(追記)
    - **Property 4: ハンドラーは例外を投げない**(任意の文字列の本文、空、非常に長いもの、バイナリのフラグ付き)
    - **Property 5: 送信するメッセージの大きさ**(`imageData` が 30,000 文字以内の `drawing_added` を含め、送る JSON が `MAX_MESSAGE_BYTES` 以下)
    - **Property 6: ログに出さない値**(処理したメッセージの `geohash`、`roomCode`、`imageData` が、どのログ行にも含まれない)
    - **Validates: Requirements 3.4, 3.5, 3.8, 3.9, 3.10, 6.4**
    - 完了の確認: `npm.cmd test`、`npm.cmd run lint`、`npm.cmd run typecheck`

- [ ] 5. 【CDK】3つのスタック
  - [ ] 5.1 `DoodleNearbyDataStack` を作る
    - 触るファイル: `infra/lib/data-stack.ts`(新規)
    - `Table`: オンデマンド、`pk`/`sk`(S)、TTL 属性 `ttl`、GSI `gsi1`(`gsi1pk`/`gsi1sk`、射影 `ALL`)、AWS 所有キーの暗号化、PITR なし、`deletionProtection: true`、`removalPolicy: RETAIN`。物理名は付けない。スタックに `terminationProtection: true`。出力 `TableName`
    - 完了の確認: `npm.cmd run typecheck`、`npm.cmd run lint`
    - _Requirements: 6.1, 6.5, 8.1, 9.1〜9.3_

  - [ ] 5.2 `DoodleNearbyApiStack` を作る
    - 触るファイル: `infra/lib/api-stack.ts`(新規)
    - `NodejsFunction`(design の 4.2 のとおり: Node.js 22、arm64、256MB、15秒、`TABLE_NAME`、ログ保持2週間、`minify`、`externalModules: ['@aws-sdk/*']`、`forceDockerBundling: false`、`esbuildArgs` で `--alias:@doodle-nearby/core` を `packages/core/src/index.ts` に向ける)。`table.grantReadWriteData(handler)`
    - `WebSocketApi`(3ルートに同じ `WebSocketLambdaIntegration`)、`WebSocketStage`(`stageName: WS_STAGE_NAME`、`autoDeploy: true`、`throttle: { rateLimit: 20, burstLimit: 40 }`)。出力 `WebSocketUrl`
    - **`webSocketApi.grantManageConnections(handler)` を使う。`npm.cmd run synth -w infra` を実行し、循環参照のエラーが出たら、`arn:aws:execute-api:<region>:<account>:*/ws/POST/@connections/*` の案に戻す。** 戻した場合は、design の 4.2 と決定事項 9 に理由を書く(Spec の修正として別コミット)
    - API Gateway のアクセスログと実行ログは有効にしない。予約同時実行は設定しない
    - 完了の確認: `npm.cmd run synth -w infra`(Docker なし、認証情報なしで通る)、`npm.cmd run typecheck`、`npm.cmd run lint`
    - _Requirements: 3.1, 3.2, 3.11, 7.5, 7.6, 8.2〜8.5, 9.1, 9.3_

  - [ ] 5.3 `DoodleNearbyWebStack` を作る
    - 前提: タスク 1.3 で疎通が確認できていること(通らなかった場合は、所有者と決めた代替案に合わせて、この内容を直す)
    - 触るファイル: `infra/lib/web-stack.ts`(新規)
    - S3 バケット(名前は `` `${WEB_BUCKET_PREFIX}${Aws.ACCOUNT_ID}-${Aws.REGION}` ``、パブリックアクセスをすべて遮断、`enforceSSL`、S3 管理の暗号化、`DESTROY` + `autoDeleteObjects`)。`BucketDeployment` は使わない
    - CloudFront: 既定 behavior は `S3BucketOrigin.withOriginAccessControl`、HTTPS にリダイレクト、`CACHING_OPTIMIZED`、圧縮、`defaultRootObject: 'index.html'`。`/ws` は design の 4.3 のとおり(`HttpOrigin`、`HTTPS_ONLY`、`CACHING_DISABLED`、`ALL_VIEWER_EXCEPT_HOST_HEADER`、`ALLOW_GET_HEAD`、パスの書き換えなし)。`HTTP2_AND_3`、`PRICE_CLASS_ALL`、`TLS_V1_2_2021`
    - レスポンスヘッダーポリシー: HSTS(1年)、`X-Content-Type-Options`、`Referrer-Policy: no-referrer`、`X-Frame-Options: DENY`、`Permissions-Policy: geolocation=(self), camera=(), microphone=()`。CSP は入れない
    - 出力 `WebBucketName`、`WebDistributionId`、`PublicUrl`。Lambda@Edge、カスタムドメイン、ACM を使わない
    - 完了の確認: `npm.cmd run typecheck`、`npm.cmd run lint`
    - _Requirements: 1.1〜1.8, 2.1, 2.3, 9.5, 9.6_

  - [ ] 5.4 `infra.ts` に3スタックを足し、CDK のテストを書く(必須④)
    - 触るファイル: `infra/bin/infra.ts`(3スタックを追加。`GithubOidcStack` の行と `env` の扱いは変えない。Region をコードに書かない)、`infra/lib/data-stack.test.ts`、`infra/lib/api-stack.test.ts`、`infra/lib/web-stack.test.ts`(新規)
    - 確認する点(テンプレートの細かいアサーション): バケットがパブリックアクセスを遮断し、名前が `doodle-nearby-web-` で始まる。配信が OAC を使い、`/ws` の behavior(`PathPattern` が `/ws`)がある。**`/ws` の `OriginRequestPolicyId` が `AllViewerExceptHostHeader`(`b689b0a8-53d0-40ab-baf2-68738e2966ac`)で、`Host` を転送しない。`CachePolicyId` がキャッシュ無効(`4135ea2d-6df8-44a3-9df3-4b5a84be39ad`)。** テーブルがオンデマンドで TTL が有効、GSI がある、`RETAIN`。WebSocket のステージ名が `ws` で、スロットリングが 20 / 40。Lambda が Node.js 22、arm64。`ManageConnections` の権限が、この API の ARN(`grantManageConnections` の場合)または `@connections/*`(`*` に戻した場合)に絞られている。必要な出力がそろう(`WebBucketName`、`WebDistributionId`、`PublicUrl`、`WebSocketUrl`、`TableName`)。Lambda@Edge がない。リソースの Region がコードに固定されていない。`Action: "*"` と `Resource: "*"` の組み合わせがない
    - `cd.yml` が読む出力名(`WebBucketName`、`WebDistributionId`)が `DoodleNearbyWebStack` にあること、スタック名が `DoodleNearby*` に一致すること
    - **Validates: Requirements 1.x, 2.1, 7.1〜7.4, 8.x, 9.x, 10.2**
    - 完了の確認: `npm.cmd test`、`npm.cmd run synth -w infra`、`npm.cmd run lint`、`npm.cmd run typecheck`

  - [ ] 5.5 CI と同じ条件で `synth` が通ることを確認する(必須⑤)
    - 前提: タスク 4.3(実物のハンドラー)が入っていること
    - Docker を使わず、AWS の認証情報を渡さず(`AWS_EC2_METADATA_DISABLED=true`、`CDK_DISABLE_VERSION_CHECK=1`)、`apps/web/dist` と `packages/core/dist` を消した状態で、`npm.cmd run synth -w infra` が通ることを確かめる。バンドルが `packages/core/src` から読めていること(`cdk.out` の Lambda アセットにハンドラーが入っている)を確認する
    - 通らなければ、`esbuild` の解決、`--alias`、`projectRoot`、`depsLockFilePath` を直す(タスク 2.1、5.2)
    - 触るファイル: 必要なら `infra/lib/api-stack.ts`、`infra/package.json`
    - 完了の確認: `npm.cmd run synth -w infra`、`npm.cmd run lint`、`npm.cmd run typecheck`、`npm.cmd test`
    - _Requirements: 7.5, 7.6, 9.4_

- [ ] 6. 【確認と文書】
  - [ ] 6.1 スモークテストのスクリプトを作る
    - 触るファイル: `tests/smoke/run.ts`(新規)、`package.json`(ルートの `scripts` に `"smoke": "tsx tests/smoke/run.ts"`)
    - `npm run smoke -- <PublicUrl>`: 2つの `ws` クライアントで `wss://<host>/ws` につなぎ、`create_room`(`geohash: null`)→ `room_created` → 2つ目が `join_by_code` → `room_joined`(1つ目に `participant_joined`)→ 1つ目が 1×1 の PNG の `drawing_submit` → 両方が `drawing_added` を受信 → 両方が `leave` → `room_left`。各ステップは10秒でタイムアウトし、失敗したら失敗したステップ名を出して終了コード 1。最後に接続を閉じる
    - Vitest の対象に含めない(`tests/vitest.config.ts` の `include` が `tests/repo` だけであることを確認する)。CI では動かさない。引数が `https://` 以外ならエラーにする
    - 完了の確認: `npm.cmd run lint`、`npm.cmd run typecheck`、`npm.cmd test`(スモークが実行されない)。引数なしで実行すると使い方を出して終了コード 1
    - _Requirements: 10.4, 10.5_

  - [ ] 6.2 `docs/deploy.md`(英語)を書く
    - 触るファイル: `docs/deploy.md`(新規)
    - 内容: 構成図(mermaid 1つ)、初回の手順(ブートストラップの確認、`GithubOidcStack` がデプロイ済みであること、`AWS_ROLE_ARN`、`AWS_REGION`、`DEPLOY_ENABLED` の設定、初回は手動で `cdk deploy 'DoodleNearby*'`)、スモークテストの実行、利用者に影響する制限(アイドル 10 分、接続 2 時間)、止まったときの確認(spend limit、Lambda の同時実行の上限、`aws freetier get-account-plan-state`)、コンテストの終了後に削除する手順(`DoodleNearbyDataStack` の終了保護と `RETAIN` の外し方)と、削除の前に所有者に確認すること
    - 秘密情報とアカウント ID を書かない。`--hotswap` と `--express` を勧めない
    - 完了の確認: `npm.cmd run lint`(Prettier が `docs/` を検査する)
    - _Requirements: 8.6, 8.7, 11.1, 11.3_

  - [ ] 6.3 `docs/judges.md`(英語)を書く
    - 触るファイル: `docs/judges.md`(新規)
    - 内容: 公開 URL の置き場所(初回デプロイのあとに埋める)、1台で試す手順(URL を開く、位置情報を許可 / 拒否、部屋を作る、描く、送る)、2台または2つのタブで試す手順(部屋番号で参加)、接続が切れたときの動作(アイドル 10 分、2 時間)。アカウント ID と秘密情報を書かない
    - ルートの `README.md` と `apps/*/README.md` は変えない(リンクを足す場合は所有者に確認する)
    - 完了の確認: `npm.cmd run lint`
    - _Requirements: 11.2, 11.3, 11.4_

- [ ] 7. 【デプロイ】
  - [ ] 7.1 初回のデプロイを手動で行う(所有者の認証情報。実行前に確認する)
    - 前提: タスク 3.6、4.3、5.5、6.1 が終わっていること
    - `cd infra && npx cdk diff 'DoodleNearby*'` で差分(作られるリソース、IAM の変更)を所有者と確認してから、`npx cdk deploy 'DoodleNearby*' --require-approval never` を実行する。デプロイの失敗は、最初の `_FAILED` イベントを見る
    - `cd.yml` と同じ手順で Web を配る: `npx tsc -b packages/core && npm.cmd run build -w apps/web`、`aws s3 sync apps/web/dist s3://<WebBucketName> --delete`、`aws cloudfront create-invalidation --distribution-id <WebDistributionId> --paths '/*'`
    - `PublicUrl` を `docs/judges.md` に書く(Spec ではなく文書の修正。タスクのコミットに含める)
    - 完了の確認: `aws cloudformation describe-stacks` で3つのスタックが `CREATE_COMPLETE`。`PublicUrl` をブラウザで開いて画面が出る
    - _Requirements: 1.9, 9.4, 9.5, 11.2_

  - [ ] 7.2 公開 URL でスモークテストを実行し、上限を確認する(必須⑥)
    - `npm run smoke -- <PublicUrl>` が成功する。実機(スマホ2台、または PC とスマホ)で、部屋の作成、部屋番号での参加、絵の送信を確かめる
    - Lambda の同時実行の上限の申請状況を `GetAccountSettings` で確認し、結果(1,000 のままであること)を所有者に報告する。ステージのスロットリング(20 / 40)が設定されていることを `aws apigatewayv2 get-stage` で確認する
    - 失敗したら、Lambda のログ(`/aws/lambda/…`)を見る。ログに geohash、部屋番号、`imageData` が出ていないことも確認する
    - _Requirements: 10.4, 3.10, 8.2, 8.5_

  - [ ] 7.3 CD を有効にして、`cd.yml` で更新できることを確認する(`push` と変数の変更は所有者の指示があるときだけ)
    - GitHub のリポジトリ変数 `AWS_ROLE_ARN`、`AWS_REGION`(`ap-southeast-2`)が設定済みであることを確認し、`DEPLOY_ENABLED` を `'true'` にする
    - 所有者の指示で `main` に小さな変更(例: `docs/judges.md` の文言)を push し、CD が最後まで成功すること(3スタックの更新、出力の読み取り、S3 の同期、無効化)と、公開 URL に変更が出ることを確認する。失敗したら `cd.yml` の失敗要約(`job-summary.sh`)を見る。`cd.yml` は変えない
    - _Requirements: 1.9, 9.4, 9.5, 9.6_

- [ ] 8. 最終チェックポイント - 全体の確認
  - `npm.cmd run lint`、`npm.cmd run typecheck`、`npm.cmd test`、`npm.cmd run synth -w infra` が通る
  - 公開 URL が開き、スモークテストが通り、実機で絵が互いの画面に出る
  - 2027-01-29 まで動かす条件を確認する: 終了保護と `RETAIN` が効いている、spend limit を所有者が設定済み、同時実行の上限の状況、`docs/deploy.md` の「止まったとき」の手順がある
  - コンテスト後にリソースを残すか削除するかを、所有者に確認する(自動では削除しない)
  - 問題があれば、該当するタスクに戻す

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "2.2"] },
    { "id": 1, "tasks": ["1.2", "2.3", "3.1", "5.1", "6.1"] },
    { "id": 2, "tasks": ["1.3", "3.2", "3.3", "3.4", "5.2"] },
    { "id": 3, "tasks": ["3.5", "4.1", "5.3"] },
    { "id": 4, "tasks": ["3.6", "4.2", "5.4"] },
    { "id": 5, "tasks": ["4.3", "4.4", "6.2", "6.3"] },
    { "id": 6, "tasks": ["4.5", "5.5"] },
    { "id": 7, "tasks": ["7.1"] },
    { "id": 8, "tasks": ["7.2"] },
    { "id": 9, "tasks": ["7.3"] },
    { "id": 10, "tasks": ["8"] }
  ]
}
```
