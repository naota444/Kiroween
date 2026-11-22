# Implementation Plan: repo-and-ci

## Overview

実装言語は TypeScript（strict）。まず1人（または全員）でルート設定とパッケージの骨組みを作り（タスク 1、2）、その後は次の3つのトラックに分かれて並行して進める。トラック間でファイルが重ならないようにしてある。

| トラック | 担当範囲 | タスク |
|---|---|---|
| A: core | `packages/core` のメッセージ型、パーサー、部屋一覧の並べ替え、README の表 | 3、4、5 |
| B: infra | `infra` の `GithubOidcStack` と `bin/infra.ts` | 6 |
| C: リポジトリ・CI/CD | `.gitignore`、CI/CD ワークフロー、PR テンプレート、CODEOWNERS、steering 追記、`tests/repo/` | 7、8、9 |

タスク 1、2 が終わるまで、トラック A〜C は開始しない。最後にタスク 10 で全体を確認する。

## Tasks

- [x] 1. ルート設定とパッケージの骨組み（全トラックの前提）
  - [x] 1.1 ルートの共通設定ファイルを作る
    - ルート `package.json`（`private`、`type: module`、`workspaces`（`packages/core` を先頭）、`engines`、`build` / `typecheck` / `lint` / `format` / `test` スクリプト）
    - ルート `tsconfig.json`（`strict`、`composite`、`NodeNext`、`pretty: false`、`files: []`、5パッケージへの `references`）
    - `eslint.config.mjs`（flat config、`typescript-eslint` recommended、`apps/web` にだけ `react-hooks`、`ignores` に `dist` / `cdk.out` / `node_modules` / `.kiro`）
    - `.prettierrc.json`、`.prettierignore`
    - `vitest.config.ts`（`projects: ['apps/*', 'packages/*', 'backend/*', 'infra', 'tests']`）と `vitest.shared.ts`（`coreAlias`）
    - ルートの `devDependencies`: typescript、vitest、fast-check、eslint 一式、prettier、tsx、yaml、aws-cdk-lib、constructs、aws-cdk
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.13_

  - [x] 1.2 5つのワークスペースパッケージと `tests/` の骨組みを作る
    - `packages/core`（`@doodle-nearby/core`、`src/index.ts` は空の `export {}`、`main` / `types` / `exports`、`tsconfig.json`、`vitest.config.ts`、スモークテスト）
    - `backend/lambdas`（`src/index.ts` は `core` を import するだけ、`references` で `core` を参照）
    - `apps/local-server`（`src/index.ts`、`start: tsx src/index.ts`）
    - `apps/web`（Vite + React + TypeScript、`dev` / `build`、`jsdom` の `vitest.config.ts`、`index.html`、最小の `App`）
    - `infra`（`cdk.json`、空の `App` だけを作る `bin/infra.ts`、`synth: cdk synth --no-lookups`、`lib/constants.ts` に repo / branch / `WEB_BUCKET_PREFIX`）
    - `tests/vitest.config.ts` と `tests/repo/smoke.test.ts`（`package.json` は置かない）
    - すべてのパッケージにスモークテストを1つ置く（Vitest はテストが0件だと失敗するため）
    - `packages/core/src/index.ts` 以外のパッケージは `core` を `vitest.shared.ts` の `coreAlias` で解決する
    - _Requirements: 1.1, 1.2, 1.5, 1.9, 1.10, 1.11, 1.12, 4.4_

- [x] 2. Checkpoint - 骨組みの確認
  - `npm install`、`npm run build`、`npm run typecheck`、`npm run lint`、`npm test` がルートで通ることを確認する。
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. 【トラック A】core のメッセージ型とパーサー
  - [x] 3.1 メッセージ型と定数を定義し、`index.ts` の再エクスポートを整える
    - `packages/core/src/messages.ts` に `MAX_MESSAGE_BYTES`、`MAX_ROOMS`、`GEOHASH_ALPHABET`、`GEOHASH_LENGTH`、`MAX_AI_TEXT_LENGTH`、`MAX_ERROR_MESSAGE_LENGTH`、`ErrorCode`、`Join`、`Leave`、`DrawingSubmit`（2メンバーの共用体との交差型）、`ClientMessage`、`RoomSummary`、`RoomList`、`AiComment`、`AiPrompt`、`AiCard`、`ErrorMessage`、`ServerMessage` を定義する
    - `src/index.ts` で `messages`、`parser`、`room-list`、`message-specs` を `export *` する。後続タスクが同じファイルを触らないよう、`parser.ts`、`room-list.ts`、`message-specs.ts` は中身が `export {};` の仮ファイルを置く
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 1.9_

  - [x] 3.2 パーサーを実装する
    - `packages/core/src/parser.ts` に `ParseResult<T>`、`parseClientMessage`、`parseServerMessage` を実装する
    - 入口で `try { JSON.parse } catch` を使い throw しない。検査順は、サイズ（クライアント側のみ、`TextEncoder` で UTF-8 バイト長）、JSON、`type`、必須フィールド、型・範囲・形式
    - `isGeohash`、`isRoomCode`、`codePointLength` などの小さな検査関数に分け、既知のフィールドだけを出力に残す。スキーマライブラリは使わない
    - _Requirements: 2.3, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12_

  - [ ]* 3.3 ジェネレーターとラウンドトリップのプロパティテストを書く
    - `packages/core/src/test-arbitraries.ts`（`index.ts` から公開しない）に、有効な全メッセージ型のジェネレーターを作る。日本語はひらがな・カタカナ・漢字とサロゲートペアの絵文字から作り、コードポイント数で 1〜40 を保証する
    - `packages/core/src/parser.test.ts` に Property 1 を書く（`numRuns: 100`、タグコメント付き）
    - **Property 1: メッセージのラウンドトリップ**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10**

  - [ ]* 3.4 パーサーが throw しないことのプロパティテストを書く
    - `parser.test.ts` に追記する。任意の文字列（壊れた JSON、オブジェクトでない JSON 値、深い入れ子を含む）で例外が出ず、`ok: true` なら `value.type` がその方向の共用体のものであることを確かめる
    - **Property 2: パーサーは throw せず、結果を返す**
    - **Validates: Requirements 2.12**

  - [ ]* 3.5 無効なメッセージの拒否のプロパティテストを書く
    - `parser.test.ts` に追記する。必須フィールド削除は `missing_field`、方向外の `type` は `unknown_type`、不正な `geohash` / `roomCode`、範囲外の AI テキストとエラーメッセージ、不正な `participantCount`、51件以上の `rooms`、`DrawingSubmit` の両方 null と両方非 null は `invalid_field` になることを確かめる
    - **Property 3: 無効なメッセージは理由つきで拒否される**
    - **Validates: Requirements 2.3, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12**

  - [ ]* 3.6 サイズ上限のプロパティテストを書く
    - `parser.test.ts` に追記する。`imageData` の長さを変えた `DrawingSubmit` で、JSON の UTF-8 バイト長が 32,768 以下なら受理、超えたら `message_too_large` になることを確かめる
    - **Property 4: クライアントメッセージのサイズ上限**
    - **Validates: Requirements 2.5**

  - [ ]* 3.7 メッセージ型の型レベルテストを書く
    - `packages/core/src/messages.test.ts` に `expectTypeOf` で `ClientMessage` と `ServerMessage` のメンバーが厳密であることを確かめる
    - `DrawingSubmit` の両方 null と両方非 null が `@ts-expect-error` でコンパイルエラーになることを確かめる
    - _Requirements: 2.1, 2.2, 2.11_

- [ ] 4. 【トラック A】部屋一覧の並べ替え
  - [ ] 4.1 `orderRoomSummaries` を実装する
    - `packages/core/src/room-list.ts` に `RoomCandidate` と `orderRoomSummaries` を実装する。`sameHash: true` を先に、それぞれの中で `distance` 昇順（安定ソート）、先頭 `MAX_ROOMS` 件を返す
    - geohash の距離計算は含めない（計算済みの `distance` を受け取るだけ）
    - _Requirements: 2.6_

  - [ ]* 4.2 並べ替えのプロパティテストを書く
    - `packages/core/src/room-list.test.ts` に書く。長さが入力と 50 の小さい方、`sameHash: true` が先、同じ `sameHash` 内で `distance` 昇順、結果は入力の部分集合であることを確かめる
    - **Property 5: 部屋一覧の順序**
    - **Validates: Requirements 2.6**

- [ ] 5. 【トラック A】メッセージ一覧と README の表
  - [ ] 5.1 `MESSAGE_SPECS` と core の README を作る
    - `packages/core/src/message-specs.ts` に `MessageSpec` と `MESSAGE_SPECS` を作る。`satisfies Record<ClientMessage['type'] | ServerMessage['type'], MessageSpec>` 形式のオブジェクトから配列を作り、型を足してレジストリを更新し忘れるとコンパイルエラーになるようにする
    - `packages/core/README.md` に、型ごとの方向とすべてのフィールド名を並べた Markdown の表を書く（`Type | Direction | Fields`）
    - _Requirements: 2.13, 2.14_

  - [ ]* 5.2 README の表とレジストリの対応テストを書く
    - `packages/core/src/readme.test.ts` に書く。README を読み、`MESSAGE_SPECS` の各行と各フィールド名が表にあることを確かめる。表にない型があれば失敗する
    - _Requirements: 2.13, 2.14_

- [ ] 6. 【トラック B】infra: GithubOidcStack
  - [x] 6.1 `GithubOidcStack` を実装する
    - `infra/lib/github-oidc-stack.ts` に作る。コンテキスト `githubOidcProviderArn` があれば `OidcProviderNative.fromOidcProviderArn`、なければ `OidcProviderNative`（URL `https://token.actions.githubusercontent.com`、`clientIds: ['sts.amazonaws.com']`）。使用中の `aws-cdk-lib` で `OidcProviderNative` が使えなければ `OpenIdConnectProvider` に切り替える
    - ロール `GithubActionsRole`: `FederatedPrincipal` に `sts:AssumeRoleWithWebIdentity`、条件は `StringEquals` で `aud` と `sub`（`repo:naota444/Kiroween:ref:refs/heads/main`、ワイルドカードなし）、`maxSessionDuration` 3600 秒
    - インラインの権限は4つだけ: ブートストラップロール4種への `sts:AssumeRole`、`DoodleNearby*` スタックへの `cloudformation:DescribeStacks`、`doodle-nearby-web-*` バケットの `s3:ListBucket` / `PutObject` / `DeleteObject` / `GetObject`、`cloudfront:CreateInvalidation`。マネージドポリシーは付けない
    - 出力 `GithubActionsRoleArn` と `GithubOidcProviderArn`
    - ほかのスタックを参照せず、参照もされない
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

  - [ ] 6.2 `bin/infra.ts` に組み込み、認証なしで synth できるようにする
    - `GithubOidcStack` を1つ作る。`env` は `CDK_DEFAULT_ACCOUNT` と `CDK_DEFAULT_REGION` が両方あるときだけ渡す（Region の固定値は書かない）
    - 環境依存のルックアップを使わず、`npm run synth -w infra`（`--no-lookups`）が AWS 認証なしで通ることを確かめる
    - _Requirements: 1.12, 4.5, 6.7_

  - [ ]* 6.3 `GithubOidcStack` のテストを書く
    - `infra/lib/github-oidc-stack.test.ts` に `Template.fromStack` で書く: プロバイダー1つ（URL、`ClientIdList`）、ロール1つ、信頼ポリシーの `StringEquals` が `aud` / `sub` の完全一致でワイルドカードなし、`MaxSessionDuration: 3600`、マネージドポリシーなし、`Action: '*'` と `Resource: '*'` の組み合わせなし、出力 `GithubActionsRoleArn`
    - `githubOidcProviderArn` を渡したときはプロバイダーを作らないこと、単独の `App` で synth できることも確かめる
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

- [x] 7. 【トラック C】.gitignore
  - [x] 7.1 ルートの `.gitignore` を作る
    - 設計どおりの内容（`node_modules/`、`dist/`、`cdk.out/`、`coverage/`、`*.tsbuildinfo`、`.env`、`.env.*`、`!.env.example`、`.DS_Store`、`Thumbs.db`、`.vscode/`、`.idea/`）。`.kiro` に一致しうるパターンは書かない
    - リポジトリに `.gitignore` がルートの1つだけであることを保つ
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.8_

  - [ ]* 7.2 `.kiro` が無視されないことのプロパティテストを書く
    - `tests/repo/gitignore.test.ts` に書く。一時ディレクトリで `git init` し、リポジトリの `.gitignore` をコピーして、`git check-ignore --no-index --stdin` で任意の深さ・任意の名前の `.kiro/` 下のパスが無視されないことを確かめる
    - **Property 6: `.kiro` は無視されない**
    - **Validates: Requirements 3.3, 3.5, 3.6**

  - [ ]* 7.3 除外対象と例外のプロパティテストと、`.gitignore` の個数の例示テストを書く
    - `tests/repo/gitignore.test.ts` に追記する。`node_modules/`、`dist/`、`cdk.out/`、`.vscode/`、`.idea/` 下のパス、`.env`、`.env.<名前>`、`.DS_Store`、`Thumbs.db` が無視され、`.env.example` が無視されないことを確かめる。あわせて、ルート以外に `.gitignore` がないことを確かめる
    - **Property 7: 除外対象は無視され、例外は無視されない**
    - **Validates: Requirements 3.1, 3.2, 3.4, 3.7, 3.8**

- [ ] 8. 【トラック C】GitHub Actions の CI / CD
  - [x] 8.1 CI ワークフロー `.github/workflows/ci.yml` を作る
    - トリガーは `pull_request`（`branches: [main]`、`types: [opened, synchronize, reopened]`）、`permissions: contents: read`、`defaults.run.shell: bash`、`concurrency`
    - `lint`、`typecheck`、`test`、`synth` の4ジョブ。`needs` を持たず並列、`timeout-minutes: 15`。準備ステップは `actions/cache`（キーは `hashFiles('package-lock.json')`）で、キャッシュがなければ `npm ci`
    - `synth` は `AWS_EC2_METADATA_DISABLED=true`、`CDK_DISABLE_VERSION_CHECK=1` を設定して `npm run synth -w infra`
    - `ci-ok` ジョブ（`needs` は4つ、`if: always()`）は、結果が `success` 以外のものがあれば `exit 1`
    - AWS 認証ステップは置かない
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_

  - [ ] 8.2 CD ワークフローと失敗サマリーのスクリプトを作る
    - `.github/workflows/cd.yml`: `push` の `branches: [main]`、`permissions: id-token: write` と `contents: read`、`defaults.run.shell: bash`、`concurrency: group: cd`（`cancel-in-progress: false`）
    - `deploy` ジョブに `if: vars.DEPLOY_ENABLED == 'true'`、`timeout-minutes: 30`、`environment:` は指定しない。長期キーの secrets は参照しない
    - ステップ順: checkout、setup-node、cache、`npm ci`、`configure-aws-credentials`（`vars.AWS_ROLE_ARN`、`vars.AWS_REGION`）、`cdk deploy 'DoodleNearby*' --require-approval never`（`tee` でログを `$RUNNER_TEMP/logs` に保存）、スタック出力から `WebBucketName` と `WebDistributionId` を取得、`apps/web` のビルド、`aws s3 sync --delete`、`cloudfront create-invalidation`
    - 最後に `if: failure()` のステップで `.github/scripts/job-summary.sh` を実行する。スクリプトは `STEPS_JSON` から失敗したステップ ID を `jq` で取り、名前と、ログ末尾50行（ログがなければ「ログなし」）を `$GITHUB_STEP_SUMMARY` に書く
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11_

  - [ ]* 8.3 ワークフローの構造テストを書く
    - `tests/repo/workflows.test.ts` に `yaml` で書く。CI: トリガー、4ジョブに `needs` がない、`timeout-minutes <= 15`、`actions/cache` と `hashFiles('package-lock.json')`、`ci-ok` の `if: always()`、`--no-lookups` の使用
    - CD: 全ジョブに `if: vars.DEPLOY_ENABLED == 'true'`、`permissions.id-token: write`、`secrets.AWS_ACCESS_KEY_ID` などを参照しない、`environment:` がない、`s3_sync` が `web_build` の後にある、`DEPLOY_ENABLED` を `'true'` にするだけで動く構造（ワークフローに固定値を持たない）
    - `ci.yml` と `cd.yml` のトップレベルに `defaults.run.shell == 'bash'` がある
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 5.1, 5.2, 5.5, 5.6, 5.7, 5.9, 5.11_

- [ ] 9. 【トラック C】リポジトリ補助ファイルと steering 追記
  - [ ] 9.1 PR テンプレートと CODEOWNERS を作る
    - `.github/pull_request_template.md`: 見出しはちょうど3つ（`What changed`、`Spec and task`、`How it was verified`）
    - `.github/CODEOWNERS`: `/packages/core/` と `/.kiro/steering/` の2行。所有者は `@naota444 @takakisae @JTakahashi03`
    - _Requirements: 7.1, 7.3, 7.4, 7.5_

  - [ ] 9.2 steering に追記する
    - `.kiro/steering/tech.md` の「重要なルール」の後に、AWS リソースの命名規約の節を追加する（アプリスタック名 `DoodleNearby*`、Web バケット名 `doodle-nearby-web-*`、出力 `WebBucketName` / `WebDistributionId`、必要なら `WebSocketUrl`）
    - `.kiro/steering/structure.md` のフォルダ構成の図に `tests/` 行を足し、`tests/repo/` がどのパッケージにも属さないリポジトリ全体の検査用であることを1〜2行で説明する
    - 既存の文面は変更せず、追記だけにする
    - _Requirements: 8.1, 8.2, 8.3_

  - [ ]* 9.3 PR テンプレート・CODEOWNERS・steering のテストを書く
    - `tests/repo/templates.test.ts`: PR テンプレートの `## ` 見出しがちょうど3つ、CODEOWNERS に2つのパスがあり、それぞれの所有者が3人
    - `tests/repo/steering.test.ts`: `tech.md` に `DoodleNearby*`、`doodle-nearby-web-*`、`WebBucketName`、`WebDistributionId` が含まれ、`structure.md` に `tests/repo` が含まれる
    - _Requirements: 7.1, 7.4, 7.5, 8.1, 8.2, 8.4_

- [ ] 10. Final checkpoint - 全体の確認
  - ルートで `npm run build`、`npm run typecheck`、`npm run lint`、`npm test` が通り、`npm run synth -w infra` が AWS 認証なしで通ることを確認する。
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- `*` 付きのタスクは任意で、MVP を急ぐ場合はスキップできる
- 各タスクは要件の番号を参照している。プロパティテストは設計書のプロパティ番号を参照している
- 3人の分担案: トラック A は core 担当、トラック B は infra 担当、トラック C は CI/CD・リポジトリ担当。タスク 1、2 が完了したら、3つのトラックは互いに待たずに進められる
- 同じファイルを触るタスク（`parser.test.ts` の 3.3〜3.6、`gitignore.test.ts` の 7.2〜7.3）は、依存グラフで別の波に分けてある
- `packages/core/src/index.ts` はタスク 3.1 で完成させ、以降のタスクは触らない
- 次の項目はコードでは完結しないため、タスクに含めない: `main` の ruleset 設定、リポジトリ変数の登録、`GithubOidcStack` の初回デプロイと `cdk bootstrap`、CODEOWNERS のオーナー3人への書き込み権限の付与、`docs/` の手順書
- Kiro のタスク実行では、チェックポイントで失敗したら該当トラックの担当者に戻す

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2"] },
    { "id": 3, "tasks": ["3.1", "6.1", "7.1", "8.1", "9.1", "9.2"] },
    { "id": 4, "tasks": ["3.2", "3.7", "4.1", "5.1", "6.2", "7.2", "8.2", "9.3"] },
    { "id": 5, "tasks": ["3.3", "4.2", "5.2", "6.3", "7.3", "8.3"] },
    { "id": 6, "tasks": ["3.4"] },
    { "id": 7, "tasks": ["3.5"] },
    { "id": 8, "tasks": ["3.6"] },
    { "id": 9, "tasks": ["10"] }
  ]
}
```
