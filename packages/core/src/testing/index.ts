/**
 * テスト用の部品。サブパス '@doodle-nearby/core/testing' として公開する。
 * 本体の index.ts からは再エクスポートしない(vitest を本体の import に混ぜないため)。
 */
export * from './room-store-contract.js';
export * from './room-service-fixture.js';
