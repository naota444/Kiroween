// ローカル開発用 WebSocket サーバーの入口
import { pathToFileURL } from 'node:url';
import { DEFAULT_PORT, InvalidPortError, parsePort } from './config.js';
import { createConsoleLogger } from './logger.js';
import { createLocalServer, WS_PATH, type LocalServer } from './server.js';

export { DEFAULT_PORT };

export function startupMessage(port: number = DEFAULT_PORT): string {
  return `local-server: listening on ws://localhost:${port}${WS_PATH}`;
}

export interface MainIo {
  stdout: (line: string) => void;
  stderr: (line: string) => void;
  exit: (code: number) => void;
}

const defaultIo: MainIo = {
  stdout: (line) => console.log(line),
  stderr: (line) => console.error(line),
  exit: (code) => {
    process.exitCode = code;
  },
};

/** 起動に成功したらサーバーを返す。ポート指定の誤りや使用中のときは stderr に出して exit(1) し、undefined を返す */
export async function main(
  env: Record<string, string | undefined> = process.env,
  io: MainIo = defaultIo,
): Promise<LocalServer | undefined> {
  let port: number;
  try {
    port = parsePort(env);
  } catch (error) {
    if (error instanceof InvalidPortError) {
      io.stderr(error.message);
      io.exit(1);
      return undefined;
    }
    throw error;
  }
  try {
    const server = await createLocalServer({ port, logger: createConsoleLogger() });
    io.stdout(startupMessage(server.port));
    return server;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      io.stderr(
        `local-server: port ${port} is already in use. Set LOCAL_SERVER_PORT to another number.`,
      );
      io.exit(1);
      return undefined;
    }
    throw error;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  void main();
}
