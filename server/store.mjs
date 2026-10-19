/**
 * 服务端状态仓库：一个 JSON 文件 + 一个单调递增的 rev。
 *
 * 刻意做得很薄：
 *  - 服务端**不实现业务 schema**（那是客户端 domain/validation.ts 的职责，且有单测覆盖），
 *    它只做「带版本号的存取」，避免同一套规则两边各写一遍然后慢慢跑偏。
 *  - 写盘用「临时文件 + rename」，避免断电/崩溃留下半截 JSON。
 *  - 乐观锁：PUT 必须带 baseRev，不匹配就返回 409 + 最新状态，由客户端合并后重试。
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

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

export function createStore({ file }) {
  let cache = null;

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

  function persist(next) {
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

  return { read, write, reset, file };
}
