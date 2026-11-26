# Local server

## What this is

A WebSocket server for local development of Doodle Nearby. It uses the `ws` library and keeps all rooms in memory. It does not use AWS.

## Start

From the repository root:

```sh
npm start -w apps/local-server
```

On Windows PowerShell:

```powershell
npm.cmd start -w apps/local-server
```

## Configuration

| Variable            | Meaning                             | Default |
| ------------------- | ----------------------------------- | ------- |
| `LOCAL_SERVER_PORT` | Port to listen on (integer 1-65535) | `8787`  |

If the value is not an integer from 1 to 65535, the server prints an error and exits with code 1.

## Endpoint

```
ws://0.0.0.0:<port>/ws
```

The server listens on all network interfaces, so other devices on the same network can connect.

## Limits

- One message is at most 32,768 bytes. A larger message gets a `message_too_large` error, and the connection stays open.
- If a message is larger than 1 MiB, the `ws` library closes the connection.
- A room holds at most 8 people and 50 drawings.
- Rooms are deleted after 3 hours.

## Privacy

- The server does not store latitude or longitude, IP addresses, or names.
- Logs do not contain locations or images.

## Warning: LAN exposure

The server has no authentication. Anyone who can reach the port can create and join rooms. Use it only on a network you trust, and do not expose the port to the internet.
