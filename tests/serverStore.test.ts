import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore } from "../server/store.mjs";
import { BACKUP_VERSION, defaultState } from "../src/domain/validation";

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


/**
 * A3（审计差距 3 收尾）：服务端对任务字段保持「无感知透传」契约的钉子。
 * 设计事实（store.mjs 头部注释）：服务端刻意不实现业务 schema——清洗与兜底是
 * 客户端 domain/validation.ts 的职责（A1 已覆盖旧数据缺 tags 的迁移）。这里锁住：
 * 服务端不丢新字段、不擅自动手补字段，以及三处 schema 版本互相同步。
 */
describe("server store 对任务字段保持无感知透传（A3）", () => {
  it("带 tags 的新格式任务经 write→read 后字段原样保留", () => {
    const dir = mkdtempSync(join(tmpdir(), "ap-tags-"));
    try {
      const store = createStore({ file: join(dir, "state.json") });
      const task = {
        id: "t1",
        title: "带标签的任务",
        tags: ["工作", "学习"],
        importance: "high",
        done: false,
        archived: false,
        updatedAt: Date.parse("2026-11-13T03:30:00.000Z"),
      };
      store.write(0, { version: 3, tasks: [task] });
      // store.mjs 无类型（.mjs），read() 的 state 是 unknown——测试内断言形状
      const { state } = store.read() as { state: { tasks: Array<{ tags: string[] }> } };
      expect(state.tasks[0].tags).toEqual(["工作", "学习"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("旧格式任务（无 tags）读写不崩溃，且服务端不擅自补字段", () => {
    const dir = mkdtempSync(join(tmpdir(), "ap-legacy-"));
    try {
      const file = join(dir, "state.json");
      writeFileSync(file, JSON.stringify({ rev: 0, state: { version: 3, tasks: [{ id: "t0", title: "旧任务" }] } }));
      const store = createStore({ file });
      const { state } = store.read() as { state: { tasks: Array<Record<string, unknown>> } };
      expect(state.tasks[0].title).toBe("旧任务");
      expect("tags" in state.tasks[0]).toBe(false); // 服务端不清洗：保持薄，透传
      expect(() => store.write(store.read().rev, state)).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("三处 schema 版本常量互相同步（store.mjs / index.mjs / validation.ts）", () => {
    // 审计 Bug 3 的根因就是版本脱钩；现有测试锁了字面值 v3，这里锁「三处互相相等」——
    // 未来客户端升 v4 而服务端忘改时，这条会先红。用正则读源码而非 import index.mjs（有启动副作用）。
    const storeSrc = readFileSync(new URL("../server/store.mjs", import.meta.url), "utf8");
    const indexSrc = readFileSync(new URL("../server/index.mjs", import.meta.url), "utf8");
    const storeV = Number(storeSrc.match(/version:\s*(\d+)/)?.[1]);
    const indexV = Number(indexSrc.match(/SCHEMA_VERSION = (\d+)/)?.[1]);
    expect(storeV).toBe(BACKUP_VERSION);
    expect(indexV).toBe(BACKUP_VERSION);
  });

  it("EMPTY_STATE 与客户端 defaultState 的顶层键集合一致", () => {
    const dir = mkdtempSync(join(tmpdir(), "ap-keys-"));
    try {
      const store = createStore({ file: join(dir, "state.json") });
      const serverKeys = Object.keys(store.read().state).sort();
      const clientKeys = Object.keys(defaultState()).sort();
      expect(serverKeys).toEqual(clientKeys);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
