// DynamoDB の TTL に使う秒数。
// infra/lib/constants.ts と同じ値にする(backend/lambdas の rootDir は src なので infra を import できない)。
// 一致は tests/repo/ttl-constants.test.ts が確かめる。このファイルは、ほかのファイルを import しない。
export const TTL_MARGIN_SECONDS = 3600;
export const CONNECTION_TTL_SECONDS = 10800;
