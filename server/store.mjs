/**
 * 服务端状态仓库：一个 JSON 文件 + 一个单调递增的 rev。
 *
 * 刻意做得很薄：
 *  - 服务端**不实现业务 schema**（那是客户端 domain/validation.ts 的职责，且有单测覆盖），
 *    它只做「带版本号的存取」，避免同一套规则两边各写一遍然后慢慢跑偏。
 *  - 写盘用「临时文件 + rename」，避免断电/崩溃留下半截 JSON。
 *  - 乐观锁：PUT 必须带 baseRev，不匹配就返回 409 + 最新状态，由客户端合并后重试。
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * 空状态骨架。**必须与 index.mjs 的 SCHEMA_VERSION 及
 * 客户端 domain/validation.ts 的 BACKUP_VERSION 保持同版**——
 * 三处任何一处落后，全新环境的 /api/state 与 /api/health 就会互相矛盾
 * （曾经写死 v2 且缺 habits/daily，见审计 Bug 3）。
 */
const EMPTY_STATE = {
  version: 3,
  tasks: [],
  habits: [],
  settings: {},
  stats: { combo: 0, bestCombo: 0, lastCompletionAt: null, totalCompleted: 0, completionDates: [] },
  tombstones: {},
  daily: { focusMinutes: {}, comboPeak: {} },
};

/** 滚动快照保留份数。 */
const BACKUP_KEEP = 7;

export function createStore({ file, now = () => Date.now() }) {
  let cache = null;
  const backupDir = join(dirname(file), "backups");

  function read() {
    if (cache) return cache;
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8"));
      cache = {
        rev: Number.isFinite(parsed?.rev) ? parsed.rev : 0,
        state: parsed?.state && typeof parsed.state === "object" ? parsed.state : structuredClone(EMPTY_STATE),
      };
    } catch {
      cache = { rev: 0, state: structuredClone(EMPTY_STATE) };
    }
    return cache;
  }

  function todayKey() {
    const d = new Date(now());
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${month}-${day}`;
  }

  /**
   * 每日滚动快照（审计路线图差距 6）：当天**第一次**写入之前，把当时的 state.json
   * 存档为 backups/state-<今日>.json —— 内容是"今天首改前的最后状态"，
   * 对"手滑点了清空全部任务"这类事故就是一张后悔药。保留最近 BACKUP_KEEP 份。
   *
   * "首次"判定：进程内用 lastSnapshotDay 记账；重启后回退到「今日快照文件是否已存在」。
   * 快照是保险、不是主链路：任何失败都静默放过，绝不影响正常读写。
   */
  let lastSnapshotDay = null;
  function snapshotOncePerDay() {
    try {
      const today = todayKey();
      if (today === lastSnapshotDay) return;
      lastSnapshotDay = today; // 无论有无内容可存，今天只处理这一次
      if (existsSync(join(backupDir, `state-${today}.json`))) return; // 重启前已存过
      if (!existsSync(file)) return; // 首次启动，还没有值得保护的内容
      mkdirSync(backupDir, { recursive: true });
      copyFileSync(file, join(backupDir, `state-${today}.json`));
      pruneBackups();
    } catch {
      // 静默：快照失败不配影响主流程
    }
  }

  function pruneBackups() {
    try {
      const names = readdirSync(backupDir)
        .filter((name) => /^state-\d{4}-\d{2}-\d{2}\.json$/.test(name))
        .sort();
      for (const name of names.slice(0, Math.max(0, names.length - BACKUP_KEEP))) {
        unlinkSync(join(backupDir, name));
      }
    } catch {
      // 同上
    }
  }

  function persist(next) {
    snapshotOncePerDay();
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(next, null, 2));
    renameSync(tmp, file);
  }

  function write(baseRev, state) {
    const current = read();
    if (baseRev !== current.rev) {
      return { ok: false, rev: current.rev, state: current.state };
    }
    const next = { rev: current.rev + 1, state };
    persist(next);
    cache = next;
    return { ok: true, rev: next.rev };
  }

  function reset() {
    const next = { rev: read().rev + 1, state: structuredClone(EMPTY_STATE) };
    persist(next);
    cache = next;
    return next.rev;
  }

  return { read, write, reset, file, backupDir };
}
