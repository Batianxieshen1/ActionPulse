import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore } from "../server/store.mjs";

/**
 * 审计 Bug 3：服务端空状态骨架必须与 index.mjs 的 SCHEMA_VERSION（=3）
 * 及客户端 BACKUP_VERSION 同版。修复前它是 version: 2 且缺 habits/daily，
 * 全新环境的 /api/state 与 /api/health（schema: 3）自相矛盾。
 */
describe("server store 空状态与 schema 版本对齐（审计 Bug 3）", () => {
  it("全新 store 的空状态为 v3，且带 habits / daily 完整骨架", () => {
    const dir = mkdtempSync(join(tmpdir(), "ap-store-"));
    try {
      const store = createStore({ file: join(dir, "state.json") });
      const { rev, state } = store.read();
      expect(rev).toBe(0);
      expect(state.version).toBe(3);
      expect(state.habits).toEqual([]);
      expect(state.daily).toEqual({ focusMinutes: {}, comboPeak: {} });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
