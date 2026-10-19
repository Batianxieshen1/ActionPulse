/** server/store.mjs 的类型声明（与 lan.d.mts 同理：服务端是纯 JS，这里是它的投影）。 */

export interface ServerStoreState {
  version?: number;
  tasks?: unknown[];
  habits?: unknown[];
  settings?: Record<string, unknown>;
  stats?: Record<string, unknown>;
  tombstones?: Record<string, number>;
  daily?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ServerStoreSnapshot {
  rev: number;
  state: ServerStoreState;
}

export interface ServerStoreWriteOk {
  ok: true;
  rev: number;
}

export interface ServerStoreWriteConflict {
  ok: false;
  rev: number;
  state: ServerStoreState;
}

export interface ServerStore {
  read(): ServerStoreSnapshot;
  write(baseRev: number, state: unknown): ServerStoreWriteOk | ServerStoreWriteConflict;
  reset(): number;
  file: string;
  /** 每日滚动快照目录（backups/，保留最近 7 份）。 */
  backupDir: string;
}

export function createStore(options: { file: string; now?: () => number }): ServerStore;
