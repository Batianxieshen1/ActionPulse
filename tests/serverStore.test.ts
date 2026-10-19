import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
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

/**
 * 审计路线图差距 6：每日滚动快照。当天首次写入前存档当时状态，
 * 保留最近 7 份——"手滑点清空全部任务"的后悔药。
 */
describe("每日滚动快照（审计路线图差距 6）", () => {
  it("每天首写前存档当时状态、同日不重复、滚动保留最近 7 份", () => {
    const dir = mkdtempSync(join(tmpdir(), "ap-snap-"));
    try {
      const file = join(dir, "state.json");
      let fakeNow = Date.parse("2026-10-01T09:00:00");
      const store = createStore({ file, now: () => fakeNow });

      // 第 1 天：两次写入。首日磁盘上还没有文件，没有值得保护的内容 → 不产生快照
      store.write(0, { version: 3, tasks: [{ title: "D1-A" }] });
      store.write(1, { version: 3, tasks: [{ title: "D1-B" }] });
      const backupDir = join(dir, "backups");
      expect(existsSync(backupDir)).toBe(false);

      // 第 2 天首写：快照"昨天首改前的最后状态"（即 D1-B）
      fakeNow = Date.parse("2026-10-02T08:00:00");
      store.write(2, { version: 3, tasks: [{ title: "D2" }] });
      const day2 = JSON.parse(readFileSync(join(backupDir, "state-2026-10-02.json"), "utf8"));
      expect(day2.state.tasks[0].title).toBe("D1-B");

      // 第 2 天第二次写入：不重复快照
      store.write(3, { version: 3, tasks: [{ title: "D2-B" }] });
      expect(readdirSync(backupDir).length).toBe(1);

      // 走到第 10 天（每天一次写入）：快照共 9 份（10-02..10-10）→ 裁剪到 7 份
      for (let day = 3; day <= 10; day += 1) {
        fakeNow = Date.parse(`2026-10-${String(day).padStart(2, "0")}T08:00:00`);
        store.write(store.read().rev, { version: 3, tasks: [{ title: `D${day}` }] });
      }
      const names = readdirSync(backupDir).sort();
      expect(names.length).toBe(7);
      expect(names[0]).toBe("state-2026-10-04.json"); // 最老的两份被剪掉
      expect(names[6]).toBe("state-2026-10-10.json");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
