/**
 * 多端合并（同步的核心，纯函数、无 IO）。
 *
 * 设计取舍：
 *  - **按任务做 Last-Write-Wins**，而不是整份状态覆盖。整份覆盖会让"两台设备各打了一个勾"
 *    变成"只保留后写的那一个"。
 *  - **墓碑（tombstone）** 解决删除复活：A 删掉任务，B 的旧副本下次同步会把它推回来。
 *    删除时记录 (id -> 时间戳)，合并时若墓碑不早于任务自身的 updatedAt，就把任务丢掉。
 *  - **确定性的同分兜底**：两端 updatedAt 完全相同时，按序列化结果取较大者。
 *    这样 merge(a,b) 与 merge(b,a) 一定收敛到同一个值（交换律 + 幂等）。
 *  - **设置不同步**：手机关静音不该把电脑也静音，所以 settings 永远保留本地那一份。
 */
import { mergeHabits, sameHabits } from "./habits";
import { BACKUP_VERSION, defaultSettings, sanitizeState } from "./validation";
import type { AppState, Stats, Task } from "./types";

/** 墓碑保留 30 天：超过这个时间没同步过的设备，删除记录会被清理。 */
export const TOMBSTONE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export interface MergeResult {
  state: AppState;
  /** 远端是否带来了本地没有的信息。false 时调用方必须保持原状态引用，否则会形成同步回环。 */
  changed: boolean;
}

function pickNewer(a: Task, b: Task): Task {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
  // 两端字段顺序统一（都经过 sanitizeTask），所以序列化比较是稳定的
  return JSON.stringify(a) >= JSON.stringify(b) ? a : b;
}

function mergeTombstones(
  local: Record<string, number>,
  remote: Record<string, number>,
): Record<string, number> {
  const merged: Record<string, number> = { ...local };
  for (const [id, at] of Object.entries(remote)) {
    merged[id] = Math.max(merged[id] ?? 0, at);
  }
  return merged;
}

function mergeStats(a: Stats, b: Stats): Stats {
  let combo: number;
  let lastCompletionAt: number | null;
  if (a.lastCompletionAt === null && b.lastCompletionAt === null) {
    combo = Math.max(a.combo, b.combo);
    lastCompletionAt = null;
  } else if (a.lastCompletionAt === null) {
    combo = b.combo;
    lastCompletionAt = b.lastCompletionAt;
  } else if (b.lastCompletionAt === null) {
    combo = a.combo;
    lastCompletionAt = a.lastCompletionAt;
  } else if (a.lastCompletionAt >= b.lastCompletionAt) {
    combo = a.combo;
    lastCompletionAt = a.lastCompletionAt;
  } else {
    combo = b.combo;
    lastCompletionAt = b.lastCompletionAt;
  }

  return {
    combo,
    bestCombo: Math.max(a.bestCombo, b.bestCombo),
    lastCompletionAt,
    totalCompleted: Math.max(a.totalCompleted, b.totalCompleted),
    completionDates: [...new Set([...a.completionDates, ...b.completionDates])].sort(),
  };
}

function sameTasks(a: readonly Task[], b: readonly Task[]): boolean {
  if (a.length !== b.length) return false;
  // 不变量：任务内容一变，updatedAt 必变。因此只要 (id, updatedAt) 全等即可认定内容相同。
  const stamps = new Map(b.map((task) => [task.id, task.updatedAt]));
  return a.every((task) => stamps.get(task.id) === task.updatedAt);
}

function sameTombstones(a: Record<string, number>, b: Record<string, number>): boolean {
  const keysA = Object.keys(a);
  if (keysA.length !== Object.keys(b).length) return false;
  return keysA.every((key) => a[key] === b[key]);
}

/** 按日指标取最大值：幂等，不会因为同一份数据同步两次而重复计数。 */
function mergeDayMap(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const merged: Record<string, number> = { ...a };
  for (const [key, value] of Object.entries(b)) {
    merged[key] = Math.max(merged[key] ?? 0, value);
  }
  return merged;
}

function sameDayMap(a: Record<string, number>, b: Record<string, number>): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => a[key] === b[key]);
}

/**
 * 语义等价判断，刻意不看对象身份与键顺序。
 *
 * 注意：新增任何参与同步的字段都**必须**加进这里。
 * mergeStates 的 changed 完全依赖它 —— 漏掉一个字段，该字段的改动会被判成「没有变化」，
 * 于是 reducer 返回原引用：界面不重渲染、多端同步静默丢弃。这个坑在评审里专门标过。
 */
export function sameState(a: AppState, b: AppState): boolean {
  if (a.version !== b.version) return false;
  if (!sameTasks(a.tasks, b.tasks)) return false;
  if (!sameHabits(a.habits ?? [], b.habits ?? [])) return false;
  if (!sameDayMap(a.daily?.focusMinutes ?? {}, b.daily?.focusMinutes ?? {})) return false;
  if (!sameDayMap(a.daily?.comboPeak ?? {}, b.daily?.comboPeak ?? {})) return false;
  if (!sameTombstones(a.tombstones, b.tombstones)) return false;
  const sa = a.stats;
  const sb = b.stats;
  if (
    sa.combo !== sb.combo ||
    sa.bestCombo !== sb.bestCombo ||
    sa.lastCompletionAt !== sb.lastCompletionAt ||
    sa.totalCompleted !== sb.totalCompleted ||
    sa.completionDates.join(",") !== sb.completionDates.join(",")
  ) {
    return false;
  }
  return JSON.stringify(a.settings) === JSON.stringify(b.settings);
}

export function mergeStates(local: AppState, remote: unknown, now: number = Date.now()): MergeResult {
  // 只清洗远端：本地是自己产出的，重新清洗会引入细微差异，导致 changed 误判成 true → 同步回环。
  const incoming = sanitizeState(remote);
  const tombstones = mergeTombstones(local.tombstones ?? {}, incoming.tombstones);

  const byId = new Map<string, Task>();
  for (const task of local.tasks) byId.set(task.id, task);
  for (const task of incoming.tasks) {
    const existing = byId.get(task.id);
    byId.set(task.id, existing === undefined ? task : pickNewer(existing, task));
  }

  const tasks: Task[] = [];
  for (const task of byId.values()) {
    const deletedAt = tombstones[task.id];
    // 墓碑不早于任务本身 → 这个删除是最新的，任务不该存在
    if (deletedAt !== undefined && deletedAt >= task.updatedAt) continue;
    tasks.push(task);
  }
  tasks.sort(
    (a, b) => a.manualRank - b.manualRank || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );

  // 先按墓碑过滤完，再清理过期墓碑（顺序反了会让被删任务短暂复活）
  for (const [id, at] of Object.entries(tombstones)) {
    if (now - at > TOMBSTONE_RETENTION_MS) delete tombstones[id];
  }

  const state: AppState = {
    version: BACKUP_VERSION,
    tasks,
    habits: mergeHabits(local.habits ?? [], incoming.habits),
    settings: local.settings ?? defaultSettings(),
    stats: mergeStats(local.stats, incoming.stats),
    tombstones,
    daily: {
      focusMinutes: mergeDayMap(local.daily?.focusMinutes ?? {}, incoming.daily.focusMinutes),
      comboPeak: mergeDayMap(local.daily?.comboPeak ?? {}, incoming.daily.comboPeak),
    },
  };

  return { state, changed: !sameState(state, local) };
}
