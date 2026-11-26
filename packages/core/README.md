# @doodle-nearby/core

Shared logic for Doodle Nearby: WebSocket message types, room logic, and the interfaces used by the web app, the local server, and the Lambda handlers.

The message types live in `src/messages.ts`. When you add or change a message type, update `MESSAGE_SPECS` in `src/message-specs.ts` and the table below.

| Type              | Direction     | Fields                                                    |
| ----------------- | ------------- | --------------------------------------------------------- |
| Join              | Client→Server | type, roomId, geohash, roomCode                           |
| Leave             | Client→Server | type, roomId                                              |
| DrawingSubmit     | Client→Server | type, roomId, imageData, imageKey                         |
| CreateRoom        | Client→Server | type, geohash                                             |
| JoinByCode        | Client→Server | type, roomCode                                            |
| RoomList          | Server→Client | type, rooms                                               |
| AiComment         | Server→Client | type, roomId, text                                        |
| AiPrompt          | Server→Client | type, roomId, text                                        |
| AiCard            | Server→Client | type, roomId, text, imageKey                              |
| ErrorMessage      | Server→Client | type, code, message                                       |
| RoomCreated       | Server→Client | type, roomId, roomCode                                    |
| RoomJoined        | Server→Client | type, roomId, roomCode, you, participants                 |
| RoomLeft          | Server→Client | type, roomId                                              |
| ParticipantJoined | Server→Client | type, roomId, participant                                 |
| ParticipantLeft   | Server→Client | type, roomId, participant                                 |
| DrawingAdded      | Server→Client | type, roomId, drawingId, seq, sender, imageData, imageKey |
