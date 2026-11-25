# Requirements Document

## Introduction

3人が並行して開発できる npm workspaces モノレポの土台を作る。
フォルダ構成の確立、TypeScript の共通設定、WebSocket メッセージ型の定義、GitHub Actions による CI/CD、AWS 認証用 OIDC ロール、steering への命名規約の追記をこの Spec でまとめて作る。
他の Spec（画面・AI・インフラ）はここで作ったパッケージ構成と型定義を前提とするため、最初に完成させる。

## Glossary

- **Monorepo**: npm workspaces を使い、1つのリポジトリに複数パッケージを置く構成
- **Core**: `packages/core` に置く共通パッケージ。メッセージ型、部屋ロジック、interface を含む
- **WebSocket_Message**: サーバーとクライアントがやり取りする型付きメッセージ。`packages/core` で定義する
- **CI**: GitHub Actions による Pull Request 時の自動チェック（lint・型チェック・テスト・cdk synth）
- **CD**: GitHub Actions による main マージ後の自動デプロイ（CDK + フロントエンドのビルド・アップロード）
- **OIDC_Stack**: GitHub Actions が AWS へアクセスするための IAM ロールを定義する CDK スタック（`GithubOidcStack`）
- **OIDC_Role**: GitHub OIDC プロバイダーを信頼する IAM ロール。このリポジトリの main ブランチだけが引き受けられる
- **RoomList**: 近くの部屋一覧をクライアントへ送るメッセージ型
- **Join**: クライアントが部屋への参加を要求するメッセージ型
- **Leave**: クライアントが部屋からの退出を通知するメッセージ型
- **DrawingSubmit**: クライアントが描いた絵をサーバーへ送るメッセージ型
- **AiComment**: AI 司会者が生成したコメントをクライアントへ送るメッセージ型
- **AiPrompt**: AI 司会者が生成した協力お題をクライアントへ送るメッセージ型
- **AiCard**: 部屋退出時に渡す交換カード情報をクライアントへ送るメッセージ型
- **ErrorMessage**: エラー内容をクライアントへ送るメッセージ型
- **DEPLOY_ENABLED**: CD の有効・無効を切り替える GitHub リポジトリ変数。値が文字列 `'true'` のときだけ CD ワークフローのジョブが実行される。初期状態では未設定（無効）。OIDC_Role の ARN を保存する変数とは別物である
- **Geohash**: 緯度経度を6文字の文字列に丸めた位置表現（約1.2km×0.6km）

---

## Requirements

### Requirement 1: モノレポ骨組み

**User Story:** As a developer, I want an npm workspaces monorepo with the specified folder structure, so that all three team members can develop their layers in parallel without stepping on each other.

#### Acceptance Criteria

1. THE Monorepo SHALL contain the workspace packages `apps/web`, `apps/local-server`, `packages/core`, `backend/lambdas`, and `infra` declared in the root `package.json` `workspaces` field.
2. THE Monorepo SHALL include a root-level `tsconfig.json` with `strict: true` that all workspace packages extend via their own `tsconfig.json` using the `extends` field pointing to the root config.
3. THE Monorepo SHALL include a root-level ESLint configuration file that all workspace packages inherit by default through ESLint's config lookup chain, with no duplicate rule definitions in individual packages.
4. THE Monorepo SHALL include a root-level Prettier configuration file that all workspace packages inherit by default through Prettier's config lookup chain, with no duplicate rule definitions in individual packages.
5. THE Monorepo SHALL include a root-level Vitest configuration file; each workspace package MAY override it by placing a local `vitest.config.ts` in its own directory.
6. WHEN a developer runs `npm install` from the repository root, THE Monorepo SHALL install dependencies for all workspace packages without requiring any additional commands.
7. WHEN a developer runs `npm run build` from the repository root, THE Monorepo SHALL build all workspace packages in dependency order such that `packages/core` completes before any package that depends on it.
8. WHEN a developer runs `npm test` from the repository root, THE Monorepo SHALL execute tests in all workspace packages and exit with a non-zero code if any package's tests fail.
9. THE `packages/core` package SHALL export its public API exclusively via a single `index.ts` entry point, and the package's `package.json` `main` field SHALL reference its compiled output.
10. THE `apps/web` package SHALL be scaffolded with Vite and React using the TypeScript template, such that running `npm run dev` inside `apps/web` starts a local development server.
11. THE `apps/local-server` package SHALL be scaffolded as a TypeScript Node.js application with a `src/index.ts` entry point and a `start` script defined in its `package.json`.
12. THE `infra` package SHALL be scaffolded as a TypeScript AWS CDK application with a `cdk.json` file at its root and a `bin/` entry point that instantiates at least one CDK Stack.
13. IF `npm run build` is run from the repository root and any workspace package's TypeScript compilation produces a type error, THEN THE Monorepo SHALL exit with a non-zero code and print the file path and line number of each error to standard error.

---

### Requirement 2: WebSocket メッセージ型

**User Story:** As a developer, I want all WebSocket message types defined in `packages/core` and shared between server and client, so that the contract between the three team members is explicit and type-safe.

#### Acceptance Criteria

1. THE Core package SHALL define a discriminated union type `ClientMessage` whose discriminant field is `type` and whose members are exactly `Join`, `Leave`, and `DrawingSubmit`.
2. THE Core package SHALL define a discriminated union type `ServerMessage` whose discriminant field is `type` and whose members are exactly `RoomList`, `AiComment`, `AiPrompt`, `AiCard`, and `ErrorMessage`.
3. THE `Join` message type SHALL include the fields: `type: "join"`, `roomId: string | null`, `geohash: string` (exactly 6 characters, geohash alphabet only), and `roomCode: string | null` (exactly 4 digits when non-null).
4. THE `Leave` message type SHALL include the fields: `type: "leave"` and `roomId: string`.
5. THE `DrawingSubmit` message type SHALL include the fields: `type: "drawing_submit"`, `roomId: string`, `imageData: string | null` (base64-encoded PNG, at most 32,768 bytes of encoded text including all other fields of the message), and `imageKey: string | null` (object storage key, used when the PNG exceeds the inline limit).
6. THE `RoomList` message type SHALL include the fields: `type: "room_list"` and `rooms: RoomSummary[]` (at most 50 entries, ordered with `sameHash: true` entries first and then by distance from the requester's cell, nearest first), where `RoomSummary` has `roomId: string`, `roomCode: string`, `geohash: string`, `participantCount: number` (integer, 0 or greater), and `sameHash: boolean`.
7. THE `AiComment` message type SHALL include the fields: `type: "ai_comment"`, `roomId: string`, and `text: string` (1 to 40 characters in Japanese).
8. THE `AiPrompt` message type SHALL include the fields: `type: "ai_prompt"`, `roomId: string`, and `text: string` (1 to 40 characters in Japanese).
9. THE `AiCard` message type SHALL include the fields: `type: "ai_card"`, `roomId: string`, `text: string` (1 to 40 characters in Japanese), and `imageKey: string`.
10. THE `ErrorMessage` message type SHALL include the fields: `type: "error"`, `code: string` (one of a fixed set of codes defined in `packages/core`), and `message: string` (1 to 200 characters).
11. THE `DrawingSubmit` message type SHALL require that exactly one of `imageData` or `imageKey` is non-null; a value in which both are null or both are non-null SHALL cause a TypeScript compile error in strict mode.
12. IF a received WebSocket message is not valid JSON, has a `type` value outside its direction's union, or lacks a required field (a missing key, including a missing `type` key, is reported as `missing_field`, distinct from a key present with an invalid value), THEN THE Core package SHALL provide a message parser that rejects it and returns a result identifying the failure, without throwing, so that the server can send an `ErrorMessage` and keep the connection open.
13. THE Core package README SHALL contain a Markdown table with one row per message type, listing the direction (Client→Server or Server→Client) and every field name of that type.
14. WHEN a new message type is added to `packages/core`, THE Core package SHALL fail an automated test if the README table does not contain a row for that type.

---

### Requirement 3: .gitignore

**User Story:** As a developer, I want a `.gitignore` that excludes build artifacts and secrets but always keeps `.kiro/`, so that the Kiroween submission requirement is satisfied.

#### Acceptance Criteria

1. THE Repository SHALL contain exactly one `.gitignore` file at the repository root.
2. THE `.gitignore` file SHALL contain a pattern that excludes each of the following: `node_modules/`, `dist/`, `.env`, `.env.*`, and `cdk.out/`.
3. THE `.gitignore` file SHALL NOT contain any pattern, including wildcard patterns, that causes git to ignore `.kiro` or any file inside `.kiro/`.
4. THE `.gitignore` file SHALL contain a pattern that excludes each of the following: `.DS_Store`, `Thumbs.db`, `.vscode/`, and `.idea/`.
5. WHEN a developer runs `git check-ignore -v .kiro` in the repository root, THE Repository SHALL produce no output and exit with status 1, which indicates that `.kiro` is not ignored.
6. WHEN a developer runs `git status` after adding files to `.kiro/` and before staging them, THE Repository SHALL list those files as untracked, not as ignored. WHEN the developer runs `git add .kiro/` and then `git status`, THE Repository SHALL list those files as staged for commit.
7. WHEN a developer creates files named `.env`, `.env.local`, `node_modules/x`, `dist/x`, and `cdk.out/x` and runs `git status`, THE Repository SHALL NOT list any of those files as untracked or staged.
8. IF a developer wants to commit an example environment file such as `.env.example`, THEN THE `.gitignore` file SHALL NOT exclude `.env.example`.

---

### Requirement 4: GitHub Actions — CI (Pull Request)

**User Story:** As a developer, I want automated checks to run on every pull request, so that broken code is caught before it reaches main.

#### Acceptance Criteria

1. WHEN a pull request is opened, updated with new commits, or reopened against the `main` branch, THE CI workflow SHALL start a run.
2. WHEN the CI workflow runs, THE CI workflow SHALL execute lint checks across all workspace packages (`apps/web`, `apps/local-server`, `packages/core`, `backend/lambdas`, `infra`) and report the check as passed only if every package finishes with zero lint errors.
3. WHEN the CI workflow runs, THE CI workflow SHALL execute TypeScript type checks in strict mode across all workspace packages and report the check as passed only if every package finishes with zero type errors.
4. WHEN the CI workflow runs, THE CI workflow SHALL execute Vitest tests in single-run mode (no watch mode) across all workspace packages and report the check as passed only if every test passes and at least one test file is found.
5. WHEN the CI workflow runs, THE CI workflow SHALL execute `cdk synth` in the `infra` package and report the check as passed only if synthesis completes with exit code 0 and without requiring AWS credentials.
6. IF any step fails, THEN THE CI workflow SHALL continue running the remaining check steps, mark the pull request check as failed, and block merging while failing.
7. WHEN the CI workflow restores dependencies, THE CI workflow SHALL cache `node_modules` using the `actions/cache` action with a key derived from the hash of `package-lock.json`, so that a run with an unchanged `package-lock.json` restores the cache instead of reinstalling all dependencies.
8. IF any single CI run exceeds 15 minutes, THEN THE CI workflow SHALL cancel the run and mark the pull request check as failed.

---

### Requirement 5: GitHub Actions — CD (main マージ後)

**User Story:** As a developer, I want an automated deployment workflow on main merges, so that approved code reaches the production environment without manual steps.

#### Acceptance Criteria

1. WHEN a commit is pushed to the `main` branch, THE CD workflow SHALL start a run, and the run SHALL execute its jobs only as specified in criterion 7 (the run itself starts even while DEPLOY_ENABLED is not `'true'`, and its jobs are then skipped).
2. WHILE DEPLOY_ENABLED is `'true'`, WHEN the CD workflow runs, THE CD workflow SHALL obtain temporary AWS credentials by assuming the OIDC_Role through GitHub's OIDC token, and THE CD workflow SHALL use no long-lived AWS access keys stored as GitHub secrets.
3. IF the CD workflow cannot assume the OIDC_Role, THEN THE CD workflow SHALL stop before any deploy step, mark the run as failed, and leave deployed AWS resources unchanged.
4. WHILE DEPLOY_ENABLED is `'true'`, WHEN AWS authentication succeeds, THE CD workflow SHALL execute `cdk deploy --require-approval never` for all application stacks in the AWS selected Region.
5. WHEN `cdk deploy` completes successfully, THE CD workflow SHALL build the `apps/web` frontend, upload the build output to the designated S3 bucket, and invalidate the CloudFront cache so that the new build is served.
6. IF the `apps/web` build fails, THEN THE CD workflow SHALL skip the S3 upload, leave the existing S3 bucket contents unchanged, and mark the run as failed.
7. THE CD workflow SHALL set the condition `if: vars.DEPLOY_ENABLED == 'true'` on every job in the workflow file (the deploy job and any other job), because GitHub Actions does not allow `if` at the workflow level.
8. WHILE DEPLOY_ENABLED is unset, `'false'`, or any value other than `'true'`, WHEN a commit is pushed to the `main` branch, THE CD workflow SHALL skip every job, so that no AWS authentication, `cdk deploy`, S3 upload, or CloudFront invalidation step is executed and deployed AWS resources remain unchanged.
9. WHEN the repository variable DEPLOY_ENABLED is set to `'true'`, THE CD workflow SHALL execute its jobs on the next push to `main` without any edit to the workflow file.
10. THE Repository SHALL have DEPLOY_ENABLED unset in its initial state, so that CD is disabled until the AWS environment is ready and at least one application stack whose name starts with `DoodleNearby` exists on `main`.
11. IF any step of the CD workflow fails, THEN THE CD workflow SHALL mark the run as failed and write the name of the failed step and its error output (the last 50 lines at most) to the GitHub Actions job summary.
---

### Requirement 6: GitHub OIDC IAM ロール (GithubOidcStack)

**User Story:** As a developer, I want the OIDC role defined as infrastructure-as-code in CDK, so that the AWS trust relationship is auditable and reproducible.

#### Acceptance Criteria

1. THE OIDC_Stack SHALL define exactly one GitHub OIDC identity provider whose issuer URL is `token.actions.githubusercontent.com` and whose audience (client ID) is `sts.amazonaws.com`.
2. THE OIDC_Stack SHALL define exactly one OIDC_Role whose trust policy allows only the `sts:AssumeRoleWithWebIdentity` action and only the OIDC identity provider defined in criterion 1 as the federated principal.
3. THE OIDC_Role SHALL include a trust policy condition that requires the audience claim (`aud`) to equal `sts.amazonaws.com` and the subject claim (`sub`) to equal exactly `repo:naota444/Kiroween:ref:refs/heads/main`, with no wildcard characters in the subject value.
4. THE OIDC_Role SHALL have a maximum session duration of 3600 seconds.
5. THE OIDC_Role SHALL be granted only the permissions needed to run CDK deployment and upload files to the S3 bucket for the web app, and SHALL NOT have the `AdministratorAccess` managed policy or any policy with `"Action": "*"` on `"Resource": "*"` attached.
6. WHEN the OIDC_Stack is deployed, THE OIDC_Stack SHALL output the OIDC_Role ARN as a CloudFormation output so it can be copied into a GitHub Actions variable (a variable separate from DEPLOY_ENABLED, which only switches CD on and off) without a manual lookup.
7. THE `GithubOidcStack` SHALL be deployable on its own with `cdk deploy GithubOidcStack`, without requiring any application stack to exist, and SHALL NOT be a dependency of any application stack.
8. IF a GitHub Actions workflow run uses a `sub` claim other than `repo:naota444/Kiroween:ref:refs/heads/main` (for example another branch, a fork, or a pull request), THEN AWS STS SHALL reject the `AssumeRoleWithWebIdentity` request, and the workflow SHALL fail at the credential step without receiving AWS credentials.

---

### Requirement 7: リポジトリ補助ファイル

**User Story:** As a developer, I want a pull request template and CODEOWNERS file, so that every PR includes the right context and critical shared files always get reviewed by at least one of the three team members.

#### Acceptance Criteria

1. THE Repository SHALL include `.github/pull_request_template.md` containing exactly three section headings: one for what changed, one for the Spec name and task number, and one for how the change was verified.
2. WHEN a contributor opens a new pull request on the default branch, THE Repository SHALL pre-fill the pull request description with the contents of `.github/pull_request_template.md`.
3. THE Repository SHALL include the `CODEOWNERS` file at `.github/CODEOWNERS`.
4. THE `CODEOWNERS` file SHALL contain one entry for the path `packages/core/` that lists the GitHub usernames of all three team members as owners, with `@naota444`, `@takakisae`, and `@JTakahashi03` as the owners.
5. THE `CODEOWNERS` file SHALL contain one entry for the path `.kiro/steering/` that lists the same three owners, with `@naota444`, `@takakisae`, and `@JTakahashi03` as the owners.
6. WHERE branch protection (or a ruleset) on `main` requires Code Owner review with a required approving review count of 1, WHEN a pull request modifies a file under `packages/core/` or `.kiro/steering/`, THE Repository SHALL block merging until at least one listed code owner has approved.
7. IF any username listed in `CODEOWNERS` is not a valid GitHub user or lacks write access to the repository, THEN THE Repository SHALL show a CODEOWNERS error on the file's GitHub page, and the owner entry is ignored for review requests.

---

### Requirement 8: steering への追記

**User Story:** As a developer, I want the naming conventions for stack names, bucket names, and output names, and the addition of `tests/repo/`, written in the steering files, so that the three team members and other Specs work from the same assumptions.

#### Acceptance Criteria

1. THE Repository SHALL record in `.kiro/steering/tech.md` the AWS resource naming convention: application stack names start with `DoodleNearby`, the web S3 bucket name starts with `doodle-nearby-web-`, and the stack outputs are `WebBucketName` and `WebDistributionId` (and `WebSocketUrl` when needed).
2. THE Repository SHALL record in `.kiro/steering/structure.md` the `tests/repo/` directory as the location of repository-wide checks that belong to no package.
3. WHEN the steering files are updated, THE Repository SHALL keep all existing text of those files unchanged and only add the new content.
4. IF `tech.md` lacks any of the naming convention strings or `structure.md` lacks `tests/repo`, THEN THE `tests/repo` suite SHALL fail.
