# Requirements Document

## Introduction

AWS を使わずに、スマホ2台(または PC とスマホ)で「近くの部屋が一覧に出る → 部屋に入る → 手描きの絵が相手の画面に出る」までを動かすローカル試作を作る。

この Spec は Spec 0「repo-and-ci」で作成済みのモノレポの上に実装を足す。`apps/web`、`apps/local-server`、`packages/core` は新規作成せず、既存の入口に実装を追加する。
`packages/core` の既存メッセージ(Join / Leave / DrawingSubmit / RoomList / AiComment / AiPrompt / AiCard / ErrorMessage)の意味は変えず、足りないメッセージだけを追加する。追加したメッセージは `parser.ts` とテストにも反映する。

位置情報を許可しない端末でも、部屋の作成と部屋番号での参加はできる。既存の Join 型の必須フィールド(`geohash`)は変えない。位置なしで使うメッセージの方式(位置なし用の新しいメッセージを足す / 位置なしを表す扱いを決める)は、この要件では決めず、design で比較して決める。位置なしで作った部屋は Geohash を持たないため、近隣の一覧には出ず、部屋番号でだけ参加できる(現時点の想定。design で変更しうる)。

画面の文言は英語にする。この Spec では英語のみとし、日本語の補足は Spec 4 で検討する。Core は geohash の変換と近傍に小さなライブラリ(例: ngeohash)を使ってよい。README は `apps/web/README.md` と `apps/local-server/README.md` に英語で書く。ルートの README はチームの作業用(日本語)で、この Spec では変更しない。

要件は次の3領域に分ける。tasks.md では担当者ごとにグループへ分ける予定である。

- 画面(`apps/web`): 要件 1〜5
- サーバー(`packages/core` の部屋ロジックと `apps/local-server`): 要件 6〜10
- 共通: 要件 11(メッセージ型)、12(開発サーバーと HTTPS)、13(テスト)、14(プライバシー)

範囲外: AI 司会者、AI ボット、交換カード、協力お題、AWS の利用、アカウント登録とログイン、文字チャット、カメラ、音。

依存: `packages/core` の `room-list.ts`(`orderRoomSummaries`)と `message-specs.ts`(`MESSAGE_SPECS`)は Spec 0 のタスク 4.1、5.1 で実装される。現時点では中身が空の仮ファイルである。この Spec ではこれらを作らず、使う側として扱う。

## Glossary

- **Web_App**: `apps/web` に置く Vite + React の画面アプリ。スマホの縦向きで使う
- **Local_Server**: `apps/local-server` に置く、`ws` を使ったローカル開発用 WebSocket サーバー。`packages/core` を呼ぶだけの薄い層である
- **Core**: `packages/core` に置く共通パッケージ。メッセージ型、部屋ロジック、geohash、保存先 interface を含む
- **Room_Service**: Core に置く部屋ロジック。部屋の作成、参加、退出、一覧、絵の配布、期限切れ削除を扱う
- **Room_Store**: Room_Service が使う保存先の interface。この Spec ではメモリ実装 `MemoryRoomStore` を作り、後で DynamoDB 実装に差し替える
- **Geohash**: 緯度経度を6文字(約1.2km×0.6km)に丸めた位置表現。文字は `GEOHASH_ALPHABET` のみ。位置情報を使わない部屋は Geohash を持たない
- **Neighbor_Cells**: ある Geohash のマスと、その周囲8マスを合わせた最大9マス
- **Room**: 参加者が絵を共有する部屋。部屋 ID、4桁の Room_Code、Geohash(位置なしで作った部屋は持たない)、参加者、絵の一覧を持つ
- **Room_Code**: 部屋に付く4桁の数字。位置情報を使えない人が参加するための番号
- **Participant**: 部屋に接続している1人の利用者。名前は持たず、Participant_Identity だけを持つ
- **Participant_Identity**: 参加者に自動で割り当てるランダムな色とアイコン(動物など)の組
- **Name_Tag**: Participant_Identity の色とアイコンを表示する、色付きの名札アイコン
- **Shared_Board**: 画面の上半分。部屋の全員が送った絵を並べる
- **Canvas_Pad**: 画面の下半分。自分が絵を描く領域と、その道具
- **Drawing**: 参加者が送信した1枚の絵。512px 以下に縮小した PNG
- **Room_Retention**: 部屋と絵が自動で削除されるまでの時間。3時間(10,800秒)
- **Dev_Server**: `apps/web` の開発用サーバー(Vite)
- **New_Messages**: この Spec で Core に追加するメッセージ。最低限、次の3種類と確認応答を含む。3種類は「部屋を作る」「部屋の絵を他の参加者に配る」「参加者の Participant_Identity を知らせる」である。確認応答は、参加の確認、退出の確認、部屋作成の確認である(要件 5.4、5.7、7.1、7.2、7.6 が必要とする)。メッセージの名前、形、個数は design で決める
- **MAX_MESSAGE_BYTES**: WebSocket の1メッセージの上限。現在は 32,768 バイト

---

## Requirements

### Requirement 1: 縦向き2画面レイアウト

**User Story:** As a participant, I want a portrait two-screen layout with a shared board on top and my canvas below, so that I can see everyone's drawings while I draw.

#### Acceptance Criteria

1. WHILE a participant is in a Room, THE Web_App SHALL display the Shared_Board in the upper half and the Canvas_Pad in the lower half of the viewport, with each area occupying 50% of the viewport height with a tolerance of ±5 percentage points, and with no overlap between the two areas.
2. WHILE the viewport is in portrait orientation with a width of 360 to 430 CSS pixels, THE Web_App SHALL display all screens with a document width equal to the viewport width, so that horizontal scrolling is not possible.
3. THE Web_App SHALL contain no text input element, including `input` of text type, `textarea`, and elements with `contenteditable`.
4. THE Web_App SHALL render all user-visible labels in English. This Spec uses English only; Japanese supplementary labels are considered in Spec 4.
5. THE Web_App SHALL play no audio.
6. THE Web_App SHALL request no camera access.

---

### Requirement 2: 描画キャンバス

**User Story:** As a participant, I want to draw with my finger using a few pens and an eraser, so that I can express myself without typing.

#### Acceptance Criteria

1. THE Canvas_Pad SHALL provide exactly 3 pen colors, and exactly 1 pen color and 1 stroke width SHALL be selected at any time.
2. THE Canvas_Pad SHALL provide exactly 2 stroke widths, and the selected width SHALL also apply to the eraser.
3. THE Canvas_Pad SHALL provide an eraser, a clear-all button, and a send button.
4. WHEN a participant opens the Canvas_Pad, THE Canvas_Pad SHALL start with the pen tool selected, the first pen color selected, the thinner stroke width selected, and no drawn content.
5. WHEN a participant drags a finger on the Canvas_Pad with a pen selected, THE Canvas_Pad SHALL draw a continuous stroke along the finger path using the selected color and the selected width.
6. WHEN a participant taps the Canvas_Pad once without moving, with a pen selected, THE Canvas_Pad SHALL draw a dot of the selected color and width at the tapped point.
7. WHEN a participant drags a finger on the Canvas_Pad with the eraser selected, THE Canvas_Pad SHALL remove the drawn content along the finger path, using the selected stroke width as the eraser width.
8. WHEN a participant presses the clear-all button, THE Canvas_Pad SHALL remove all drawn content, and the tool, color, and width selections SHALL remain unchanged.
9. WHEN a participant touches the Canvas_Pad, THE Web_App SHALL prevent the browser from scrolling or zooming the page in response to that touch.
10. IF a participant's finger moves outside the Canvas_Pad boundary during a drag, THEN THE Canvas_Pad SHALL end the current stroke at the boundary point and SHALL keep all content drawn so far.
11. WHILE the Canvas_Pad has no drawn content, THE Web_App SHALL disable the send button.
12. WHILE the Canvas_Pad has drawn content, THE Web_App SHALL enable the send button.

---

### Requirement 3: 絵の送信

**User Story:** As a participant, I want to send my drawing to the room, so that the other participants can see it.

#### Acceptance Criteria

1. WHEN a participant presses the send button while the Canvas_Pad contains at least one drawn stroke, THE Web_App SHALL convert the Canvas_Pad content to a PNG whose width and height are each 512 pixels or less, and send the PNG to the Local_Server as a Drawing.
2. THE Web_App SHALL keep the aspect ratio of the Canvas_Pad content when reducing it to 512 pixels or less, and SHALL NOT enlarge Canvas_Pad content whose width and height are already 512 pixels or less.
3. WHEN the Local_Server accepts the Drawing, THE Web_App SHALL clear the Canvas_Pad within 500 milliseconds so that the participant can draw the next picture.
4. IF the Web_App fails to send the Drawing, THEN THE Web_App SHALL keep the drawn content on the Canvas_Pad, display an English message that the drawing was not sent, and allow the participant to press the send button again.
5. IF the Local_Server does not accept the Drawing within 10 seconds after the send button is pressed, THEN THE Web_App SHALL treat the send as failed and apply the behavior in criterion 4.
6. WHILE the Canvas_Pad contains no drawn stroke, THE Web_App SHALL disable the send button so that an empty Drawing cannot be sent.
7. THE Web_App SHALL send a Drawing in a form that the Local_Server can deliver to other participants without exceeding MAX_MESSAGE_BYTES on any single WebSocket message.

---

### Requirement 4: 共有ボード

**User Story:** As a participant, I want to see everyone's drawings on a shared board with colored name tags, so that I can tell who drew what.

#### Acceptance Criteria

1. WHEN the Web_App receives a Drawing from another participant of the current Room, THE Shared_Board SHALL display that Drawing together with the Name_Tag of its sender within 1 second of the Web_App receiving it.
2. WHEN a participant sends a Drawing and the Local_Server accepts it, THE Shared_Board SHALL display that Drawing together with the Name_Tag of the sending participant within 1 second of the Web_App receiving the Local_Server's acceptance.
3. THE Shared_Board SHALL display Drawings in the order in which the Local_Server accepted them, with the most recently accepted Drawing at the end.
4. WHEN a participant joins a Room that already contains Drawings, THE Shared_Board SHALL display all Drawings that the Room still retains, in acceptance order, within 3 seconds of the participant's join completing.
5. WHEN the Shared_Board contains more Drawings than fit in the visible area, THE Shared_Board SHALL allow the participant to scroll the Shared_Board vertically so that every Drawing can be brought into view.
6. THE Name_Tag SHALL show the color and the icon of the Participant_Identity of the sender, and SHALL contain no text input field.
7. WHEN another participant joins or leaves the current Room, THE Web_App SHALL update the participant count shown for the Room within 2 seconds of the Local_Server sending the update.
8. IF the Local_Server does not accept a Drawing sent by a participant, THEN THE Shared_Board SHALL NOT display that Drawing, and THE Web_App SHALL show an error indication that the Drawing was not sent.
9. IF a received Drawing cannot be displayed, THEN THE Shared_Board SHALL show a placeholder in that Drawing's position, together with the sender's Name_Tag, and SHALL continue to display the remaining Drawings.

---

### Requirement 5: 位置情報と部屋一覧、参加の入口

**User Story:** As a participant, I want to see nearby rooms on the first screen, so that I can join a room with people around me, and I want a way in when location is unavailable.

#### Acceptance Criteria

1. WHEN the Web_App starts, THE Web_App SHALL request the device location permission from the browser.
2. WHEN the browser grants the location, THE Web_App SHALL convert the latitude and longitude to a 6-character Geohash on the device within 1 second and send only the Geohash to the Local_Server.
3. WHEN the Web_App receives a RoomList, THE Web_App SHALL display, for each room, the Room_Code, the participant count, and an indicator of whether the room is in the same Geohash cell as the participant, in the order received, and SHALL display an English message indicating that no rooms are nearby together with the "create a new room" button if the RoomList contains 0 rooms.
4. WHEN a participant selects a room in the list, THE Web_App SHALL send a Join message for that room, and WHEN the Local_Server confirms the join, THE Web_App SHALL show the Room screen within 1 second of receiving the confirmation.
5. IF the browser denies the location, cannot obtain the location, or does not return a location within 10 seconds, THEN THE Web_App SHALL display a room-code entry labeled "Join with room code" and a button labeled "Create a new room", with all text in English, SHALL send no location value to the Local_Server, and SHALL let the participant create a room and join by Room_Code without a location.
6. WHERE the participant chooses to join by Room_Code, THE Web_App SHALL accept only the digits 0 to 9 on an on-screen numeric keypad, SHALL accept no more than 4 digits, and SHALL enable the join action only while exactly 4 digits are entered, and WHEN the participant presses the join action, THE Web_App SHALL send a Join message with that Room_Code.
7. WHEN a participant presses the "create a new room" button, THE Web_App SHALL send the "create room" message from New_Messages, with the Geohash when a location is available and without a Geohash when no location is available, and WHEN the Local_Server confirms the room creation, THE Web_App SHALL show the Room screen for the new room.
8. IF the Local_Server returns an ErrorMessage to a Join message or a "create room" message, THEN THE Web_App SHALL display an English message corresponding to the error code, SHALL stay on the entry screen, and SHALL keep the entered Room_Code digits so that the participant can correct them.
9. WHEN a participant presses the leave button in a Room, THE Web_App SHALL send a Leave message and return to the entry screen within 1 second of the button press.
10. IF the WebSocket connection to the Local_Server closes while a participant is in a Room, THEN THE Web_App SHALL, within 2 seconds of the close, display an English message that the connection was lost and a button that returns to the entry screen.
11. THE Web_App SHALL send no latitude, longitude, or other location value more precise than a 6-character Geohash.

---

### Requirement 6: 部屋の作成と参加者の識別

**User Story:** As a participant, I want to create a room and receive a random color and icon automatically, so that I can take part without entering a name.

#### Acceptance Criteria

1. WHEN the Room_Service receives the "create room" message with a valid Geohash, THE Room_Service SHALL create a Room with a unique room ID, a Room_Code of exactly 4 digits (0000 to 9999), and the given Geohash.
2. IF the "create room" message provides a Geohash that is not a 6-character valid Geohash, THEN THE Room_Service SHALL reject the creation with the error code `invalid_field` (an existing ErrorCode), and THE Room_Service SHALL NOT create a Room.
3. THE Room_Service SHALL issue a Room_Code that is not used by any other non-expired Room.
4. IF all 10,000 Room_Codes (0000 to 9999) are used by non-expired Rooms, THEN THE Room_Service SHALL reject the creation with the error code `internal_error` and SHALL NOT create a Room.
5. WHEN a participant joins a Room, THE Room_Service SHALL assign the participant a Participant_Identity chosen at random from a fixed set of colors and animal icons.
6. WHILE a Room contains participants, THE Room_Service SHALL give each participant a Participant_Identity that differs from the Participant_Identity of every other participant in the same Room, as long as unused combinations remain.
7. WHEN a participant joins a Room, THE Room_Service SHALL send that participant the Participant_Identity assigned to the participant and the Participant_Identity of every other participant in the Room.
8. WHEN a participant joins a Room, THE Room_Service SHALL send the Participant_Identity of the new participant to every other participant in the Room.
9. THE Room_Service SHALL create a Room and assign a Participant_Identity without receiving a participant name.
10. THE Room_Service SHALL limit each Room to 8 participants.
11. IF a participant tries to join a Room that already has 8 participants, THEN THE Room_Service SHALL reject the join with the error code `room_full`, SHALL NOT add the participant to the Room, and SHALL leave the existing participants and their Participant_Identity values unchanged.
12. WHEN the Room_Service receives a "create room" request that provides no Geohash, THE Room_Service SHALL create a Room with a unique room ID and a Room_Code of exactly 4 digits (0000 to 9999), and with no Geohash. Under the current assumption, which the design may change, such a Room is not shown in any RoomList and can be joined only by Room_Code.

---

### Requirement 7: 部屋への参加と退出

**User Story:** As a participant, I want to join and leave rooms reliably, so that the participant list and my screen always match.

#### Acceptance Criteria

1. WHEN the Room_Service receives a Join message with a `roomId` that identifies a non-expired Room, THE Room_Service SHALL add the participant to that Room and send the participant a join confirmation message that contains the `roomId` of that Room.
2. WHEN the Room_Service receives a Join message with `roomId` set to null and a 4-digit `roomCode` that matches a non-expired Room, THE Room_Service SHALL add the participant to that Room and send the participant a join confirmation message that contains the `roomId` of that Room.
3. IF a Join message identifies no non-expired Room (the `roomId` is unknown, the `roomCode` matches no Room, or the matching Room has expired), THEN THE Room_Service SHALL reject the join with the error code `room_not_found`, SHALL NOT change the participant list of any Room, and SHALL leave the participant in the Room the participant was already in, if any.
4. WHEN a Join message has both `roomId` and `roomCode` not null, THE Room_Service SHALL use only the `roomId` and ignore the `roomCode`, and IF the `roomId` identifies no non-expired Room, THEN THE Room_Service SHALL reject the join with the error code `room_not_found` even when the `roomCode` matches another Room.
5. WHEN the Room_Service adds a participant to a Room, THE Room_Service SHALL send the participant all Drawings that the Room still retains, in the order in which they were accepted, before the participant receives any Drawing accepted after the join.
6. WHEN the Room_Service receives a Leave message from a participant of a Room, THE Room_Service SHALL remove the participant from that Room and send the participant a leave confirmation message.
7. IF the Room_Service receives a Leave message from a connection that is not a participant of any Room, THEN THE Room_Service SHALL ignore the message, SHALL NOT change any Room, and SHALL respond with an ErrorMessage whose code is chosen in the design from the existing ErrorCode values.
8. WHEN the WebSocket connection of a participant closes, THE Local_Server SHALL remove that participant from the Room in the same way as for a Leave message, without sending a confirmation to the closed connection.
9. WHEN a participant is added to or removed from a Room, THE Room_Service SHALL reflect the new participant count of that Room in every RoomList sent after that change.
10. WHEN the last participant leaves a Room, THE Room_Service SHALL keep the Room and its Drawings until Room_Retention ends, and SHALL show the Room in the RoomList with a participant count of 0 until Room_Retention ends.
11. WHEN a participant who is already a participant of another Room is added to a new Room, THE Room_Service SHALL remove the participant from the previous Room before adding the participant to the new Room, so that the participant is in exactly one Room at any time.
12. WHEN the Room_Service receives a Join message for the Room in which the sender is already a participant, THE Room_Service SHALL keep the participant count of that Room unchanged and send the join confirmation and retained Drawings again.
13. WHEN a participant who has no location joins a Room by a 4-digit `roomCode`, THE Room_Service SHALL add the participant in the same way as in criterion 2. The message form used for a join without a Geohash is chosen in the design by comparing alternatives (a new message for joining without a location, or a defined way to express "no location" in the existing Join message), and the required `geohash` field of the existing Join message SHALL stay unchanged.

---

### Requirement 8: Geohash と近傍検索

**User Story:** As a participant, I want the list to contain rooms in my cell and the eight cells around it, ordered nearest first, so that I find rooms near me.

#### Acceptance Criteria

1. THE Core SHALL provide a function that converts a latitude in the range -90 to 90 inclusive and a longitude in the range -180 to 180 inclusive to a Geohash of exactly 6 characters. The Core MAY implement the conversion with a small library (for example, ngeohash) instead of its own algorithm, and SHALL export a wrapper function around it.
2. IF the latitude is outside -90 to 90, or the longitude is outside -180 to 180, or either value is not a finite number, THEN THE Core SHALL reject the conversion with an error indicating an invalid coordinate and SHALL NOT return a Geohash.
3. THE Core SHALL provide a function that returns the Neighbor_Cells of a 6-character Geohash, consisting of the given Geohash and its 8 surrounding cells, so that the result contains 9 distinct cells when the given Geohash is not in the northernmost or southernmost row. The Core MAY implement the neighbor search with a small library (for example, ngeohash) instead of its own algorithm, and SHALL export a wrapper function around it.
4. WHEN the given Geohash lies at the edge of the longitude range, THE Core SHALL return neighbor cells that wrap around to the opposite longitude edge, so that the result still contains 9 distinct cells. The tests for this behavior confirm the library behavior with one longitude-edge case and do not need to cover every case.
5. WHEN the given Geohash lies in the northernmost or southernmost row of cells, THE Core SHALL return only the neighbor cells that exist (6 distinct cells in total, including the given cell), SHALL NOT wrap across the poles, and SHALL return no duplicate cell. The tests for this behavior confirm the library behavior with one northernmost-row case and one southernmost-row case and do not need to cover every case.
6. FOR ALL latitude and longitude pairs within the valid range, THE Core SHALL return a 6-character Geohash made only of `GEOHASH_ALPHABET` characters.
7. FOR ALL valid 6-character Geohashes, THE Core SHALL return Neighbor_Cells that contain the given Geohash, and the neighbor relation SHALL be symmetric: if cell B is in the Neighbor_Cells of cell A, then cell A is in the Neighbor_Cells of cell B.
8. WHEN the Room_Service builds a RoomList for a requested Geohash, THE Room_Service SHALL include only non-expired Rooms that have a Geohash in the Neighbor_Cells of the requested Geohash, so that Rooms without a Geohash are never included.
9. WHEN the Room_Service builds a RoomList, THE Room_Service SHALL set `sameHash` to true for each Room whose Geohash equals the requested Geohash (`distance` 0), and to false for every other Room.
10. WHEN the Room_Service builds a RoomList, THE Room_Service SHALL order the entries by calling `orderRoomSummaries` from Core, and, as in the Spec 0 design, `orderRoomSummaries` SHALL receive candidates of the form `RoomCandidate = { summary: RoomSummary; distance: number }` whose `distance` (in cells) is already computed, so that entries with `sameHash` true come first.
11. WHEN the Room_Service builds a RoomList and more than `MAX_ROOMS` Rooms match, THE Room_Service SHALL include exactly `MAX_ROOMS` entries, keeping the first `MAX_ROOMS` entries of the ordered result.
12. WHEN the Room_Service builds a RoomList and no Room matches, THE Room_Service SHALL return a RoomList with 0 entries and SHALL NOT return an error.
13. IF a Geohash is provided in a message and is not a 6-character string of `GEOHASH_ALPHABET` characters, THEN THE Room_Service SHALL reject the message with the error code `invalid_field`, SHALL NOT build a RoomList, and SHALL leave the sender's stored state unchanged.
14. WHEN the Local_Server receives a Join message with `roomId` null and `roomCode` null, THE Local_Server SHALL send the sender a RoomList for the Geohash of that message.
15. WHEN a Room is created or its participant count changes, THE Local_Server SHALL send an updated RoomList to each connected client that is not yet in a Room and whose Geohash has that Room in its Neighbor_Cells, and SHALL NOT send it to any other client.
16. WHEN the Room_Service builds the `RoomCandidate` entries for a RoomList, THE Room_Service SHALL set `distance` to 0 for each Room in the same cell as the requested Geohash and to 1 for each Room in one of the other cells of the Neighbor_Cells, so that `distance` is only 0 or 1 and `sameHash` is true exactly when `distance` is 0.

---

### Requirement 9: 絵の配布

**User Story:** As a participant, I want my drawing to reach everyone in the room, so that they see it on their shared board.

#### Acceptance Criteria

1. WHEN the Room_Service receives a valid DrawingSubmit from a participant of a Room, THE Room_Service SHALL store the Drawing in that Room and deliver it, together with the sender's Participant_Identity, to every participant of that Room including the sender.
2. THE Local_Server SHALL deliver each Drawing in a way that no single WebSocket message exceeds MAX_MESSAGE_BYTES.
3. IF a DrawingSubmit names a Room that does not exist or has expired, THEN THE Room_Service SHALL reject it with the error code `room_not_found`, SHALL NOT store or deliver the Drawing, and SHALL send the error only to the sender.
4. IF a DrawingSubmit comes from a client that is not a participant of the named Room, THEN THE Room_Service SHALL reject it with the error code `invalid_field`, SHALL NOT store or deliver the Drawing, and SHALL send the error only to the sender.
5. WHEN a new Drawing is stored in a Room that already holds 50 Drawings, THE Room_Service SHALL discard the oldest Drawing of that Room so that the Room holds exactly 50 Drawings, and SHALL keep the new Drawing.
6. IF a message received by the Local_Server, including a DrawingSubmit, is larger than the message size limit (`MAX_MESSAGE_BYTES` or another limit chosen in the design), THEN THE Local_Server SHALL reject it with the error code `message_too_large`, SHALL NOT pass it to the Room_Service, and SHALL keep the sender's connection open.
7. WHEN the Local_Server receives a message whose size is at or below the message size limit (`MAX_MESSAGE_BYTES` or another limit chosen in the design), THE Local_Server SHALL accept it and pass it on for processing.

---

### Requirement 10: 保存先 interface とメモリ実装、期限切れ

**User Story:** As a developer, I want Rooms stored behind an interface with an in-memory implementation that expires old data, so that the same room logic can later run on DynamoDB.

#### Acceptance Criteria

1. THE Core SHALL define the Room_Store interface so that Room_Service depends only on that interface and not on any concrete storage.
2. THE Core SHALL provide `MemoryRoomStore`, an implementation of Room_Store that keeps data in process memory.
3. THE Room_Store interface SHALL support these operations: creating a Room, reading a Room by room ID, reading a Room by Room_Code, listing Rooms by a set of 1 to 9 Geohash cells, updating a Room's participants, appending a Drawing, and deleting expired Rooms.
4. WHEN a Room is created, THE Room_Service SHALL set the Room's expiry time to its creation time plus Room_Retention.
5. WHILE the current time is at or after the expiry time of a Room, THE Room_Service SHALL treat that Room as not existing for joining, listing, and drawing, and SHALL return an error indicating the Room was not found for join and drawing requests.
6. WHILE the Local_Server is running, THE Local_Server SHALL delete expired Rooms and their Drawings from the Room_Store at intervals of 60 seconds or less.
7. IF a Room is deleted as expired, THEN THE Room_Store SHALL return no data for that Room's ID, Room_Code, or Drawings in any later read or list operation, and SHALL make that Room_Code available for reuse.
8. WHERE a replaceable clock is supplied to the Room_Service, THE Room_Service SHALL use that clock instead of the system clock for all expiry decisions, so that expiry can be tested without waiting.
9. THE Room_Store SHALL hold no latitude or longitude values, and SHALL hold the Geohash of a Room at exactly 6-character precision when the Room has a Geohash, while a Room may have no Geohash.
10. FOR ALL sequences of create, join, leave, and drawing operations, THE MemoryRoomStore SHALL return the same observable results as the specification of Room_Store, and the Room_Store contract tests SHALL be written as a reusable test suite that takes a Room_Store factory so that a later DynamoDB implementation can run the same tests unchanged.

---

### Requirement 11: メッセージ型とパーサーの追加

**User Story:** As a developer on any of the three layers, I want the added messages defined in Core and shared by the Web_App and the Local_Server, so that the contract stays explicit and type-safe.

#### Acceptance Criteria

1. THE Core SHALL define each New_Messages type as a TypeScript type that carries a `type` discriminator field with a string literal unique among all message types, and SHALL include each one in exactly one of `ClientMessage` or `ServerMessage`, according to whether the Web_App or the Local_Server sends it.
2. THE Core SHALL keep the names, types, required/optional status, and meanings of all existing fields of Join, Leave, DrawingSubmit, RoomList, AiComment, AiPrompt, AiCard, and ErrorMessage unchanged, and SHALL add only optional fields (never required ones) to these messages, and only if the design document lists each such field.
3. WHEN `parseClientMessage` or `parseServerMessage` receives a JSON string or value of a New_Messages type, THE parser SHALL return a result of the same `ParseResult` shape as for existing messages, with the success indicator set and the typed message as its value.
4. IF a New_Messages value has a missing required field, THEN THE parser SHALL return an error result with the code `missing_field` and SHALL throw no exception.
5. IF a New_Messages value has a field of the wrong type, or a value outside the defined bounds of that field, THEN THE parser SHALL return an error result with the code `invalid_field` and SHALL throw no exception.
6. IF `parseClientMessage` or `parseServerMessage` receives input that is not valid JSON, or a `type` value that is not defined for that parser, THEN THE parser SHALL return an error result using the same error code as the existing parser behavior for such input and SHALL throw no exception.
7. FOR ALL valid New_Messages values, parsing the JSON serialization of the value SHALL produce a value deeply equal to the original (round-trip property), verified by a property-based test with at least 100 generated cases per New_Messages type.
8. WHEN `message-specs.ts` is implemented by Spec 0 task 5.1, THE Core SHALL add each New_Messages type to `MESSAGE_SPECS` exactly once.
9. THE Core SHALL export every added type, parser function, and constant through `packages/core/src/index.ts`, so that each can be imported from the Core package entry point.
10. THE Web_App and THE Local_Server SHALL import all message types and parsers from Core and SHALL define zero message types or parsing functions of their own that duplicate those in Core.
11. THE design document SHALL list every changed or added type in Core in a single table, with the columns type name, direction (client to server or server to client), added or changed, and added fields, for review by the three developers.

---

### Requirement 12: ローカル開発サーバーと HTTPS

**User Story:** As a developer, I want to open the app over HTTPS from a phone on the same LAN, so that I can test location and drawing on real devices.

#### Acceptance Criteria

1. WHEN a developer runs the dev command of `apps/web`, THE Dev_Server SHALL listen on `0.0.0.0` on a documented default port and serve the Web_App over HTTPS using a self-signed certificate.
2. WHEN a developer runs the `start` script of `apps/local-server`, THE Local_Server SHALL listen on `0.0.0.0` on the configured port for WebSocket connections.
3. WHEN a phone on the same LAN opens the Web_App through the Dev_Server HTTPS origin, THE Dev_Server SHALL forward WebSocket connections on a documented path of that origin to the Local_Server, so that the browser does not block the connection as mixed content.
4. THE Web_App SHALL build the WebSocket address from the page location, using `wss://` when the page is served over HTTPS and `ws://` when it is served over HTTP, and SHALL contain no hard-coded `localhost` or IP address.
5. WHERE the port environment variable is set to an integer from 1 to 65535, THE Local_Server SHALL listen on that port.
6. IF the port environment variable is not set, THEN THE Local_Server SHALL listen on the documented default port.
7. IF the port environment variable is set to a value that is not an integer from 1 to 65535, THEN THE Local_Server SHALL exit with a non-zero exit code and print an error message indicating the invalid port value.
8. THE file `apps/web/README.md` SHALL describe, in English, how to start the Dev_Server, how to find the LAN address of the developer machine, the default port, and how to accept the self-signed certificate warning on a phone.
9. WHEN a developer runs `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` from the repository root after this Spec is implemented, THE Monorepo SHALL finish each command with exit code 0.
10. IF the Local_Server receives a malformed message, THEN THE Local_Server SHALL send an ErrorMessage with the error code that matches the failure type, keep the connection open, and leave room state unchanged.
11. THE file `apps/local-server/README.md` SHALL describe, in English, how to start the Local_Server, the port environment variable, and its default value.
12. THE Monorepo SHALL keep the root `README.md`, which is the team's working document in Japanese, unchanged by this Spec.

---

### Requirement 13: テスト

**User Story:** As a developer, I want automated tests for the room logic and the geohash neighbor search, so that I can change them without breaking the prototype.

#### Acceptance Criteria

1. THE Core SHALL include Vitest tests, placed next to the tested file as `*.test.ts`, for the Room_Service covering creation, joining by room ID, joining by Room_Code, leaving, capacity, Drawing delivery, and expiry.
2. THE Core SHALL include Vitest tests for the Room_Service that cover each of the following error cases, and each test SHALL assert that the Room state is unchanged after the failure: joining a Room that is already at capacity, joining with a Room_Code that matches no Room, joining a Room ID that does not exist, and joining an expired Room.
3. THE Core SHALL include Vitest tests for the geohash encoding and the Neighbor_Cells, covering an interior cell (8 distinct neighbors, none equal to the center cell), and, as minimal tests that confirm the behavior of the geohash library, one cell on the longitude wrap-around edge (8 distinct neighbors, with the cells on the opposite side of longitude ±180 included), one cell in the northernmost row, and one cell in the southernmost row (5 distinct neighbors each, with no duplicates and no neighbor across the pole). The tests do not need to cover every case.
4. THE Core SHALL include property-based tests that run at least 100 generated cases each, one for the round-trip of New_Messages (serializing and then parsing a valid message yields a message equal to the original) and one for the symmetry of Neighbor_Cells (if cell B is in the Neighbor_Cells of cell A, then cell A is in the Neighbor_Cells of cell B).
5. THE Core SHALL include tests that run against the Room_Store interface, using `MemoryRoomStore` as the first implementation, and the tests SHALL be written so that another Room_Store implementation can be run through the same test cases without changing the test assertions.
6. THE Local_Server SHALL include a Vitest test in which two WebSocket clients join the same Room, one client sends a Drawing, and the other client receives that Drawing within 2000 milliseconds with content equal to what was sent.
7. THE Local_Server SHALL include a Vitest test in which a Drawing sent by a client in one Room is not received by a client in a different Room within 1000 milliseconds.
8. THE Web_App SHALL include Vitest tests for the Canvas_Pad conversion that cover a source canvas larger than 512 pixels (width, height, or both) and a source canvas of 512 pixels or smaller, and each test SHALL assert that the output is a valid PNG with width and height each at most 512 pixels and with the original aspect ratio preserved.
9. WHEN `npm test` runs from the repository root, THE Monorepo SHALL run all tests added by this Spec and SHALL exit with a non-zero exit code if any of those tests fails.

---

### Requirement 14: プライバシーと範囲

**User Story:** As a participant, I want my exact position and identity to stay private, so that I can use the app safely with strangers.

#### Acceptance Criteria

1. THE Local_Server SHALL receive and store no latitude or longitude value.
2. THE parser SHALL discard fields not defined for a message type (including any latitude or longitude field), and THE Local_Server SHALL store none of them.
3. THE Local_Server SHALL write no latitude, longitude, or image content to its logs.
4. THE Web_App SHALL contain no account registration screen, no login screen, and no text-entry chat input.
5. WHEN a participant sends a Drawing, THE Room_Service SHALL identify the sender only by Participant_Identity and SHALL store no participant name, no IP address, and no device identifier.
6. WHEN Room_Retention ends for a Room, THE Room_Service SHALL make the Drawings of that Room unavailable to every client within 60 seconds, and any request for those Drawings after that time SHALL receive an error indication that the Room no longer exists.
7. WHEN Room_Retention ends for a Room, THE Room_Service SHALL delete the stored Drawings and the participant records of that Room.
