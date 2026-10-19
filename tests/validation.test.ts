import { describe, expect, it } from "vitest";
import {
  BACKUP_APP,
  BACKUP_VERSION,
  createBackup,
  defaultSettings,
  defaultState,
  parseBackup,
  sanitizeSettings,
  sanitizeTask,
} from "../src/domain/validation";

describe("defaults", () => {
  it("starts in auto priority mode with feedback enabled", () => {
    const s = defaultSettings();
    expect(s.priorityMode).toBe("auto");
    expect(s.soundEnabled).toBe(true);
    expect(s.confettiEnabled).toBe(true);
    expect(s.pomodoroMinutes).toBe(25);
  });

  it("produces an empty but valid state", () => {
    const state = defaultState();
    expect(state.tasks).toEqual([]);
    expect(state.stats.combo).toBe(0);
    expect(state.stats.totalCompleted).toBe(0);
    expect(state.version).toBe(BACKUP_VERSION);
    expect(state.tombstones).toEqual({});
  });

  it("schema 已升到 v3（墓碑 + 习惯 + 日指标）", () => {
    expect(BACKUP_VERSION).toBe(3);
  });

  it("主题默认跟随系统", () => {
    expect(defaultSettings().theme).toBe("system");
  });

  it("非法主题值回落到 system，而不是把界面搞崩", () => {
    for (const bad of ["midnight", "", 42, null, undefined, {}, true]) {
      expect(sanitizeSettings({ theme: bad }).theme).toBe("system");
    }
  });

  it("三个合法主题值原样保留", () => {
    expect(sanitizeSettings({ theme: "light" }).theme).toBe("light");
    expect(sanitizeSettings({ theme: "dark" }).theme).toBe("dark");
    expect(sanitizeSettings({ theme: "system" }).theme).toBe("system");
  });

  it("系统通知开关：默认关闭，仅 true 被保留（审计路线图差距 4）", () => {
    expect(defaultSettings().notificationsEnabled).toBe(false);
    expect(sanitizeSettings({}).notificationsEnabled).toBe(false);
    expect(sanitizeSettings({ notificationsEnabled: true }).notificationsEnabled).toBe(true);
    expect(sanitizeSettings({ notificationsEnabled: "yes" }).notificationsEnabled).toBe(false);
    expect(sanitizeSettings({ notificationsEnabled: 1 }).notificationsEnabled).toBe(false);
  });

  it("主题能随备份往返（换设备时保留偏好）", () => {
    const state = defaultState();
    state.settings.theme = "light";
    const parsed = parseBackup(JSON.stringify(createBackup(state)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.state.settings.theme).toBe("light");
  });
});

describe("sanitizeTask", () => {
  it("rejects values that are not objects", () => {
    expect(sanitizeTask(null)).toBeNull();
    expect(sanitizeTask(42)).toBeNull();
    expect(sanitizeTask("nope")).toBeNull();
  });

  it("rejects a task without a usable title", () => {
    expect(sanitizeTask({ id: "a" })).toBeNull();
    expect(sanitizeTask({ title: "   " })).toBeNull();
    expect(sanitizeTask({ title: 123 })).toBeNull();
  });

  it("fills in every optional field with a safe default", () => {
    const task = sanitizeTask({ title: "买咖啡" });
    expect(task).not.toBeNull();
    expect(task!.importance).toBe("medium");
    expect(task!.due).toBeNull();
    expect(task!.estimateMinutes).toBeNull();
    expect(task!.quadrant).toBeNull();
    expect(task!.subtasks).toEqual([]);
    expect(task!.done).toBe(false);
    expect(task!.completedAt).toBeNull();
    expect(task!.archived).toBe(false);
    expect(typeof task!.id).toBe("string");
    expect(task!.id.length).toBeGreaterThan(0);
    expect(Number.isFinite(Date.parse(task!.createdAt))).toBe(true);
  });

  it("coerces an unknown importance to medium", () => {
    expect(sanitizeTask({ title: "x", importance: "URGENT" })!.importance).toBe("medium");
  });

  it("drops a malformed due date instead of storing garbage", () => {
    expect(sanitizeTask({ title: "x", due: "not-a-date" })!.due).toBeNull();
    expect(sanitizeTask({ title: "x", due: "2026-10-08" })!.due).toBe("2026-10-08");
  });

  it("rejects negative or non-numeric estimates", () => {
    expect(sanitizeTask({ title: "x", estimateMinutes: -5 })!.estimateMinutes).toBeNull();
    expect(sanitizeTask({ title: "x", estimateMinutes: "30" })!.estimateMinutes).toBeNull();
    expect(sanitizeTask({ title: "x", estimateMinutes: 30 })!.estimateMinutes).toBe(30);
  });

  it("keeps only well-formed subtasks", () => {
    const task = sanitizeTask({
      title: "x",
      subtasks: [{ title: "第一步" }, { title: "" }, null, { id: "s2", title: "第二步", done: true }],
    });
    expect(task!.subtasks).toHaveLength(2);
    expect(task!.subtasks[0].title).toBe("第一步");
    expect(task!.subtasks[1].done).toBe(true);
  });

  it("repairs a done flag without a completion timestamp", () => {
    const task = sanitizeTask({ title: "x", done: true, completedAt: null });
    expect(task!.done).toBe(true);
    expect(Number.isFinite(Date.parse(task!.completedAt!))).toBe(true);
  });

  it("clears a completion timestamp on an unfinished task", () => {
    const task = sanitizeTask({ title: "x", done: false, completedAt: "2026-10-08T09:00:00.000Z" });
    expect(task!.completedAt).toBeNull();
  });
});

describe("createBackup / parseBackup", () => {
  it("round-trips a full state losslessly", () => {
    const state = defaultState();
    state.tasks = [sanitizeTask({ title: "写周报", importance: "high", due: "2026-10-08", estimateMinutes: 25 })!];
    state.stats.combo = 3;
    state.stats.totalCompleted = 12;
    state.stats.completionDates = ["2026-10-08", "2026-10-07"];
    state.settings.soundVolume = 0.4;

    const text = JSON.stringify(createBackup(state, new Date("2026-10-08T12:00:00.000Z")));
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.state.tasks).toHaveLength(1);
    expect(parsed.state.tasks[0].title).toBe("写周报");
    expect(parsed.state.stats.combo).toBe(3);
    expect(parsed.state.settings.soundVolume).toBe(0.4);
  });

  it("stamps the app name, version and export time", () => {
    const backup = createBackup(defaultState(), new Date("2026-10-08T12:00:00.000Z"));
    expect(backup.app).toBe(BACKUP_APP);
    expect(backup.version).toBe(BACKUP_VERSION);
    expect(backup.exportedAt).toBe("2026-10-08T12:00:00.000Z");
  });

  it("rejects text that is not JSON", () => {
    const parsed = parseBackup("{not json");
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error).toContain("JSON");
  });

  it("rejects a backup from another application", () => {
    const parsed = parseBackup(JSON.stringify({ app: "something-else", version: 1, tasks: [] }));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error).toContain("ActionPulse");
  });

  it("rejects a backup from a newer, unknown schema version", () => {
    const parsed = parseBackup(JSON.stringify({ app: BACKUP_APP, version: 99, tasks: [] }));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error).toContain("99");
  });

  it("accepts a bare task array from a hand-written file", () => {
    const parsed = parseBackup(JSON.stringify([{ title: "手写任务" }]));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.state.tasks[0].title).toBe("手写任务");
  });

  it("drops unusable tasks but keeps the good ones", () => {
    const parsed = parseBackup(JSON.stringify({ app: BACKUP_APP, version: 1, tasks: [{ title: "好的" }, { nope: 1 }, null] }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.state.tasks).toHaveLength(1);
  });

  it("clamps a nonsensical sound volume into 0..1", () => {
    const parsed = parseBackup(JSON.stringify({ app: BACKUP_APP, version: 1, tasks: [], settings: { soundVolume: 42 } }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.state.settings.soundVolume).toBe(1);
  });

  it("能导入 v1 的旧备份并自动迁移（补出 updatedAt 与 tombstones）", () => {
    const v1 = {
      app: BACKUP_APP,
      version: 1,
      tasks: [{ id: "legacy", title: "上个版本的任务", createdAt: "2026-10-01T00:00:00.000Z" }],
      stats: { combo: 2, totalCompleted: 5, completionDates: ["2026-10-01"] },
    };
    const parsed = parseBackup(JSON.stringify(v1));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.state.version).toBe(3);
    expect(parsed.state.tasks[0].updatedAt).toBe(Date.parse("2026-10-01T00:00:00.000Z"));
    expect(parsed.state.tombstones).toEqual({});
    expect(parsed.state.stats.totalCompleted).toBe(5);
  });

  it("墓碑只保留合法的时间戳，脏数据被丢弃", () => {
    const parsed = parseBackup(
      JSON.stringify({ app: BACKUP_APP, version: 2, tasks: [], tombstones: { ok: 123, bad: "nope", nan: Number.NaN } }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.state.tombstones).toEqual({ ok: 123 });
  });

  it("墓碑能随备份一起导出与还原", () => {
    const state = defaultState();
    state.tombstones = { gone: 1700000000000 };
    const parsed = parseBackup(JSON.stringify(createBackup(state)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.state.tombstones.gone).toBe(1700000000000);
  });

  it("refuses a payload whose tasks field is not an array", () => {
    const parsed = parseBackup(JSON.stringify({ app: BACKUP_APP, version: 1, tasks: "nope" }));
    expect(parsed.ok).toBe(false);
  });
});
