/**
 * 数据校验 / 持久化契约 / 导入导出。
 *
 * 落地决策：
 *  - 备份信封 { app, version, exportedAt, tasks, settings, stats, tombstones }，app = "actionpulse"。
 *  - 导入是**宽容**的：字段缺失/类型不对会被修复成安全默认值，坏任务被丢弃而不是整份拒绝；
 *    只有「不是 JSON / 不是 ActionPulse 备份 / 版本高于本版」三种情况才拒绝导入。
 *  - 也接受直接粘贴一个任务数组（方便手工编辑）。
 *  - **v1 → v2 自动迁移**：v1 备份没有 updatedAt / tombstones，会被补出来（updatedAt 取 createdAt），
 *    因此老用户升级后数据不会丢。
 *  - 存储键 `actionpulse.v1` 刻意保持不变：schema 版本放在载荷里，改键会把用户已有数据变成孤儿。
 */
import { isValidDateKey } from "./dates";
import { createId } from "./id";
import { DEFAULT_HABIT_EMOJI } from "./habits";
import type {
  AppState,
  DailyHabit,
  DailyMetrics,
  Importance,
  Quadrant,
  Settings,
  Stats,
  SubTask,
  Task,
  ThemePreference,
} from "./types";

export const BACKUP_APP = "actionpulse";
/** v3：新增 habits（G-Set）与 daily（专注时长 / 连击峰值）。v1、v2 备份仍可导入。 */
export const BACKUP_VERSION = 3;

export interface Backup {
  app: string;
  version: number;
  exportedAt: string;
  tasks: Task[];
  habits: DailyHabit[];
  settings: Settings;
  stats: Stats;
  tombstones: Record<string, number>;
  daily: DailyMetrics;
}

export type ParseResult = { ok: true; state: AppState } | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNotNull<T>(value: T | null): value is T {
  return value !== null;
}

function normalizeIso(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

/** updatedAt 缺省时回落到 createdAt，保证老数据也有可比较的时间戳。 */
function normalizeStamp(value: unknown, fallbackIso: string): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  const fromCreated = Date.parse(fallbackIso);
  return Number.isFinite(fromCreated) ? fromCreated : Date.now();
}

function sanitizeTombstones(raw: unknown): Record<string, number> {
  if (!isRecord(raw)) return {};
  const out: Record<string, number> = {};
  for (const [id, at] of Object.entries(raw)) {
    if (id.length > 0 && typeof at === "number" && Number.isFinite(at)) out[id] = at;
  }
  return out;
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  return Math.round(clamp(value, min, max, fallback));
}

function isImportance(value: unknown): value is Importance {
  return value === "high" || value === "medium" || value === "low";
}

function isQuadrant(value: unknown): value is Quadrant {
  return value === "q1" || value === "q2" || value === "q3" || value === "q4";
}

function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

export function defaultSettings(): Settings {
  return {
    priorityMode: "auto",
    soundEnabled: true,
    soundVolume: 0.6,
    vibrationEnabled: true,
    confettiEnabled: true,
    notificationsEnabled: false,
    encourageEnabled: true,
    pomodoroMinutes: 25,
    panelPinned: true,
    reduceMotion: false,
    aiBreakdown: true,
    theme: "system",
    language: "zh",
  };
}

export function defaultStats(): Stats {
  return { combo: 0, bestCombo: 0, lastCompletionAt: null, totalCompleted: 0, completionDates: [] };
}

export function defaultDaily(): DailyMetrics {
  return { focusMinutes: {}, comboPeak: {} };
}

export function defaultState(): AppState {
  return {
    version: BACKUP_VERSION,
    tasks: [],
    habits: [],
    settings: defaultSettings(),
    stats: defaultStats(),
    tombstones: {},
    daily: defaultDaily(),
  };
}

/** 习惯：标题必填；完成日期只保留合法日期键，去重并排序（G-Set 的规范形态）。 */
export function sanitizeHabit(raw: unknown, now: Date = new Date()): DailyHabit | null {
  if (!isRecord(raw)) return null;
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (title.length === 0) return null;

  const createdAt = normalizeStamp(raw.createdAt, now.toISOString());
  const schedule =
    raw.schedule === "weekdays" || raw.schedule === "weekly" ? raw.schedule : "daily";
  const rawDay = Number.isInteger(raw.scheduleDay) ? (raw.scheduleDay as number) : null;
  return {
    id: typeof raw.id === "string" && raw.id.trim().length > 0 ? raw.id : createId("habit"),
    title,
    emoji:
      typeof raw.emoji === "string" && raw.emoji.trim().length > 0 ? raw.emoji.trim() : DEFAULT_HABIT_EMOJI,
    schedule,
    // weekly 缺合法目标日时取创建日，保证行为确定；其他日程一律 null
    scheduleDay:
      schedule === "weekly"
        ? rawDay !== null && rawDay >= 0 && rawDay <= 6
          ? rawDay
          : new Date(createdAt).getDay()
        : null,
    completedDates: Array.isArray(raw.completedDates)
      ? [...new Set(raw.completedDates.filter((date) => isValidDateKey(date)))].sort()
      : [],
    archived: raw.archived === true,
    createdAt,
    updatedAt: normalizeStamp(raw.updatedAt, new Date(createdAt).toISOString()),
  };
}

/** 按日指标：只保留合法日期键与非负有限数。 */
function sanitizeDayMap(raw: unknown): Record<string, number> {
  if (!isRecord(raw)) return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!isValidDateKey(key)) continue;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) continue;
    out[key] = Math.round(value);
  }
  return out;
}

export function sanitizeDaily(raw: unknown): DailyMetrics {
  if (!isRecord(raw)) return defaultDaily();
  return {
    focusMinutes: sanitizeDayMap(raw.focusMinutes),
    comboPeak: sanitizeDayMap(raw.comboPeak),
  };
}

export function sanitizeSubtask(raw: unknown): SubTask | null {
  if (!isRecord(raw)) return null;
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (title.length === 0) return null;
  const done = raw.done === true;
  const completedAt = done ? normalizeIso(raw.completedAt) ?? new Date().toISOString() : null;
  const id = typeof raw.id === "string" && raw.id.trim().length > 0 ? raw.id : createId("sub");
  return { id, title, done, completedAt };
}

export function sanitizeTask(raw: unknown, now: Date = new Date()): Task | null {
  if (!isRecord(raw)) return null;
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (title.length === 0) return null;

  const done = raw.done === true;
  const createdAt = normalizeIso(raw.createdAt) ?? now.toISOString();
  return {
    id: typeof raw.id === "string" && raw.id.trim().length > 0 ? raw.id : createId("task"),
    title,
    notes: typeof raw.notes === "string" ? raw.notes : "",
    importance: isImportance(raw.importance) ? raw.importance : "medium",
    due: isValidDateKey(raw.due) ? raw.due : null,
    estimateMinutes:
      typeof raw.estimateMinutes === "number" && Number.isFinite(raw.estimateMinutes) && raw.estimateMinutes >= 0
        ? Math.round(raw.estimateMinutes)
        : null,
    quadrant: isQuadrant(raw.quadrant) ? raw.quadrant : null,
    manualRank: clampInt(raw.manualRank, 0, Number.MAX_SAFE_INTEGER, 0),
    subtasks: Array.isArray(raw.subtasks)
      ? raw.subtasks.map((entry) => sanitizeSubtask(entry)).filter(isNotNull)
      : [],
    done,
    createdAt,
    completedAt: done ? normalizeIso(raw.completedAt) ?? now.toISOString() : null,
    archived: raw.archived === true,
    updatedAt: normalizeStamp(raw.updatedAt, createdAt),
  };
}

export function sanitizeSettings(raw: unknown): Settings {
  const fallback = defaultSettings();
  if (!isRecord(raw)) return fallback;
  return {
    priorityMode: raw.priorityMode === "manual" ? "manual" : "auto",
    soundEnabled: raw.soundEnabled !== false,
    soundVolume: clamp(raw.soundVolume, 0, 1, fallback.soundVolume),
    vibrationEnabled: raw.vibrationEnabled !== false,
    confettiEnabled: raw.confettiEnabled !== false,
    notificationsEnabled: raw.notificationsEnabled === true,
    encourageEnabled: raw.encourageEnabled !== false,
    pomodoroMinutes: clampInt(raw.pomodoroMinutes, 1, 180, fallback.pomodoroMinutes),
    panelPinned: raw.panelPinned !== false,
    reduceMotion: raw.reduceMotion === true,
    aiBreakdown: raw.aiBreakdown !== false,
    theme: isThemePreference(raw.theme) ? raw.theme : "system",
    language: raw.language === "en" ? "en" : "zh",
  };
}

export function sanitizeStats(raw: unknown): Stats {
  if (!isRecord(raw)) return defaultStats();
  const combo = clampInt(raw.combo, 0, 1_000_000, 0);
  return {
    combo,
    bestCombo: Math.max(combo, clampInt(raw.bestCombo, 0, 1_000_000, 0)),
    lastCompletionAt:
      typeof raw.lastCompletionAt === "number" && Number.isFinite(raw.lastCompletionAt) ? raw.lastCompletionAt : null,
    totalCompleted: clampInt(raw.totalCompleted, 0, 1_000_000_000, 0),
    completionDates: Array.isArray(raw.completionDates)
      ? [...new Set(raw.completionDates.filter((key) => isValidDateKey(key)))].sort()
      : [],
  };
}

export function sanitizeState(raw: unknown): AppState {
  if (!isRecord(raw)) return defaultState();
  return {
    version: BACKUP_VERSION,
    tasks: Array.isArray(raw.tasks) ? raw.tasks.map((task) => sanitizeTask(task)).filter(isNotNull) : [],
    habits: Array.isArray(raw.habits)
      ? raw.habits.map((habit) => sanitizeHabit(habit)).filter(isNotNull)
      : [],
    settings: sanitizeSettings(raw.settings),
    stats: sanitizeStats(raw.stats),
    tombstones: sanitizeTombstones(raw.tombstones),
    daily: sanitizeDaily(raw.daily),
  };
}

export function createBackup(state: AppState, now: Date = new Date()): Backup {
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    tasks: state.tasks,
    habits: state.habits,
    settings: state.settings,
    stats: state.stats,
    tombstones: state.tombstones,
    daily: state.daily,
  };
}

export function parseBackup(text: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "不是有效的 JSON 文件，请选择 ActionPulse 导出的备份。" };
  }

  if (Array.isArray(parsed)) {
    const tasks = parsed.map((task) => sanitizeTask(task)).filter(isNotNull);
    if (tasks.length === 0) return { ok: false, error: "数组里没有任何可用的任务。" };
    return {
      ok: true,
      state: {
        version: BACKUP_VERSION,
        tasks,
        habits: [],
        settings: defaultSettings(),
        stats: defaultStats(),
        tombstones: {},
        daily: defaultDaily(),
      },
    };
  }

  if (!isRecord(parsed)) {
    return { ok: false, error: "备份内容既不是对象也不是任务数组，无法识别。" };
  }
  if (parsed.app !== BACKUP_APP) {
    return { ok: false, error: "这个文件不属于 ActionPulse 备份，已拒绝导入。" };
  }
  if (typeof parsed.version !== "number" || !Number.isFinite(parsed.version)) {
    return { ok: false, error: "备份缺少版本号，文件可能已损坏。" };
  }
  if (parsed.version > BACKUP_VERSION) {
    return {
      ok: false,
      error: `备份版本 ${parsed.version} 高于当前支持的版本 ${BACKUP_VERSION}，请先升级 ActionPulse。`,
    };
  }
  if (!Array.isArray(parsed.tasks)) {
    return { ok: false, error: "备份缺少 tasks 列表，文件可能已损坏。" };
  }

  return {
    ok: true,
    state: {
      version: BACKUP_VERSION,
      tasks: parsed.tasks.map((task) => sanitizeTask(task)).filter(isNotNull),
      habits: Array.isArray(parsed.habits)
        ? parsed.habits.map((habit) => sanitizeHabit(habit)).filter(isNotNull)
        : [],
      settings: sanitizeSettings(parsed.settings),
      stats: sanitizeStats(parsed.stats),
      tombstones: sanitizeTombstones(parsed.tombstones),
      daily: sanitizeDaily(parsed.daily),
    },
  };
}
