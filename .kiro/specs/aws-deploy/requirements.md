# Requirements Document

## Introduction

Spec「local-prototype」で作るローカル試作(`apps/web`、`apps/local-server`、`packages/core`)を AWS にデプロイし、審査員が無料で試せる公開 URL を **2027-01-29 まで**動かし続ける。

構成は次のとおり(steering の `tech.md` に従う)。

- 画面: S3 + CloudFront(HTTPS)
- リアルタイム通信: API Gateway の WebSocket API + Lambda
- 部屋・接続・絵の保存: DynamoDB(TTL で自動削除)
- インフラ定義: AWS CDK(TypeScript)。スタック名は `DoodleNearby*`
- デプロイ: 既存の `.github/workflows/cd.yml`(OIDC、`cdk deploy 'DoodleNearby*'`、S3 同期、CloudFront 無効化)。**`cd.yml` は変更しない**
- Region: プロジェクトの選択 Region **ap-southeast-2**(`.kiro/steering/aws-starter-rules.md` の制約に従う)

部屋のロジックは `packages/core` の `RoomService` をそのまま使う。この Spec で足すのは次の3つだけである。

1. `RoomStore` の DynamoDB 実装(`DynamoDbRoomStore`)
2. `RoomService` を呼ぶ薄い Lambda ハンドラー(`$connect`、`$disconnect`、`$default`)
3. CDK のスタック(Data、Api、Web)

`RoomService`、`RoomStore` interface、メッセージ型、パーサーの意味は変えない。

### 前提(依存)

- Spec「local-prototype」のタスク 4.3〜4.11、4.20、4.21(`RoomStore`、`MemoryRoomStore`、契約テストのスイート `runRoomStoreContract`(`@doodle-nearby/core/testing`。S 側にあり、この Spec では作らない)、`RoomService`、`MESSAGE_SPECS`、`orderRoomSummaries`)と、グループ W(`apps/web`)が完了していること。`RoomService` は現時点では未実装である
- Spec「repo-and-ci」の `GithubOidcStack`、`cd.yml`、CDK ブートストラップ(アカウントに作成済み。修飾子 `hnb659fds`、バージョン 34)が使えること
- `GithubOidcStack` は CD の対象外(`DoodleNearby*` ではない)で、この Spec では変更しない。変更が必要になった場合は、所有者が手動でデプロイする別作業として扱う(design の「未確認の点」を参照)

### 範囲外

AI 司会者(Bedrock)、AI ボット、交換カード、協力お題、カスタムドメイン、WAF、Cognito などのログイン、画像の S3 アップロード(`imageKey`)、IP による部屋の優先、複数 Region 構成、ローカルサーバーの変更。

## Glossary

- **Web_Stack**: CDK スタック `DoodleNearbyWebStack`。S3 バケットと CloudFront 配信を持つ
- **Api_Stack**: CDK スタック `DoodleNearbyApiStack`。WebSocket API と Lambda を持つ
- **Data_Stack**: CDK スタック `DoodleNearbyDataStack`。DynamoDB テーブルを持つ
- **Public_URL**: CloudFront が発行する `https://<id>.cloudfront.net`。審査員に渡す URL
- **Ws_Endpoint**: Public_URL の `/ws`(`wss://<id>.cloudfront.net/ws`)。画面は現在のページの位置から WebSocket のアドレスを作る(local-prototype の要件 12.4)ので、画面のコードを変えずに使える
- **Ws_Handler**: Api_Stack の Lambda 関数。`$connect`、`$disconnect`、`$default` の3つのルートを1つの関数で処理する
- **Dynamo_Store**: `RoomStore` interface の DynamoDB 実装 `DynamoDbRoomStore`
- **Table**: Data_Stack の DynamoDB テーブル。部屋、絵、接続状態、部屋番号の予約を1つのテーブルに持つ
- **Connection_State**: `RoomService` が使う接続ごとの状態(`connectionId`、`geohash`、`roomId`)。Table に保存する
- **Retention**: 部屋と絵が消えるまでの時間。3時間(`ROOM_RETENTION_MS`)
- **Selected_Region**: `ap-southeast-2`
- **Contest_End**: 2027-01-29(審査員が試せる状態を保つ最終日)

---

## Requirements

### Requirement 1: 公開 URL と Web の配信

**User Story:** As a judge, I want to open one public HTTPS URL on my phone or PC without signing up, so that I can try the app for free.

#### Acceptance Criteria

1. THE Web_Stack SHALL create an S3 bucket whose name starts with `doodle-nearby-web-` (the `WEB_BUCKET_PREFIX` constant), that blocks all public access, and that enforces TLS-only access.
2. THE Web_Stack SHALL create a CloudFront distribution that serves the bucket through origin access control, so that the bucket is readable only through the distribution.
3. THE Web_Stack SHALL redirect HTTP viewer requests to HTTPS and SHALL serve `index.html` for requests to `/`.
4. THE Web_Stack SHALL output `WebBucketName`, `WebDistributionId`, and `PublicUrl` (the `https://` URL of the distribution).
5. THE Web_Stack SHALL be named `DoodleNearbyWebStack`.
6. THE Web_Stack SHALL add a response-headers policy that sets at least `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, and `Permissions-Policy: geolocation=(self), camera=(), microphone=()`.
7. THE Web_Stack SHALL NOT use Lambda@Edge, a custom domain, or an ACM certificate.
8. THE Web_Stack SHALL NOT upload web files itself (no `BucketDeployment`), because `cd.yml` syncs `apps/web/dist` with `--delete` after the stack is deployed.
9. WHEN `cd.yml` runs `aws s3 sync apps/web/dist "s3://$BUCKET" --delete` and `aws cloudfront create-invalidation`, THE Public_URL SHALL serve the new build without any manual step.

### Requirement 2: 同じオリジンの WebSocket 入口

**User Story:** As a developer, I want the page and the WebSocket to share one origin, so that the web app builds its address from the page location and needs no environment-specific setting.

#### Acceptance Criteria

1. THE Web_Stack SHALL add a CloudFront behavior for the exact path `/ws` that forwards to the WebSocket API of the Api_Stack, with caching disabled and with viewer headers (including `Origin`, `Upgrade`, `Connection`, and `Sec-WebSocket-*`) forwarded, and with the `Host` header NOT forwarded.
2. WHEN a browser opens `wss://<Public_URL host>/ws`, THE system SHALL complete the WebSocket handshake and route the connection to the Ws_Handler.
3. THE Api_Stack SHALL output `WebSocketUrl` (the direct `wss://<api-id>.execute-api.ap-southeast-2.amazonaws.com/ws` address) for diagnostics. The web app SHALL NOT use this value.
4. THE Web_App SHALL need no change in its WebSocket address logic, and no environment variable SHALL be required at web build time.
5. IF the handshake through CloudFront cannot be made to work, THEN the fallback in design decision 1 SHALL be applied and recorded in the design before implementation continues.

---

### Requirement 3: WebSocket API と Lambda

**User Story:** As a participant, I want the deployed app to behave like the local prototype, so that rooms, joining, and drawings work the same way.

#### Acceptance Criteria

1. THE Api_Stack SHALL create an API Gateway WebSocket API with one stage named `ws`, in the Selected_Region, and SHALL be named `DoodleNearbyApiStack`.
2. THE Api_Stack SHALL route `$connect`, `$disconnect`, and `$default` to the Ws_Handler.
3. THE Ws_Handler SHALL contain no room logic. It SHALL parse the incoming message with `parseClientMessage`, load the Connection_State, call `RoomService.handleMessage`, and save the returned Connection_State.
4. WHEN the body of a message is larger than `MAX_MESSAGE_BYTES` bytes, THE Ws_Handler SHALL send the sender an ErrorMessage with the code `message_too_large`, SHALL NOT pass the message to the `RoomService`, and SHALL keep the connection open.
5. WHEN the body of a message is binary, is not valid JSON, or fails the parser, THE Ws_Handler SHALL send the sender an ErrorMessage with the code returned by the parser (`invalid_json` for binary), SHALL NOT change any room, and SHALL keep the connection open.
6. WHEN the `$disconnect` route runs, THE Ws_Handler SHALL call `RoomService.handleDisconnect` with the stored Connection_State and delete the stored Connection_State.
7. THE Ws_Handler SHALL implement the `ServicePorts` of the `RoomService` as follows: `send` posts the JSON message to the connection through the API Gateway management API and ignores a gone connection (HTTP 410) and other send failures for that one connection; `roomsChanged` only records the changed Geohash, and after the Ws_Handler has saved the sender's Connection_State it sends an updated RoomList to every connection that is not in a room and whose Geohash has a changed Geohash in its Neighbor_Cells, as the local server does (local-prototype の要件 8.15).
8. THE Ws_Handler SHALL NOT throw an unhandled exception for any client input. An internal failure SHALL produce an ErrorMessage with the code `internal_error` to the sender when possible.
9. THE Ws_Handler SHALL send no single message larger than `MAX_MESSAGE_BYTES` bytes.
10. THE Ws_Handler SHALL write no Geohash, room code, `imageData`, or IP address to its logs. It MAY log the message `type`, the byte length, the error code, and the first 8 characters of the connection ID.
11. THE Ws_Handler SHALL run on Node.js 22 and arm64.
12. WHEN a single connection stays idle for 10 minutes or lasts 2 hours, THE API Gateway SHALL close it (service limits). THE Web_App SHALL show the existing "connection lost" screen (local-prototype の要件 5.10) in that case, and this Spec SHALL document the limits in the judge-facing instructions.

---

### Requirement 4: DynamoDB による保存(`DynamoDbRoomStore`)

**User Story:** As a developer, I want the same `RoomStore` contract on DynamoDB as in memory, so that `RoomService` behaves the same in Lambda and in the local server.

#### Acceptance Criteria

1. THE Dynamo_Store SHALL implement every method of the `RoomStore` interface from `packages/core` without changing the interface, and SHALL NOT be placed in `packages/core` (so that `packages/core` has no AWS SDK dependency).
2. THE Dynamo_Store SHALL pass the shared contract test suite `runRoomStoreContract` that the local-prototype Spec provides in `@doodle-nearby/core/testing` and that `MemoryRoomStore` passes (this Spec uses the suite and does not create it), called with `deletesImmediately: false`, without skipping cases that apply to a store without an explicit sweep (see requirement 4.8).
3. WHEN two `addParticipant` calls race for the last free place of a room, THE Dynamo_Store SHALL accept exactly one of them and return `full` to the other.
4. WHEN two `addParticipant` calls race with the same Participant_Identity in one room, THE Dynamo_Store SHALL accept exactly one of them and return `identity_taken` to the other.
5. WHEN two `createRoom` calls race for the same `roomCode`, THE Dynamo_Store SHALL create exactly one room and return `code_taken` to the other. A `roomCode` held only by an expired room SHALL be reusable.
6. THE Dynamo_Store SHALL assign `seq` values to Drawings of one room as strictly increasing integers starting at 1 in the order the Drawings are accepted, with no duplicate, and SHALL keep at most `maxDrawings` Drawings per room by deleting the oldest.
7. THE Dynamo_Store SHALL read rooms, drawings, and room-code reservations with strongly consistent reads, and SHALL follow `LastEvaluatedKey` on every query it makes until the last page, so that `listDrawings` returns all retained Drawings (up to 50 Drawings of about 30KB each, which exceed the 1MB limit of one query page) in ascending `seq` order.
8. THE Dynamo_Store SHALL store `expiresAt` in epoch milliseconds and SHALL add a TTL attribute in epoch seconds to every item. THE Dynamo_Store SHALL leave the removal of expired items to the TTL: `deleteExpired` MAY remove nothing and return an empty list, and it is optional to remove expired rooms that are still readable. THE contract suite SHALL pass with `deletesImmediately: false`.
9. THE Dynamo_Store SHALL store no participant name, IP address, device ID, or latitude and longitude. It SHALL store the Geohash only as the 6-character cell.
10. THE Dynamo_Store SHALL use only the AWS SDK for JavaScript v3 and SHALL NOT scan the Table on any path that runs per message (a scan is allowed only for `listActiveRoomCodes`, which is a rare fallback).

---

### Requirement 5: 接続状態と一覧の再送

**User Story:** As a participant, I want my room list to update while I wait, so that I see new rooms without reloading.

#### Acceptance Criteria

1. THE system SHALL store each Connection_State in the Table from `$connect` until `$disconnect`, and SHALL give it a TTL of 3 hours from the last update so that a lost `$disconnect` event leaves no item forever.
2. WHEN a connection has a Geohash and is not in a room, THE system SHALL be able to find that connection by its Geohash without scanning the Table.
3. WHEN `RoomService` calls `roomsChanged(geohash)`, THE Ws_Handler SHALL only record the Geohash at that moment, and SHALL send the RoomList after the Connection_State of the sender has been saved (or deleted, for `$disconnect`), only to the connections described in requirement 3.7, building the RoomList once per distinct Geohash among them. THE sender that has just entered a room SHALL NOT receive that RoomList.
4. IF sending to a connection fails because the connection is gone, THEN THE Ws_Handler SHALL delete that connection's stored Connection_State and SHALL continue with the other connections.
5. THE Ws_Handler SHALL send to at most 10 connections at the same time during one fan-out.

---

### Requirement 6: データの保持とプライバシー

**User Story:** As a participant, I want my rooms and drawings to disappear automatically and my exact location never to be stored.

#### Acceptance Criteria

1. THE Table SHALL have DynamoDB TTL enabled on one attribute, and every room, drawing, room-code reservation, and Connection_State item SHALL carry that attribute.
2. THE Dynamo_Store SHALL set the TTL of a room, its drawings, and its room-code reservation to `expiresAt` (in seconds) plus a margin of at most 1 hour, so that no room data stays longer than Retention + 1 hour in the Table.
3. THE `RoomService` SHALL continue to hide rooms with `expiresAt <= now` on every read (local-prototype の要件 10.5), because DynamoDB TTL deletion can be delayed.
4. THE Ws_Handler and the Dynamo_Store SHALL NOT receive, store, or log a latitude, a longitude, or an IP address. The source IP in the Lambda event SHALL NOT be read.
5. THE Table SHALL use server-side encryption (the default AWS-owned key is enough) and SHALL NOT store any secret.

---

### Requirement 7: Region とプロジェクトの制約

**User Story:** As the project owner, I want every resource to follow the project's Region and service constraints, so that the deployment is not blocked.

#### Acceptance Criteria

1. THE CDK app SHALL create every Regional resource in the Selected_Region (`ap-southeast-2`), taken from the deployment environment (`CDK_DEFAULT_REGION` or the `AWS_REGION` of the CD job), and SHALL NOT hard-code another Region.
2. THE CDK app SHALL NOT create resources in `us-east-1`, SHALL NOT use CloudFormation StackSets, cross-Region replication, multi-Region KMS keys, Lambda@Edge, or Route 53 routing policies.
3. THE Api_Stack and the Data_Stack SHALL use only services that the project's plan supports (API Gateway, Lambda, DynamoDB, CloudFormation, CloudWatch Logs), and the Web_Stack SHALL use only S3 and CloudFront.
4. THE CDK app SHALL create IAM roles only through CDK constructs for the Lambda execution role and service roles, and no role under the path `/managed/`.
5. THE CDK app SHALL synthesize without AWS credentials and without Docker (the CI job runs `npm run synth -w infra`), and without the web build output.
6. THE CDK app SHALL bundle the Ws_Handler with a locally installed esbuild, SHALL resolve `@doodle-nearby/core` from `packages/core/src` (not from `dist`), and SHALL NOT require `packages/core` to be built before `cdk deploy`.

---

### Requirement 8: 費用と濫用の抑制

**User Story:** As the project owner, I want the cost to stay near zero when nobody uses the app and to stay bounded when someone abuses it.

#### Acceptance Criteria

1. THE Table SHALL use on-demand (pay-per-request) billing, and no resource SHALL have provisioned capacity or an hourly charge (no NAT gateway, no VPC, no provisioned concurrency, no reserved capacity).
2. THE Api_Stack SHALL set stage-level throttling on the WebSocket API (a rate limit and a burst limit, values chosen in the design).
3. THE Ws_Handler SHALL have a timeout of at most 15 seconds and a memory size chosen in the design, and its log group SHALL have a retention of at most 14 days.
4. THE Api_Stack SHALL NOT enable API Gateway access logging or execution logging (they need an account-wide CloudWatch Logs role setting that this Spec does not manage).
5. THE Lambda concurrent-execution limit of the account is 1,000 in ap-southeast-2 (raised from 10; checked with `GetAccountSettings`). THE design SHALL state how this limit and the stage throttling affect the app, and the CDK app SHALL NOT set reserved concurrency.
6. THE docs SHALL tell the project owner to set a spend limit in AWS Settings > Billing and to check it when the app stops responding with access-denied errors.
7. THE docs SHALL state that the project owner is asked whether to delete or keep the resources after Contest_End. No resource SHALL be deleted automatically.

---

### Requirement 9: CDK スタックの構成と運用

**User Story:** As a developer, I want the stacks to be safe to update and deploy through the existing CD, so that the URL stays up until Contest_End.

#### Acceptance Criteria

1. THE CDK app SHALL define `DoodleNearbyDataStack`, `DoodleNearbyApiStack`, and `DoodleNearbyWebStack`, with references in one direction only (Web_Stack → Api_Stack → Data_Stack).
2. THE Data_Stack SHALL enable termination protection and SHALL retain the Table when the stack is deleted (`RemovalPolicy.RETAIN`) while the app is live. THE docs SHALL describe how to switch to deletion after Contest_End.
3. THE CDK app SHALL NOT set an explicit physical name for the Table, the Lambda function, or the API, except the bucket name required by requirement 1.1.
4. WHEN `cd.yml` runs `npx cdk deploy 'DoodleNearby*' --require-approval never`, THE CDK app SHALL deploy all three stacks in dependency order without a prompt.
5. WHEN `cd.yml` reads outputs, `DoodleNearbyWebStack` SHALL provide `WebBucketName` and `WebDistributionId` (the CD job fails when either is missing).
6. THE Web_Stack's bucket name SHALL match the `doodle-nearby-web-*` resource pattern that `GithubOidcStack` allows for S3 access, so that the CD role can sync the bucket without any policy change.
7. THE CDK app SHALL NOT use `--hotswap` or `--express` in any workflow or document.
8. THE `infra/lib/constants.ts` SHALL hold the shared names (stage name `ws`, stack names, TTL margin) used by the stacks, the handler, and the tests.

---

### Requirement 10: テストと動作確認

**User Story:** As a developer, I want automated checks for the new code and one repeatable end-to-end check after each deploy, so that I find problems before judges do.

#### Acceptance Criteria

1. THE repository SHALL contain unit tests (Vitest) for the Ws_Handler that use a fake `RoomStore`-backed `RoomService`, a fake connection-state store, and a fake management-API client, covering requirements 3.3 to 3.9 and 5.3 to 5.5.
2. THE repository SHALL contain CDK assertion tests that check, on the synthesized templates: the bucket blocks public access; the distribution uses origin access control and has a `/ws` behavior with caching disabled that does not forward the `Host` header; the Ws_Handler may manage connections of the WebSocket API only (not of other APIs, when the API-scoped grant works); the Table is on-demand with TTL enabled; the WebSocket stage is named `ws` and has throttling; the Lambda runtime is Node.js 22 on arm64; the required outputs exist; no resource is outside the Selected_Region; no Lambda@Edge function exists.
3. THE repository SHALL contain an opt-in integration test (skipped unless `RUN_AWS_INTEGRATION=1`) that creates a temporary table with the same schema in the Selected_Region, runs `runRoomStoreContract` against the Dynamo_Store, also stores 50 Drawings of about 30KB each in one room and checks that `listDrawings` returns all 50 in `seq` order, and deletes the table, including when a test fails.
4. THE repository SHALL contain a smoke-test script `npm run smoke -- <PublicUrl>` that opens two WebSocket clients through the Public_URL, creates a room by code, joins with the second client, sends a drawing, checks that both clients receive it, and then leaves, and SHALL exit with a non-zero code when any step fails.
5. THE existing checks (`npm run lint`, `npm run typecheck`, `npm test`, `npm run synth -w infra`) SHALL pass, and the opt-in integration test and the smoke test SHALL NOT run in CI.
6. THE property tests of local-prototype (Property 12 and others for `RoomStore`) SHALL be the source of truth for store behavior. This Spec SHALL NOT duplicate them.

---

### Requirement 11: 審査員向けの説明と運用の文書

**User Story:** As a judge or the project owner, I want clear English instructions, so that I can try the app and the owner can operate it until Contest_End.

#### Acceptance Criteria

1. THE repository SHALL contain `docs/deploy.md` in English with: the architecture in one diagram; the first-time manual steps (bootstrap check, the order of deploying `GithubOidcStack`, setting `AWS_ROLE_ARN`, `AWS_REGION`, and `DEPLOY_ENABLED`); how to run the smoke test; the service limits that affect users (10-minute idle, 2-hour connection); how to find out and fix a stopped app (spend limit, quota); and how to delete the stacks after Contest_End.
2. THE repository SHALL contain `docs/judges.md` in English with: the Public_URL placeholder to fill in after the first deploy; how to try the app with one device (open the URL, allow or deny the location, create a room, draw, send) and with two devices or two browser tabs; and what happens when the connection is lost.
3. THE docs SHALL contain no secret and no account ID.
4. THE root `README.md` and `apps/*/README.md` SHALL NOT be changed by this Spec, except one link line in the root README to `docs/deploy.md` if the owner agrees.
