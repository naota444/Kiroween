# Implementation Plan: local-prototype

## Overview

AWS を使わずに、スマホ2台(または PC とスマホ)で「近くの部屋が一覧に出る → 入る → 手描きの絵が相手の画面に出る」までを動かすローカル試作を実装する。Spec 0「repo-and-ci」の土台(モノレポ、tsconfig、ESLint、Prettier、Vitest、CI)は作り直さず、既存の入口に実装を足す。CI(lint / typecheck / test / synth)は、各タスクの終わりに通る状態を保つ。

### タスクのグループ

担当者が別なので、タスクを4つに分ける。W と S は、ファイルが重ならず、契約はメッセージ型(`packages/core` の `messages.ts`、`parser.ts`)だけである。

| グループ | 範囲 | タスク |
|---|---|---|
| 共通の土台 | 依存の追加、メッセージ型、パーサー、`encodeGeohash` / `neighborCells`、`index.ts` の再エクスポート。小さく、すぐ終わる粒度にする | 1、2(チェックポイント) |
| W(画面) | `apps/web`(要件 1〜5) | 3 |
| S(サーバー) | `packages/core` の部屋ロジック、`apps/local-server`(要件 6〜10) | 4 |
| 全体の確認 | 両グループが終わってからのチェックポイントと、実機での確認(手動) | 5 |

共通の土台(タスク 1、2)が終わってから、W(タスク 3)と S(タスク 4)を並行して進める。W は S のコードを呼ばず、S は W のコードを知らない。例外は `encodeGeohash`(共通の土台で作り、W が core から使う)だけである。`apps/web` の依存(`fflate`、`@vitejs/plugin-basic-ssl`)と `apps/local-server` の依存(`ws`)も、`package-lock.json` が衝突しないように、共通の土台のタスク 1.1 でまとめて足す。

### Spec 0 への依存(タスク 4.20 と 4.21)

`packages/core` の `room-list.ts`(`orderRoomSummaries`)と `message-specs.ts`(`MESSAGE_SPECS`)は、Spec 0 のタスク 4.1 と 5.1 で実装される。この時点では、どちらも中身が空(`export {};`)の仮ファイルである。この Spec ではこの2つを作らず、使う側として扱う。design.md の「Spec 0 との依存」に従い、次のように進める。

| Spec 0 のタスク | この Spec での扱い | 該当するタスク |
|---|---|---|
| 4.1 `orderRoomSummaries` | 4.1 が入るまでは、`RoomService` に簡易版(`sameHash` が先、`distance` 昇順、安定)を**注入**して進める(4.5、4.7)。`apps/local-server` も同じ簡易版を使う(4.17)。4.1 が `main` に入ったら、独立したタスク 4.21 で `orderRoomSummaries` に差し替え、簡易版を削除する | 4.5、4.7、4.17、**4.21** |
| 5.1 `MESSAGE_SPECS` | `messages.ts` と `parser.ts` は 5.1 を待たずに進める。5.1 が `main` に入ったら、独立したタスク 4.20 で、新メッセージ8種類を `MESSAGE_SPECS` と core の README の表へ追加する | 1.2、1.3、**4.20** |

- どちらが先に入っても、`satisfies Record<…>` が `MESSAGE_SPECS` の追加漏れをコンパイルエラーで知らせる。この Spec が先に入る場合は、5.1 の実装者が `messages.ts` にあるすべての `type`(新メッセージ8種類を含む)を登録する。その場合、4.20 は「追加済みであることの確認」だけになる。
- 4.20 と 4.21 の前提は、Spec 0 のタスク 5.1 と 4.1 が `main` に入っていること。入っていなければ、そのタスクは保留にして、ほかのタスクを進める。保留のまま最終チェックポイント(タスク 5)に着いたら、その旨を報告する(完了条件の「PC とスマホで絵が互いの上の画面に出る」は、簡易版でも満たせる)。

### 決定事項の反映

- 画面の文言は英語のみ(日本語の補足は Spec 4)。
- `imageKey` の絵は `RoomService` が受け付けない(`invalid_field`)。
- `encodeGeohash` は共通の土台(タスク 1.5)で作り、画面が core から使う。画面は `ngeohash` を直接 import しない。
- `ngeohash` は `"0.6.3"` に完全固定する(`^`、`~` なし)。`@types/ngeohash` は `"0.6.8"`。
- サーバーの絵の検査は、`imageData` の文字数の上限(`MAX_IMAGE_DATA_CHARS`)だけである。PNG の中身は検査しない。
- 同じ接続元 IP の部屋を優先する機能は作らない。
- README は `apps/web/README.md` と `apps/local-server/README.md`(英語)。ルートの `README.md` は変更しない。

### 必須のテストは6つだけ

日程が短いので、必須(`*` なし)のテストのサブタスクは、次の6つだけにする。それ以外のテスト(その他のプロパティテスト、エラー処理の網羅、`ngeohash` の端・極の最小テスト、画面のコンポーネントテスト、契約テストのスイート、`local-server` の統合テストなど)は、任意(`*`)にする。実装タスクの中の最小限のスモークテストは、必須の6つに数えない。

| # | 必須のテスト | タスク | 満たす要件 |
|---|---|---|---|
| ① | 新メッセージのラウンドトリップ(プロパティテスト) | 1.4 | 11.3、11.7、13.4 |
| ② | 近傍(Neighbor_Cells)の対称性(プロパティテスト) | 1.6 | 8.7、13.4 |
| ③ | 部屋の作成と定員(Room_Service の例示テスト) | 4.6 | 6.1、6.3、6.10、6.11、13.1 |
| ④ | 絵の配布先(同じ部屋にだけ配られる。Room_Service のテスト) | 4.9 | 9.1、9.3、9.4、13.1 |
| ⑤ | 期限切れ(置き換え可能なクロックを使う) | 4.11 | 10.5、10.7、10.8、14.6、14.7 |
| ⑥ | 縮小後の PNG の大きさ(画面の変換テスト) | 3.5 | 3.1、3.2、13.8 |

契約テストのスイート(Room_Store、タスク 4.4)は任意にする。③と⑤は、`MemoryRoomStore` を使う `RoomService` のテストで満たす。

## Tasks

- [ ] 1. 【共通の土台】依存、メッセージ型、パーサー、geohash
  - [ ] 1.1 依存パッケージをまとめて追加する
    - 触るファイル: `packages/core/package.json`(`dependencies` に `"ngeohash": "0.6.3"`、`devDependencies` に `"@types/ngeohash": "0.6.8"`)、`apps/local-server/package.json`(`dependencies` に `ws` 8.x、`devDependencies` に `@types/ws` 8.x。`ws` はロックファイルにある 8.23.0 に合わせる)、`apps/web/package.json`(`dependencies` に `fflate` 0.8.x、`devDependencies` に `@vitejs/plugin-basic-ssl` 2.3.x)、`package-lock.json`
    - `ngeohash` と `@types/ngeohash` は `^` や `~` を付けず、完全固定にする。`apps/web` と `apps/local-server` は `ngeohash` を直接依存にしない
    - `.gitattributes` は `* text=auto eol=lf` のまま。新しい行が LF で保存され、改行だけの差分が出ないことを確認する(`.gitattributes` が無ければ作る)
    - Windows では `npm` を `npm.cmd` で呼ぶ(`npm.cmd install`、`npm.cmd run lint` など)
    - `npm audit` で新しい指摘が出ないことを確認する
    - 完了の確認: `npm.cmd install` の後、`npm.cmd run lint`、`npm.cmd run typecheck`、`npm.cmd test`、`npm.cmd run build` が通る。`npm.cmd ci` が成功する(ロックファイルが `package.json` と合っている)
    - _Requirements: 12.9, 8.1, 8.3_

  - [ ] 1.2 メッセージ型と定数を `messages.ts` に追加する
    - 触るファイル: `packages/core/src/messages.ts`(`packages/core/src/index.ts` は `export *` 済みなので触らない)
    - 追加する定数: `MAX_PARTICIPANTS`(8)、`MAX_DRAWINGS_PER_ROOM`(50)、`MAX_IMAGE_SIDE_PX`(512)、`MAX_IMAGE_DATA_CHARS`(30,000)、`PARTICIPANT_COLORS`(8色)、`PARTICIPANT_ICONS`(12種類)
    - 追加する型: `ParticipantColor`、`ParticipantIcon`、`ParticipantIdentity`、`CreateRoom`、`JoinByCode`、`RoomCreated`、`RoomJoined`、`RoomLeft`、`ParticipantJoined`、`ParticipantLeft`、`DrawingAdded`。`ClientMessage` と `ServerMessage` の共用体にメンバーを足す
    - 既存の型(`Join`、`Leave`、`DrawingSubmit`、`RoomList`、`RoomSummary`、`AiComment`、`AiPrompt`、`AiCard`、`ErrorMessage`、`ErrorCode`)と既存の定数は変えない。任意フィールドも足さない
    - `MESSAGE_SPECS`(Spec 0 のタスク 5.1)は、ここでは触らない(タスク 4.20)
    - 完了の確認: `npm.cmd run typecheck`、`npm.cmd run lint`、`npm.cmd test`(既存テストが通る)
    - _Requirements: 11.1, 11.2, 11.9, 11.11, 6.5, 6.10, 9.5_

  - [ ] 1.3 新メッセージのパーサーを `parser.ts` に追加する
    - 触るファイル: `packages/core/src/parser.ts`、`packages/core/src/parser.test.ts`(スモークテストを数件追記)
    - `CLIENT_TYPES` に `create_room`、`join_by_code`、`SERVER_TYPES` に6種類を追加する。`parseClientMessage`、`parseServerMessage` の `switch` は、`default` に頼らず、明示的な `case` に直す(新メッセージが既存のパーサーに誤って入らないようにする)
    - 新メッセージごとの検査関数と `checkIdentity`(`color`、`icon` が定数に含まれること)を足す。必須フィールドなしは `missing_field`、型・範囲・形式の誤りは `invalid_field`。`drawing_added` は `imageData` と `imageKey` の「どちらか一方だけ非 null」を検査する
    - 余分なフィールド(緯度経度を含む)は出力に残さない。例外を投げない。既存メッセージの検査は変えない
    - スモークテスト: 新メッセージ各1件が通ること、必須フィールドなしが `missing_field` になること、反対方向の新メッセージが `unknown_type` になること
    - 完了の確認: `npm.cmd test`(`parser.test.ts` の既存テストと追記分)、`npm.cmd run typecheck`、`npm.cmd run lint`
    - _Requirements: 11.3, 11.4, 11.5, 11.6, 14.2_

  - [ ] 1.4 新メッセージのラウンドトリップのプロパティテストを書く(必須①)
    - 触るファイル: `packages/core/src/parser.test.ts`(追記)
    - 新メッセージ8種類のジェネレーターを作り、JSON に直列化してから対応するパーサーで読むと、`ok: true` で、元のメッセージと深く等しいことを確かめる。1種類につき100ケース以上(`numRuns: 100` 以上)
    - **Property 1: 新メッセージのラウンドトリップ**
    - **Validates: Requirements 11.3, 11.7, 13.4**
    - 完了の確認: `npm.cmd test`、`npm.cmd run lint`、`npm.cmd run typecheck`

  - [ ] 1.5 `encodeGeohash` と `neighborCells` を作る
    - 触るファイル: `packages/core/src/geohash.ts`(新規)、`packages/core/src/geohash.test.ts`(新規。スモークテスト)、`packages/core/src/index.ts`(`geohash.js` を再エクスポート)
    - `InvalidCoordinateError`、`InvalidGeohashError`、`encodeGeohash(latitude, longitude)`(有限数と範囲を検査してから `ngeohash.encode`)、`neighborCells(geohash)`(`isGeohash` で検査し、`[geohash, ...ngeohash.neighbors(geohash)]` から重複を除く。自分が先頭)を作る
    - `ngeohash` は既定 import(`import ngeohash from 'ngeohash'`)で使う
    - `encodeGeohash` の署名は固定する(`apps/web` が使う。決定事項 3)
    - スモークテスト: 東京付近が6文字の geohash になること、`NaN` と緯度91が `InvalidCoordinateError` になること、内部のマスの `neighborCells` が9件で自分を含むこと
    - 完了の確認: `npm.cmd test`、`npm.cmd run typecheck`、`npm.cmd run lint`、`npm.cmd run build`
    - _Requirements: 8.1, 8.2, 8.3, 8.6, 11.9_

  - [ ] 1.6 近傍の対称性のプロパティテストを書く(必須②)
    - 触るファイル: `packages/core/src/geohash.test.ts`(追記)
    - 有効な6文字の geohash(`GEOHASH_ALPHABET` から生成)について、`B` が `neighborCells(A)` に含まれるなら、`A` が `neighborCells(B)` に含まれることを確かめる。あわせて、自分を含む、重複なし、要素数が9または6であることも確かめる。100ケース以上
    - **Property 6: 近傍のマス**
    - **Validates: Requirements 8.7, 13.4**
    - 完了の確認: `npm.cmd test`、`npm.cmd run lint`、`npm.cmd run typecheck`

  - [ ]* 1.7 `ngeohash` の端・極の最小テストを書く
    - 触るファイル: `packages/core/src/geohash.test.ts`(追記)
    - 経度の東端 `xypzpg`(反対側の `8n0p…` を含む9マス)、北端 `upzpgx`(6マス、重複なし、極をまたがない)、南端 `h0p058`(6マス)、内部のマス `xn76ur`(8つの近傍、自分を含まない)を、ライブラリの動作の確認として1件ずつ確かめる。すべてのケースを網羅しない
    - **Property 5: 座標から geohash への変換**(範囲内の任意の緯度経度が、6文字で `GEOHASH_ALPHABET` だけの geohash になること、範囲外が `InvalidCoordinateError` になること)も、ここで書く
    - **Validates: Requirements 8.4, 8.5, 8.6, 13.3**
    - 完了の確認: `npm.cmd test`

  - [ ]* 1.8 パーサーのその他のプロパティテストを書く
    - 触るファイル: `packages/core/src/parser.test.ts`(追記)
    - **Property 2: パーサーは throw せず、不正な入力は既存と同じコードになる**
    - **Property 3: 不正な新メッセージは理由つきで拒否される**(必須フィールド削除は `missing_field`、不正な値は `invalid_field`)
    - **Property 4: 定義にないフィールド(`lat`、`lon`、`latitude`、`longitude` を含む)は捨てられる**
    - **Validates: Requirements 11.4, 11.5, 11.6, 14.1, 14.2**
    - 完了の確認: `npm.cmd test`

- [ ] 2. チェックポイント - 共通の土台の確認
  - `npm.cmd run lint`、`npm.cmd run typecheck`、`npm.cmd test`、`npm.cmd run build` がルートで通ることを確認する。`encodeGeohash` と新メッセージ型・パーサーが `@doodle-nearby/core` の入口から import できることを確認する。
  - このチェックポイントが終わったら、W(タスク 3)と S(タスク 4)を並行して進められる。
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 3. 【グループ W: 画面】`apps/web`
  - [ ] 3.1 開発サーバー(HTTPS、プロキシ)と画面の土台を設定する
    - 触るファイル: `apps/web/vite.config.ts`、`apps/web/tsconfig.json`(`references: [{ "path": "../../packages/core" }]` を足す。ほかは変えない)、`apps/web/index.html`(`lang="en"`、viewport メタ)、`apps/web/src/vite-env.d.ts`(新規)
    - `vite.config.ts`: `basicSsl()`、`resolve.alias: coreAlias`(`../../vitest.shared`)、`optimizeDeps.include: ['@doodle-nearby/core > ngeohash']`、`server.host: '0.0.0.0'`、`port: 5173`、`strictPort: true`、`proxy: { '/ws': { target: 'ws://127.0.0.1:<LOCAL_SERVER_PORT>', ws: true } }`(`LOCAL_SERVER_PORT` の既定は 8787)
    - 既存の `apps/web/vitest.config.ts` は変えない(`basicSsl()` をテストに入れない)
    - 完了の確認: `npm.cmd run typecheck`、`npm.cmd run lint`、`npm.cmd test`(既存の `App.test.tsx`)、`npm.cmd run build`(`vite build` が通る)
    - _Requirements: 12.1, 12.3, 12.9, 1.4_

  - [ ] 3.2 英語の文言とアイコンの表を作る
    - 触るファイル: `apps/web/src/labels.ts`、`apps/web/src/error-messages.ts`(`Record<ErrorCode, string>`。コードが増えるとコンパイルエラーになる)、`apps/web/src/identity-view.ts`(色名 → CSS 色、アイコン名 → 絵文字)
    - 文言は英語のみ(`Join with room code`、`Create a new room`、`Finding rooms near you…`、`No rooms nearby yet.`、`The connection was lost.`、`Back to start`、`Please turn your phone upright.`、`Your drawing wasn't sent. Please try again.`、`Draw something first.`、`Can't show this drawing` など)。エラーの文言は design.md の表に従う
    - 完了の確認: `npm.cmd run typecheck`、`npm.cmd run lint`、`npm.cmd test`
    - _Requirements: 1.4, 4.6, 5.3, 5.5, 5.8, 5.10_

  - [ ] 3.3 PNG 変換の部品(縮小・4色化)を作る
    - 触るファイル: `apps/web/src/canvas/palette.ts`(`PEN_COLORS` の3色、`WIDTHS = [4, 10]`、4色パレット)、`apps/web/src/canvas/png/fit-within.ts`、`downscale.ts`、`quantize.ts`
    - `fitWithin(width, height, max = 512)`(縦横比を保つ。512以下は拡大しない)、`downscale`(面積平均)、`quantizeToPalette`(最近傍のパレット番号)を、ブラウザの `canvas` に触れない純関数として作る
    - スモークテスト(各ファイルの `*.test.ts` に数件): `fitWithin` が 1000×500 を 512×256 にすること、300×200 をそのまま返すこと
    - 完了の確認: `npm.cmd test`、`npm.cmd run typecheck`、`npm.cmd run lint`
    - _Requirements: 3.1, 3.2, 2.1_

  - [ ] 3.4 PNG の符号化と書き出しを作る
    - 触るファイル: `apps/web/src/canvas/png/encode-indexed-png.ts`、`apps/web/src/canvas/png/export-drawing.ts`
    - `encodeIndexedPng`(2ビットの索引カラー PNG。署名、IHDR、PLTE、IDAT、IEND、CRC32 を書き、IDAT は `fflate` の `zlibSync` で圧縮する)、`exportDrawing(src, palette, maxChars = MAX_IMAGE_DATA_CHARS)`(長辺 512 → 384 → 256 の順に試し、base64 が上限以内になった最初のものを返す。全画素が白なら `blank`、256px でも収まらなければ `too_large`)を作る
    - ファイルの先頭に `// @vitest-environment node` を付ける(`Uint8Array` の Realm の違いを避ける)
    - スモークテスト: 白一色の入力が `blank` になること、1画素だけペン色の入力が `ok: true` になること
    - 完了の確認: `npm.cmd test`、`npm.cmd run typecheck`、`npm.cmd run lint`
    - _Requirements: 3.1, 3.2, 3.7_

  - [ ] 3.5 縮小後の PNG の大きさのテストを書く(必須⑥)
    - 触るファイル: `apps/web/src/canvas/png/export-drawing.test.ts`(新規)
    - 次のケースで、出力の PNG の署名と IHDR の幅・高さが 512 以下で、元の縦横比(1ピクセル以内)が保たれ、`node:zlib` で展開した索引画素が期待どおりであることを確かめる: 512 を超える元(幅だけ、高さだけ、両方)、512 以下の元(拡大されない)、極端な縦長・横長
    - **Property 19: 縮小後の大きさ**、**Property 20: 絵の書き出し**(ペンの3色と白だけの画素で、`imageData` が `MAX_IMAGE_DATA_CHARS` 以下になること)
    - **Validates: Requirements 3.1, 3.2, 3.7, 13.8**
    - 完了の確認: `npm.cmd test`、`npm.cmd run lint`、`npm.cmd run typecheck`

  - [ ] 3.6 WebSocket の URL と薄い接続ラッパーを作る
    - 触るファイル: `apps/web/src/net/ws-url.ts`(`buildWsUrl`)、`apps/web/src/net/connection.ts`(`openConnection`、`Connection`、`ConnectionHandlers`)
    - `https:` なら `wss://<host>/ws`、`http:` なら `ws://<host>/ws`。ホスト名や IP を書かない。`onMessage` には `parseServerMessage` に成功したものだけを渡す。`close` と `error` の両方で `onClose` を呼ぶ。自動再接続はしない
    - スモークテスト(`ws-url.test.ts`): `https:` と `http:` の各1件
    - 完了の確認: `npm.cmd test`、`npm.cmd run typecheck`、`npm.cmd run lint`
    - _Requirements: 12.4, 5.10, 11.10_

  - [ ]* 3.7 WebSocket の URL と接続ラッパーのテストを書く
    - 触るファイル: `apps/web/src/net/ws-url.test.ts`(追記)、`apps/web/src/net/connection.test.ts`(新規)
    - **Property 27: WebSocket の URL**(任意の `protocol` と `host` で、`host` 以外のホスト名・IP を含まない)
    - 偽の `WebSocket` で、パースに失敗したメッセージが捨てられること、`onClose` が呼ばれることを確かめる
    - **Validates: Requirements 12.4, 5.10**

  - [ ] 3.8 位置情報の取得を作る
    - 触るファイル: `apps/web/src/geo/request-geohash.ts`
    - `requestGeohash(geolocation, options)`: `getCurrentPosition` のコールバックの中で、すぐ `encodeGeohash` を呼ぶ(緯度経度は状態・メッセージ・ログに入れない)。拒否、取得失敗、`geolocation` なし、自前のタイマーによる10秒の時間切れは `{ ok: false }`
    - スモークテスト(`request-geohash.test.ts`): 偽の `geolocation` で成功が6文字の geohash になること、拒否が `{ ok: false }` になること
    - 完了の確認: `npm.cmd test`、`npm.cmd run typecheck`、`npm.cmd run lint`
    - _Requirements: 5.1, 5.2, 5.5, 5.11_

  - [ ]* 3.9 位置情報のテストを書く
    - 触るファイル: `apps/web/src/geo/request-geohash.test.ts`(追記)
    - 偽のタイマー(`vi.useFakeTimers`)で、10秒の時間切れ、`geolocation` なしを確かめる
    - **Property 28: 画面が送るメッセージに細かい位置が含まれない**(直列化した文字列に緯度・経度の数値が含まれず、位置は6文字の geohash だけであること)
    - **Validates: Requirements 5.2, 5.5, 5.11**

  - [ ] 3.10 テンキーの入力ロジックを作る
    - 触るファイル: `apps/web/src/state/keypad.ts`
    - 数字 `0`〜`9` とバックスペースの純関数。入力は4桁まで、数字だけ。参加が有効になるのは、ちょうど4桁のときだけ
    - スモークテスト(`keypad.test.ts`): 5桁目が無視されること、4桁で参加が有効になること
    - 完了の確認: `npm.cmd test`、`npm.cmd run typecheck`、`npm.cmd run lint`
    - _Requirements: 5.6_

  - [ ]* 3.11 テンキーのプロパティテストを書く
    - 触るファイル: `apps/web/src/state/keypad.test.ts`(追記)
    - **Property 22: テンキー**(任意のキー操作の列で、数字列が4桁以下で数字だけ。参加の有効化は、長さがちょうど4であることと同値)
    - **Validates: Requirements 5.6**

  - [ ] 3.12 画面の状態(リデューサー)を作る
    - 触るファイル: `apps/web/src/state/app-state.ts`(`AppState`、`AppAction`、`reducer`、初期状態)、`apps/web/src/state/app-state.test.ts`(新規。スモークテスト)
    - design.md の 8.2 の型に従う。`server_message` の扱い(`room_list`、`room_created`、`room_joined`、`participant_joined`、`participant_left`、`drawing_added`、`error`)、送信状態(`idle` / `sending` / `failed`)、`location_*`、`keypad_*`、`left_room`、`reset_connection` を実装する
    - `drawing_added` は `drawingId` の重複を無視し、`seq` の昇順に並べる。`imageKey` の絵は `imageData: null`(プレースホルダー)にする。エラーは `error-messages.ts` の英語の文言を使い、入口では数字を消さない。緯度経度は状態に入れない
    - スモークテスト: 入口 → 部屋 → 入口の遷移、`drawing_added` の重複が無視されること、入口でのエラーで数字が残ること
    - 完了の確認: `npm.cmd test`、`npm.cmd run typecheck`、`npm.cmd run lint`
    - _Requirements: 3.3, 3.4, 3.5, 4.3, 4.4, 4.7, 4.8, 5.3, 5.4, 5.7, 5.8, 5.9, 5.10_

  - [ ]* 3.13 リデューサーのプロパティテストと遷移テストを書く
    - 触るファイル: `apps/web/src/state/app-state.test.ts`(追記)
    - **Property 23: 共有ボードの並び**(任意の到着順と重複で、`drawingId` が一意で `seq` の昇順)
    - **Property 24: 参加者の人数表示**(`participants.length` と常に等しい)
    - **Property 25: エラー時の入口**(入口にとどまり、数字列は変わらず、英語の文言が出る)
    - 送信の成功・失敗・時間切れ、接続の切断の例示テスト
    - **Validates: Requirements 4.3, 4.7, 5.8, 3.3, 3.4, 3.5**

  - [ ] 3.14 描画エンジンを作る
    - 触るファイル: `apps/web/src/canvas/pad-engine.ts`、`apps/web/src/canvas/pad-engine.test.ts`(新規。スモークテスト)
    - `PadEngine`(DOM に依存しない): 初期値はペン、0番の色、細い方。`pointerDown`(点)、`pointerMove`(線。境界の外に出たら、境界の点で線を終え、ポインターを離すまで無視する)、`pointerUp`、`set`、`clearAll`(ツール・色・太さは変えない)、`hasContent`。消しゴムは白で塗り、選んだ太さを使う
    - スモークテスト(偽の `Renderer`): タップで点が1つ、ドラッグで線、`clearAll` で `hasContent` が `false` になり設定が変わらないこと
    - 完了の確認: `npm.cmd test`、`npm.cmd run typecheck`、`npm.cmd run lint`
    - _Requirements: 2.1, 2.2, 2.4, 2.5, 2.6, 2.7, 2.8, 2.10, 2.11, 2.12_

  - [ ]* 3.15 描画エンジンのプロパティテストを書く
    - 触るファイル: `apps/web/src/canvas/pad-engine.test.ts`(追記)
    - **Property 21: 描画エンジンの不変条件**(色・太さ・ツールが常に有効、座標が範囲内、範囲外に出た後は線が増えない、`clearAll` で設定が変わらない)
    - **Validates: Requirements 2.1, 2.5, 2.8, 2.10**

  - [ ] 3.16 名札と共有ボードの部品を作る
    - 触るファイル: `apps/web/src/components/name-tag.tsx`(`NameTag`)、`apps/web/src/components/shared-board.tsx`(`SharedBoard`)、`apps/web/src/styles/board.css`(新規)
    - `NameTag`: 色付きの丸に動物の絵文字。`role="img"`、`aria-label` は `"red cat"` のような英語。`SharedBoard`: `seq` の昇順の2列グリッド、`overflow-y: auto`、`touch-action: pan-y`、新しい絵が来たら末尾へスクロール。画像が表示できない(`onError`、`imageData: null`)ときは、プレースホルダーと名札を出す
    - ファイル名は kebab-case、コンポーネントは PascalCase(`.kiro/steering/structure.md`)
    - スモークテスト(`renderToString`): `SharedBoard` が絵の数だけ名札を出すこと
    - 完了の確認: `npm.cmd test`、`npm.cmd run typecheck`、`npm.cmd run lint`
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 4.6, 4.9_

  - [ ] 3.17 入口の画面の部品を作る
    - 触るファイル: `apps/web/src/components/keypad.tsx`、`apps/web/src/components/room-list-view.tsx`、`apps/web/src/components/entry-screen.tsx`、`apps/web/src/styles/entry.css`(新規)
    - `Keypad`(`button` だけ。4つの枠で表示。`Join` は4桁のときだけ有効)、`RoomListView`(部屋番号、`n/8`、`Same spot` / `Nearby`、満員は `Full`。受け取った順。0件は `No rooms nearby yet.` と `Create a new room`)、`EntryScreen`(位置の状態に応じた表示。`Join with room code` を開くボタン、エラーの文言)
    - 位置ありの部屋番号参加は `Join{ roomId: null, geohash, roomCode }`、位置なしは `JoinByCode`、作成は `CreateRoom`(位置なしは `geohash: null`)。文字入力欄(`input`、`textarea`、`contenteditable`)は使わない
    - スモークテスト(`renderToString`): `unavailable` のときにテンキーと作成ボタンが出ること、一覧0件の文言
    - 完了の確認: `npm.cmd test`、`npm.cmd run typecheck`、`npm.cmd run lint`
    - _Requirements: 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 1.3_

  - [ ] 3.18 キャンバスと部屋の画面の部品を作る
    - 触るファイル: `apps/web/src/components/toolbar.tsx`、`apps/web/src/components/canvas-pad.tsx`、`apps/web/src/components/room-screen.tsx`、`apps/web/src/styles/room.css`(新規)
    - `Toolbar`(ペン3色、太さ2種類、消しゴム、全消し、送信)、`CanvasPad`(Pointer Events、`setPointerCapture`、`touch-action: none`、`pointerdown` で `preventDefault()`、マウント時に1度だけ内部解像度を決める。送信は `getImageData` → `exportDrawing` → `DrawingSubmit{ imageData, imageKey: null }`。`blank` は `Draw something first.`、10秒のタイマー。受理されたら500ms以内に消す)、`RoomScreen`(上半分 `SharedBoard`、下半分 `CanvasPad`。`grid-template-rows: 1fr 1fr`、各 `min-height: 0`。ヘッダーに部屋番号、人数、Leave ボタン)
    - 描いた内容がないとき、送信ボタンは `disabled`
    - スモークテスト(`renderToString`): 送信ボタンが空のとき `disabled` であること
    - 完了の確認: `npm.cmd test`、`npm.cmd run typecheck`、`npm.cmd run lint`
    - _Requirements: 1.1, 2.1, 2.2, 2.3, 2.9, 2.11, 2.12, 3.1, 3.3, 3.4, 3.5, 3.6, 5.9_

  - [ ] 3.19 画面を組み立てる
    - 触るファイル: `apps/web/src/App.tsx`、`apps/web/src/main.tsx`、`apps/web/src/styles.css`(新規。`styles/*.css` を import し、全体の方針を書く)、`apps/web/src/App.test.tsx`(既存テストを新しい画面に合わせて更新)
    - `useReducer` と `useEffect`(接続、位置情報、タイマー)で、入口 / 部屋 / 接続切断(`The connection was lost.` と `Back to start`)を切り替える。位置が決まったら `Join{ roomId: null, roomCode: null, geohash }` で一覧を要求し、Leave 後も再送する。接続は `buildWsUrl(window.location)` で張る
    - スタイル: `html, body { margin: 0; width: 100%; overflow-x: hidden; overscroll-behavior: none }`、全要素 `box-sizing: border-box`、横向きは `Please turn your phone upright.`。`<audio>`、`<video>`、`getUserMedia` を使わない
    - 完了の確認: `npm.cmd run build`、`npm.cmd run typecheck`、`npm.cmd run lint`、`npm.cmd test`
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 4.4, 5.1, 5.2, 5.9, 5.10, 12.4, 14.4_

  - [ ]* 3.20 画面の静的な確認とコンポーネントテストを書く
    - 触るファイル: `apps/web/src/static-checks.test.ts`(新規)
    - 全画面(入口の各状態、部屋)の `renderToString` に `<input`、`<textarea`、`contenteditable`、`<audio`、`<video` がないこと。ソースに `getUserMedia` がないこと。`labels.ts` と `error-messages.ts` に日本語の文字がないこと。`apps/web/src` にメッセージ型やパーサーの重複定義がないこと
    - **Validates: Requirements 1.3, 1.4, 1.5, 1.6, 11.10, 14.4**

  - [ ] 3.21 `apps/web/README.md`(英語)を書く
    - 触るファイル: `apps/web/README.md`(新規)
    - design.md の 9 の骨子に従う: 何か、必要なもの(Node 22 以上、ルートで `npm install`)、開発サーバーの起動(`npm run dev -w apps/web`。Windows の PowerShell では `npm.cmd run dev -w apps/web`)、LAN の IP の調べ方(Windows `ipconfig`、macOS `ipconfig getifaddr en0`、Linux `hostname -I`)、スマホで証明書の警告を通す手順(iOS Safari、Android Chrome)、既定のポート 5173 と `LOCAL_SERVER_PORT`、位置情報とプライバシー、トラブルシュート
    - ルートの `README.md` は変更しない
    - 完了の確認: `npm.cmd run lint`(Prettier が通る)、`npm.cmd test`
    - _Requirements: 12.8, 12.12_

- [ ] 4. 【グループ S: サーバー】`packages/core` の部屋ロジックと `apps/local-server`
  - [ ] 4.1 部屋の型、定数、時計、参加者の識別を作る
    - 触るファイル: `packages/core/src/room-types.ts`(`DrawingImage`、`Participant`、`Room`、`StoredDrawing`、`ConnectionState`)、`room-constants.ts`(`ROOM_RETENTION_MS`、`SWEEP_INTERVAL_MS`)、`clock.ts`(`Clock`、`systemClock`、`createManualClock`)、`participant-identity.ts`(`pickIdentity`)、`participant-identity.test.ts`(スモークテスト)、`packages/core/src/index.ts`(上記4ファイルを再エクスポート)
    - 緯度経度、名前、IP、端末 ID の項目は作らない
    - `pickIdentity(taken, random)`: 96通りから使用済みを除いて選ぶ。空きがなければ `null`
    - 完了の確認: `npm.cmd test`、`npm.cmd run typecheck`、`npm.cmd run lint`、`npm.cmd run build`
    - _Requirements: 6.5, 6.6, 6.9, 10.4, 10.8, 10.9, 14.5_

  - [ ]* 4.2 `pickIdentity` のテストを書く
    - 触るファイル: `packages/core/src/participant-identity.test.ts`(追記)
    - 使用済みを避けること、96通りから選ぶこと、空きがなければ `null` になることを確かめる
    - **Validates: Requirements 6.5, 6.6**

  - [ ] 4.3 `RoomStore` interface と `MemoryRoomStore` を作る
    - 触るファイル: `packages/core/src/room-store.ts`、`packages/core/src/memory-room-store.ts`、`packages/core/src/memory-room-store.test.ts`(新規。スモークテスト)、`packages/core/src/index.ts`(再エクスポート)
    - design.md の 5.2 の interface(非同期、`createRoom`、`getRoomById`、`getRoomByCode`、`listRoomsByGeohashes`、`listActiveRoomCodes`、`addParticipant`、`removeParticipant`、`appendDrawing`、`listDrawings`、`deleteExpired`)を作る。`MemoryRoomStore` は `Map<roomId, …>` と `Map<roomCode, roomId>`。各メソッドは `await` を挟まず同期的に判定と更新を行う(原子性)
    - スモークテスト: 作成 → 取得、参加者の追加(満員は `full`)、絵の追加で `seq` が1から増えること、`deleteExpired` で部屋番号が再利用できること
    - 完了の確認: `npm.cmd test`、`npm.cmd run typecheck`、`npm.cmd run lint`、`npm.cmd run build`
    - _Requirements: 10.1, 10.2, 10.3, 10.7, 10.9_

  - [ ]* 4.4 `RoomStore` の契約テストのスイートを書く
    - 触るファイル: `packages/core/src/testing/room-store-contract.ts`(`runRoomStoreContract(name, createStore)`。`index.ts` からは export しない)、`packages/core/src/memory-room-store.test.ts`(スイートを呼ぶ)
    - 取得、一覧(1〜9マス、位置なしを含めない)、`addParticipant` の `full` / `identity_taken` / 冪等、`removeParticipant`、`appendDrawing`(`seq`、50枚の切り捨て)、`deleteExpired`(番号の再利用)、`createRoom` の `code_taken` と期限切れの置き換え。ファクトリを受け取るので、将来の DynamoDB 実装でも同じケースを実行できる
    - このスイートは必須の6つ(③、⑤)には数えない。③と⑤は `RoomService` のテスト(4.6、4.11)で満たす
    - **Property 12: `RoomStore` はモデルと同じ結果を返す**
    - **Validates: Requirements 10.3, 10.10, 13.5**

  - [ ] 4.5 `RoomService`(作成・参加・退出・切断)を作る
    - 触るファイル: `packages/core/src/room-service.ts`(`RoomService`、`ServicePorts`、`RoomServiceOptions`、`OrderRoomSummaries` 型、`handleMessage`、`handleDisconnect`)、`packages/core/src/testing/room-service-fixture.ts`(テスト用の偽の `ServicePorts`、簡易版の並べ替え、種付きの乱数、連番の ID。`index.ts` からは export しない)、`packages/core/src/index.ts`(`room-service.js`、`clock.js` の再エクスポートを確認)
    - 作成(部屋番号の払い出し: ランダムに最大20回、その後 `listActiveRoomCodes` から選び、空きがなければ `internal_error`)、`Join`(`roomId` が先、`roomCode` は無視)、`JoinByCode`、`Leave`(参加していなければ `invalid_field`)、切断、満員(`room_full`)、他の部屋からの移動、再参加、`room_created`、`room_joined`、`participant_joined`、`participant_left`、`room_left` の送信、保持している絵の再送を実装する
    - 期限切れの部屋は、読み取り時に `room.expiresAt <= now` で「ない」ものとして扱う(`clock` は注入。既定は `systemClock`)
    - `orderRooms`(並べ替え)は**注入**で受け取る。`OrderRoomSummaries` 型は `RoomService` 側で構造的に定義し、未実装の `room-list.ts` に依存しない(Spec 0 のタスク 4.1 への依存。このタスクでは簡易版を使う)
    - スモークテスト(`room-service.test.ts` は 4.6 が使うので、ここでは書かない。`room-service-fixture.ts` が型チェックを通ることと、`npm.cmd test` が壊れないことを確認する)
    - 完了の確認: `npm.cmd run typecheck`、`npm.cmd run lint`、`npm.cmd run build`、`npm.cmd test`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.7, 6.8, 6.10, 6.11, 6.12, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.10, 7.11, 7.12, 7.13, 10.4, 10.5, 10.8_

  - [ ] 4.6 部屋の作成と定員のテストを書く(必須③)
    - 触るファイル: `packages/core/src/room-service.create.test.ts`(新規。`room-service-fixture.ts` を使う)
    - 例示テスト: 有効な geohash で作成した部屋が、一意の `roomId`、4桁の `roomCode`、指定の `geohash`、`expiresAt = createdAt + ROOM_RETENTION_MS` を持つこと。位置なし(`geohash: null`)でも作成できること。6文字でない geohash は `invalid_field` で、部屋が増えないこと。8人まで参加でき、9人目は `room_full` で、既存の参加者と識別が変わらないこと
    - **Property 7**(部屋の作成)と **Property 8**(識別の重複なし、定員)の例示版
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.10, 6.11, 13.1**
    - 完了の確認: `npm.cmd test`、`npm.cmd run lint`、`npm.cmd run typecheck`

  - [ ] 4.7 `RoomService` の一覧と再送先の判定を作る
    - 触るファイル: `packages/core/src/room-service.ts`(`buildRoomList`、`Join{ roomId: null, roomCode: null }` の処理、`roomsChanged` の呼び出し、`selectListSubscribers(connections, roomGeohash)` の純関数)
    - `buildRoomList(geohash)`: `neighborCells` で最大9マス → `listRoomsByGeohashes` → 位置なしと期限切れを除く → 候補(`distance` は同じマスなら 0、そうでなければ 1。`sameHash` は `distance === 0`)→ 注入した `orderRooms` で並べ、先頭 `MAX_ROOMS` 件に切る。0件でもエラーにしない。不正な geohash は `invalid_field`(`Join` の場合)
    - 並べ替えは注入のままにする(Spec 0 のタスク 4.1 が入るまでは簡易版。差し替えはタスク 4.21)
    - 完了の確認: `npm.cmd run typecheck`、`npm.cmd run lint`、`npm.cmd test`、`npm.cmd run build`
    - _Requirements: 8.8, 8.9, 8.10, 8.11, 8.12, 8.13, 8.14, 8.15, 8.16, 7.9_

  - [ ] 4.8 `RoomService` の絵の配布を作る
    - 触るファイル: `packages/core/src/room-service.ts`(`DrawingSubmit` の処理)
    - 順に検査する: 部屋がない・期限切れは `room_not_found`、参加者でなければ `invalid_field`、`imageKey` の絵は `invalid_field`(`acceptImageKey` の既定は `false`)、`imageData.length > MAX_IMAGE_DATA_CHARS` は `message_too_large`(PNG の中身は検査しない)。エラーは送信者だけに返し、保存も配布もしない
    - 成功したら `appendDrawing`(最大50枚。古い絵を捨てる)→ `drawing_added` を送信者を含む全参加者へ送る。`sender` は参加者の識別
    - 完了の確認: `npm.cmd run typecheck`、`npm.cmd run lint`、`npm.cmd test`、`npm.cmd run build`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 14.5_

  - [ ] 4.9 絵の配布先のテストを書く(必須④)
    - 触るファイル: `packages/core/src/room-service.drawing.test.ts`(新規)
    - 2つの部屋に参加者を置き、片方の部屋の参加者が絵を送ると、`drawing_added` が、その部屋の全員(送信者を含む)にちょうど1回ずつ届き、もう片方の部屋の接続には届かないことを確かめる。存在しない部屋は `room_not_found`、参加者でない接続は `invalid_field` で、エラーは送信者だけに届き、絵は保存されず配られないこと
    - **Property 15: 絵の配布先**
    - **Validates: Requirements 9.1, 9.3, 9.4, 13.1**
    - 完了の確認: `npm.cmd test`、`npm.cmd run lint`、`npm.cmd run typecheck`

  - [ ] 4.10 期限切れの掃除を作る
    - 触るファイル: `packages/core/src/room-service.ts`(`sweepExpired`)
    - `store.deleteExpired(clock.now())` を呼び、返された部屋の `geohash` ごとに `roomsChanged` を1回呼ぶ(`geohash` が `null` なら呼ばない)。削除した部屋の数を返す。掃除の前でも、期限切れの部屋は参加・一覧・描画で見えない(4.5、4.7、4.8 の読み取り時の判定)
    - 完了の確認: `npm.cmd run typecheck`、`npm.cmd run lint`、`npm.cmd test`、`npm.cmd run build`
    - _Requirements: 10.5, 10.6, 10.7, 14.6, 14.7_

  - [ ] 4.11 期限切れのテストを書く(必須⑤)
    - 触るファイル: `packages/core/src/room-service.expiry.test.ts`(新規)
    - `createManualClock` を `RoomService` に渡し、実時間を待たずに確かめる: 期限の直前は参加・一覧・描画ができ、`expiresAt` ちょうどでは参加と描画が `room_not_found` になり、一覧に出ないこと。`sweepExpired` の後、ID・部屋番号・絵のどれでも読み出せず、その部屋番号を新しい部屋に再利用できること。期限内の部屋と絵は消えないこと
    - **Property 17: 期限切れ**
    - **Validates: Requirements 10.5, 10.7, 10.8, 14.6, 14.7**
    - 完了の確認: `npm.cmd test`、`npm.cmd run lint`、`npm.cmd run typecheck`

  - [ ]* 4.12 エラー時に状態が変わらないテストを書く
    - 触るファイル: `packages/core/src/room-service.errors.test.ts`(新規)
    - 満員の部屋への参加、一致しない部屋番号、存在しない部屋 ID、期限切れの部屋への参加の各ケースで、失敗の前後で部屋の状態(参加者、識別、絵)が変わらないこと。部屋番号が10,000個すべて使用中のときの `internal_error`。参加していない接続の `Leave`
    - **Validates: Requirements 13.2, 6.4, 7.3, 7.7, 8.13**

  - [ ]* 4.13 `RoomService` のその他のプロパティテストを書く
    - 触るファイル: `packages/core/src/room-service.properties.test.ts`(新規)
    - **Property 9: 部屋の引き方**、**Property 10: 参加時の通知と絵の再送**、**Property 11: 参加・退出の操作列とモデルの一致**、**Property 13: 一覧の中身**、**Property 14: 一覧の再送先**、**Property 16: 絵の保持**(50枚)、**Property 18: 配る絵のメッセージは上限に収まる**
    - **Validates: Requirements 7.1, 7.2, 7.4, 7.5, 7.9, 8.8, 8.11, 8.15, 9.2, 9.5, 11.1**

  - [ ] 4.14 ポート設定と起動ガード(Windows 対応)を直す
    - 触るファイル: `apps/local-server/src/config.ts`(`InvalidPortError`、`parsePort(env)`)、`apps/local-server/src/index.ts`(起動ガードを `import.meta.url === pathToFileURL(process.argv[1] ?? '').href` に直す。`DEFAULT_PORT`、`startupMessage` は残す。`main(env, io)` を作り、`parsePort` が失敗したら標準エラーに `LOCAL_SERVER_PORT must be an integer from 1 to 65535 (got "<値>")` を出して終了コード 1)、`apps/local-server/src/config.test.ts`(新規。スモークテスト)
    - `parsePort`: 未設定は `DEFAULT_PORT`(8787)。1〜65535 の整数の10進数の文字列だけ受け入れる(空文字、前後の空白、小数、`1e3`、`0x50` は不正)
    - 既存の `index.test.ts` が通ること。サーバー本体の起動は 4.18 で足す(ここでは `main` は起動メッセージを出すだけ)
    - Windows では `npm.cmd start -w apps/local-server` で、起動メッセージが出ることを確認する(これまでは何も出力せずに終わっていた)
    - 完了の確認: `npm.cmd test`、`npm.cmd run typecheck`、`npm.cmd run lint`、`npm.cmd run build`
    - _Requirements: 12.2, 12.5, 12.6, 12.7_

  - [ ]* 4.15 ポートのテストを書く
    - 触るファイル: `apps/local-server/src/config.test.ts`(追記)、`apps/local-server/src/index.test.ts`(追記)
    - **Property 26: ポート番号の読み取り**。不正な値で `main` が終了コード 1 とメッセージを出すこと(`exit` を注入して確かめる)。子プロセス(`process.execPath` と `tsx`)で起動ガードが働くこと(Windows でも起動メッセージが出ること)
    - **Validates: Requirements 12.5, 12.6, 12.7**

  - [ ] 4.16 サーバーの小さな部品を作る
    - 触るファイル: `apps/local-server/src/logger.ts`(`Logger`。位置・geohash・部屋番号・画像を出さない)、`apps/local-server/src/serial-queue.ts`(全接続共通の FIFO キュー。1つの処理が例外を投げても次を続ける)、`apps/local-server/src/connection-registry.ts`(接続ごとの `ConnectionState` と `WebSocket` の表)、それぞれの `*.test.ts`(スモークテスト)
    - 完了の確認: `npm.cmd test`、`npm.cmd run typecheck`、`npm.cmd run lint`
    - _Requirements: 14.3, 9.2_

  - [ ] 4.17 `createLocalServer`(接続の処理)を作る
    - 触るファイル: `apps/local-server/src/server.ts`(`createLocalServer({ port, host?, logger?, clock?, sweepIntervalMs? })`)、`apps/local-server/src/order-rooms-fallback.ts`(Spec 0 のタスク 4.1 が入るまでの簡易な並べ替え。`sameHash` が先、`distance` 昇順、安定)、`apps/local-server/src/server.test.ts`(新規。スモークテスト)
    - `ws` の `WebSocketServer({ host: '0.0.0.0', port, path: '/ws', maxPayload: 1 MiB })`。接続ごとに `connectionId`(`crypto.randomUUID()`)と `ConnectionState`。バイナリフレームは `invalid_json`。バイト長が `MAX_MESSAGE_BYTES` を超えたら `message_too_large` を返して `RoomService` へ渡さず、接続は保つ(ちょうど上限は受け入れる)。`parseClientMessage` の失敗は `error.code` を返し、接続は保つ。成功したら直列キューに積み、`RoomService.handleMessage` の返す新しい状態で接続表を更新する。切断は `handleDisconnect` をキューに積む。30秒ごとの `ping` と、`pong` が来ない接続の `terminate()`
    - `RoomService` には `orderRooms: orderRoomsFallback`(簡易版)を渡す。並べ替えの差し替えは別タスク 4.21
    - スモークテスト: `port: 0` で起動し、壊れた JSON を送ると `ErrorMessage` が返り、接続が閉じないこと
    - 完了の確認: `npm.cmd test`、`npm.cmd run typecheck`、`npm.cmd run lint`、`npm.cmd run build`
    - _Requirements: 9.6, 9.7, 12.2, 12.10, 7.8, 14.1, 14.3_

  - [ ] 4.18 一覧の再送と掃除のタイマーをつなぎ、`main` から起動する
    - 触るファイル: `apps/local-server/src/server.ts`(`ports.roomsChanged`、掃除のタイマー)、`apps/local-server/src/index.ts`(`main` が `createLocalServer` を起動する)
    - `ports.roomsChanged(geohash)`: 接続表を走査し、`roomId === null` かつ `geohash !== null` で、接続の geohash が `neighborCells(部屋の geohash)` に含まれる接続だけに `buildRoomList(接続の geohash)` を送る(同じ geohash の接続には1回だけ作って使い回す)。参加中の接続と位置なしの接続には送らない。`selectListSubscribers`(4.7)を使う
    - 掃除: `setInterval` で `sweepExpired` をキューに積む(`sweepIntervalMs` の既定は `SWEEP_INTERVAL_MS`、`unref()`、`close()` で止める)
    - `main` は `parsePort` の結果で `createLocalServer({ port })` を起動し、`startupMessage(port)` を標準出力へ出す。ポートが使用中(`EADDRINUSE`)なら、標準エラーに出して終了コード 1
    - Windows では `npm.cmd start -w apps/local-server` で起動できる
    - 完了の確認: `npm.cmd test`、`npm.cmd run typecheck`、`npm.cmd run lint`、`npm.cmd run build`
    - _Requirements: 8.14, 8.15, 10.6, 12.2, 12.5, 12.6, 12.7_

  - [ ]* 4.19 `local-server` の統合テストを書く
    - 触るファイル: `apps/local-server/src/server.integration.test.ts`(新規。`createLocalServer({ port: 0 })` を起動し、テストの最後に `close()`)
    - 2つのクライアントが同じ部屋に入り、片方が絵を送ると、もう片方が2000ms以内に同じ `imageData` を受け取ること(要件 13.6)。別の部屋のクライアントは1000msの間その絵を受け取らないこと(要件 13.7。自分の絵が自分に届いたことを待ってから確かめる)。不正なメッセージの後も接続が続くこと。`MAX_MESSAGE_BYTES` ちょうど(受け入れ)と +1(`message_too_large`)。一覧の再送(近隣のマスだけ)、切断で `participant_left`、掃除で部屋が消えること、ログに geohash・部屋番号・`imageData` が含まれないこと
    - 必須の④(絵の配布先)は 4.9 の `RoomService` のテストで満たすので、このタスクは任意にする。ただし、要件 13.6 と 13.7 の自動テストは、このタスクを実施した場合にだけ満たされる
    - **Validates: Requirements 13.6, 13.7, 12.10, 9.6, 9.7, 8.15, 7.8, 10.6, 14.3**

  - [ ] 4.20 `MESSAGE_SPECS` に新メッセージ8種類を追加する(Spec 0 のタスク 5.1 が前提)
    - 前提: Spec 0 のタスク 5.1(`message-specs.ts` の `MESSAGE_SPECS` と `packages/core/README.md` の表)が `main` に入っていること。入っていなければ、このタスクは保留にする
    - 触るファイル: `packages/core/src/message-specs.ts`、`packages/core/README.md`(メッセージの表)
    - `create_room`、`join_by_code`、`room_created`、`room_joined`、`room_left`、`participant_joined`、`participant_left`、`drawing_added` を、それぞれ1回だけ追加する。`satisfies Record<…>` のコンパイルエラーが、追加漏れを知らせる。5.1 側ですでに登録済みなら、登録済みであることを確認するだけにする
    - ルートの `README.md` は変更しない。README の表と `MESSAGE_SPECS` の一致テスト(Spec 0 のタスク 5.2)があれば通ること
    - 完了の確認: `npm.cmd run typecheck`、`npm.cmd run lint`、`npm.cmd test`、`npm.cmd run build`
    - _Requirements: 11.8, 11.1, 11.11_

  - [ ] 4.21 並べ替えを `orderRoomSummaries` に差し替える(Spec 0 のタスク 4.1 が前提)
    - 前提: Spec 0 のタスク 4.1(`room-list.ts` の `orderRoomSummaries`、`RoomCandidate`)が `main` に入っていること。入っていなければ、このタスクは保留にする
    - 触るファイル: `apps/local-server/src/server.ts`(`orderRooms` を core の `orderRoomSummaries` に差し替える)、`apps/local-server/src/order-rooms-fallback.ts`(削除)、`packages/core/src/testing/room-service-fixture.ts`(簡易版を `orderRoomSummaries` に差し替える)
    - 差し替え後に、`RoomService` のテストと `local-server` のテスト(4.19 を実施していれば統合テストも)を再実行する。`RoomCandidate` の型が design.md の形(`{ summary: RoomSummary; distance: number }`)と合うことを確認する
    - 完了の確認: `npm.cmd run typecheck`、`npm.cmd run lint`、`npm.cmd test`、`npm.cmd run build`
    - _Requirements: 8.10, 8.11, 8.16_

  - [ ] 4.22 `apps/local-server/README.md`(英語)を書く
    - 触るファイル: `apps/local-server/README.md`(新規)
    - design.md の 9 の骨子に従う: 何か、起動(`npm start -w apps/local-server`。Windows の PowerShell では `npm.cmd start -w apps/local-server`)、環境変数 `LOCAL_SERVER_PORT`(1〜65535 の整数。既定 8787。不正な値は終了コード 1)、エンドポイント(`ws://0.0.0.0:<port>/ws`)、上限(1メッセージ 32,768 バイト。超えると `message_too_large` で接続は保つ。1 MiB を超えると `ws` が接続を閉じる。1部屋8人、絵50枚、部屋は3時間で消える)、プライバシー(緯度経度・IP・名前を保存しない。ログに位置・画像を出さない)、LAN での公開への注意(認証なし)
    - ルートの `README.md` は変更しない
    - 完了の確認: `npm.cmd run lint`(Prettier が通る)、`npm.cmd test`
    - _Requirements: 12.11, 12.12_

- [ ] 5. 最終チェックポイント - 全体の確認(W と S の両方が終わってから)
  - `npm.cmd run lint`、`npm.cmd run typecheck`、`npm.cmd test`、`npm.cmd run build` がルートで通り、`npm.cmd run synth -w infra` も通ること(CI と同じ)を確認する。`npm.cmd ci` が成功すること。`.gitattributes` により改行が LF のままであること。ルートの `README.md` が変更されていないこと。
  - 保留しているタスクがあれば報告する(特に 4.20 と 4.21。Spec 0 のタスク 5.1 と 4.1 が `main` に入っていない場合)。
  - Ensure all tests pass, ask the user if questions arise.
  - **実機での確認(手動。コーディングのタスクではない)**: 次は自動テストでは確かめられないので、実装の後に人が行う。
    - `@vitejs/plugin-basic-ssl` 2.3.0 が Vite 8.3.8 で動くこと。`npm.cmd run dev -w apps/web` を起動し、PC の `https://localhost:5173` とスマホの `https://<LAN の IP>:5173` で開けること
    - iOS Safari と Android Chrome で、自己署名証明書の警告を通過した後に `navigator.geolocation` が使えること。使えない場合は、部屋番号の経路で代替できること(要件 5.5)
    - 実機の手描きの絵で、4色パレット PNG の `imageData` が 30,000 文字以内に収まること(開発ビルドで、送信ごとにサイズだけをコンソールへ出して確かめる。位置や画像本体は出さない)
    - Vite の dev で、リンクされた `packages/core` から `ngeohash`(CJS)が正しく事前バンドルされ、初回起動でリロードが起きないこと
    - 画面のレイアウト(上下50%±5、重ならない、幅360〜430pxで横スクロールなし)、タッチでページがスクロール・ズームしないこと、共有ボードの縦スクロール
    - **完了の条件**: PC とスマホ(または2台のスマホ)で、同じ部屋に入り、片方が描いて送った絵が、もう片方の上の画面(共有ボード)に、送り主の名札つきで出ること。位置情報を許可しない端末でも、部屋番号で参加できること
    - Lambda 実装時にサーバーから32KB近いメッセージを `@connections` で送れること(後続の Spec で確認する。この Spec の対象外)

## Notes

- タスクに `*` が付いたサブタスクは任意で、日程が厳しいときは省ける。必須のテストは、上の表の6つ(1.4、1.6、3.5、4.6、4.9、4.11)だけである
- 各タスクは、1つ終えるごとに、チェック(lint、typecheck、test、build のうち、タスクに書いたもの)が通ってコミットできる大きさにしてある。コミットの手順は `.kiro/steering/git.md` に従う: チェックが通ったら、先に `tasks.md` でそのタスクを完了にし、そのあとで変更を指定したファイルだけ `git add` してコミットする。1行目は英語で `Task <番号>: <要約>`(例: `Task 1.2: add new message types and constants`)
- W(タスク 3)と S(タスク 4)は、触るファイルが重ならない。W は `apps/web` だけ、S は `packages/core` の部屋ロジックと `apps/local-server` だけを触る。共通の土台のファイル(`messages.ts`、`parser.ts`、`geohash.ts`、各 `package.json`、`package-lock.json`)を W と S が直す必要が出たら、まず担当者どうしで相談する
- design.md では `room-service.test.ts` に Room_Service のテストをまとめているが、タスクが同じファイルを同時に触らないように、テストは `room-service.create.test.ts`、`room-service.drawing.test.ts`、`room-service.expiry.test.ts`、`room-service.errors.test.ts`、`room-service.properties.test.ts` に分けている。テスト用の部品は `testing/room-service-fixture.ts`(4.5)に置く
- 画面のスタイルは、`styles/board.css`(3.16)、`styles/entry.css`(3.17)、`styles/room.css`(3.18)に分け、`styles.css`(3.19)がまとめて import する。タスクどうしが同じファイルを触らないようにするため
- Windows の PowerShell では、`npm` を `npm.cmd` として呼ぶ
- 範囲外: AI 司会者、AI ボット、交換カード、協力お題、AWS の利用、アカウント登録とログイン、文字チャット、カメラ、音、同じ接続元 IP の部屋の優先表示

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "1.5"] },
    { "id": 2, "tasks": ["1.4", "1.6"] },
    { "id": 3, "tasks": ["1.7", "1.8"] },
    { "id": 4, "tasks": ["2"] },
    { "id": 5, "tasks": ["3.1", "3.2", "3.3", "3.6", "3.8", "3.10", "4.1", "4.14", "4.16"] },
    { "id": 6, "tasks": ["3.4", "3.7", "3.9", "3.11", "3.12", "3.14", "4.2", "4.3", "4.15"] },
    { "id": 7, "tasks": ["3.5", "3.13", "3.15", "3.16", "3.17", "4.4", "4.5"] },
    { "id": 8, "tasks": ["3.18", "4.6", "4.7"] },
    { "id": 9, "tasks": ["3.19", "3.21", "4.8"] },
    { "id": 10, "tasks": ["3.20", "4.9", "4.10"] },
    { "id": 11, "tasks": ["4.11", "4.12", "4.13", "4.17"] },
    { "id": 12, "tasks": ["4.18", "4.20"] },
    { "id": 13, "tasks": ["4.19", "4.21", "4.22"] },
    { "id": 14, "tasks": ["5"] }
  ]
}
```
