import { describe, expect, it } from "vitest";
import { MAX_FOCUS_RECORD_MINUTES, activeHabitList, createTask, energy, reducer } from "../src/store/taskStore";
import { defaultState } from "../src/domain/validation";
import { dateKeyOf } from "../src/domain/dates";
import type { AppState, Task } from "../src/domain/types";

const NOW = Date.parse("2026-10-08T10:00:00.000Z");

function stateWith(tasks: Partial<Task>[]): AppState {
  const state = defaultState();
  state.tasks = tasks.map((patch, i) => createTask({ title: patch.title ?? `任务${i}`, ...patch }, NOW + i));
  return state;
}

describe("createTask", () => {
  it("applies spec defaults and a unique id", () => {
    const a = createTask({ title: "写周报" }, NOW);
    const b = createTask({ title: "写周报" }, NOW);
    expect(a.id).not.toBe(b.id);
    expect(a.importance).toBe("medium");
    expect(a.due).toBeNull();
    expect(a.estimateMinutes).toBeNull();
    expect(a.subtasks).toEqual([]);
    expect(a.done).toBe(false);
    expect(a.quadrant).toBeNull();
    expect(a.archived).toBe(false);
  });

  it("supports the Eisenhower quadrant shorthand on creation", () => {
    expect(createTask({ title: "x", quadrant: "q2" }, NOW).quadrant).toBe("q2");
  });
});

describe("task/add", () => {
  it("appends a task and assigns it the next manual rank", () => {
    const next = reducer(stateWith([{}]), { type: "task/add", title: "新任务", now: NOW });
    expect(next.tasks).toHaveLength(2);
    expect(next.tasks[1].title).toBe("新任务");
    expect(next.tasks[1].manualRank).toBe(1);
  });

  it("ignores an empty title", () => {
    const prev = stateWith([]);
    expect(reducer(prev, { type: "task/add", title: "   ", now: NOW })).toBe(prev);
  });
});

describe("task/toggle", () => {
  it("marks a task done and stamps the completion time", () => {
    const prev = stateWith([{ title: "a" }]);
    const next = reducer(prev, { type: "task/toggle", id: prev.tasks[0].id, now: NOW });
    expect(next.tasks[0].done).toBe(true);
    expect(next.tasks[0].completedAt).toBe(new Date(NOW).toISOString());
  });

  it("starts and grows the combo burst", () => {
    let state = stateWith([{ title: "a" }, { title: "b" }]);
    state = reducer(state, { type: "task/toggle", id: state.tasks[0].id, now: NOW });
    expect(state.stats.combo).toBe(1);
    state = reducer(state, { type: "task/toggle", id: state.tasks[1].id, now: NOW + 60_000 });
    expect(state.stats.combo).toBe(2);
    expect(state.stats.bestCombo).toBe(2);
    expect(state.stats.totalCompleted).toBe(2);
  });

  it("records the completion date once per day for the daily streak", () => {
    let state = stateWith([{ title: "a" }, { title: "b" }]);
    state = reducer(state, { type: "task/toggle", id: state.tasks[0].id, now: NOW });
    state = reducer(state, { type: "task/toggle", id: state.tasks[1].id, now: NOW + 60_000 });
    expect(state.stats.completionDates).toEqual(["2026-10-08"]);
  });

  it("un-checking clears the completion stamp without inventing a negative combo", () => {
    let state = stateWith([{ title: "a" }]);
    state = reducer(state, { type: "task/toggle", id: state.tasks[0].id, now: NOW });
    const undone = reducer(state, { type: "task/toggle", id: state.tasks[0].id, now: NOW + 1000 });
    expect(undone.tasks[0].done).toBe(false);
    expect(undone.tasks[0].completedAt).toBeNull();
    expect(undone.stats.combo).toBe(1);
    expect(undone.stats.totalCompleted).toBe(1);
  });

  it("is a no-op for an unknown id", () => {
    const prev = stateWith([{ title: "a" }]);
    expect(reducer(prev, { type: "task/toggle", id: "missing", now: NOW })).toBe(prev);
  });
});

describe("subtasks", () => {
  it("toggles a single micro-step and stamps it", () => {
    const prev = stateWith([{ title: "a", subtasks: [{ id: "s1", title: "第一步", done: false, completedAt: null }] }]);
    const next = reducer(prev, { type: "subtask/toggle", taskId: prev.tasks[0].id, subId: "s1", now: NOW });
    expect(next.tasks[0].subtasks[0].done).toBe(true);
    expect(next.tasks[0].subtasks[0].completedAt).toBe(new Date(NOW).toISOString());
  });

  it("does not auto-complete the parent when the last micro-step is ticked", () => {
    const prev = stateWith([{ title: "a", subtasks: [{ id: "s1", title: "第一步", done: false, completedAt: null }] }]);
    const next = reducer(prev, { type: "subtask/toggle", taskId: prev.tasks[0].id, subId: "s1", now: NOW });
    expect(next.tasks[0].done).toBe(false);
  });

  it("adds a micro-step with a generated id", () => {
    const prev = stateWith([{ title: "a" }]);
    const next = reducer(prev, { type: "subtask/add", taskId: prev.tasks[0].id, title: "打开文档" });
    expect(next.tasks[0].subtasks).toHaveLength(1);
    expect(next.tasks[0].subtasks[0].title).toBe("打开文档");
    expect(next.tasks[0].subtasks[0].done).toBe(false);
  });

  it("replaces the whole micro-step list in bulk (used by the auto-breakdown)", () => {
    const prev = stateWith([{ title: "a", subtasks: [{ id: "old", title: "旧", done: true, completedAt: null }] }]);
    const next = reducer(prev, { type: "subtask/set", taskId: prev.tasks[0].id, titles: ["一", "二", "三"] });
    expect(next.tasks[0].subtasks.map((s) => s.title)).toEqual(["一", "二", "三"]);
    expect(next.tasks[0].subtasks.every((s) => !s.done)).toBe(true);
  });
});

describe("manual mode", () => {
  it("moves a task to a new position and renumbers the ranks", () => {
    const prev = stateWith([{ title: "a" }, { title: "b" }, { title: "c" }]);
    const moved = reducer(prev, { type: "task/move", id: prev.tasks[2].id, toIndex: 0 });
    expect(moved.tasks.map((t) => t.title)).toEqual(["c", "a", "b"]);
    expect(moved.tasks.map((t) => t.manualRank)).toEqual([0, 1, 2]);
  });

  it("clamps an out-of-range target index", () => {
    const prev = stateWith([{ title: "a" }, { title: "b" }]);
    const moved = reducer(prev, { type: "task/move", id: prev.tasks[0].id, toIndex: 99 });
    expect(moved.tasks.map((t) => t.title)).toEqual(["b", "a"]);
  });

  it("assigns a task to an Eisenhower quadrant", () => {
    const prev = stateWith([{ title: "a" }]);
    const next = reducer(prev, { type: "task/update", id: prev.tasks[0].id, patch: { quadrant: "q1" } });
    expect(next.tasks[0].quadrant).toBe("q1");
  });

  it("switches the priority engine without touching the tasks", () => {
    const prev = stateWith([{ title: "a" }]);
    const next = reducer(prev, { type: "settings/patch", patch: { priorityMode: "manual" } });
    expect(next.settings.priorityMode).toBe("manual");
    expect(next.tasks).toEqual(prev.tasks);
  });
});

describe("task/remove and task/archiveCompleted", () => {
  it("removes a task by id", () => {
    const prev = stateWith([{ title: "a" }, { title: "b" }]);
    const next = reducer(prev, { type: "task/remove", id: prev.tasks[0].id });
    expect(next.tasks.map((t) => t.title)).toEqual(["b"]);
  });

  it("archives finished tasks so they leave the active list without being destroyed", () => {
    let state = stateWith([{ title: "a" }, { title: "b" }]);
    state = reducer(state, { type: "task/toggle", id: state.tasks[0].id, now: NOW });
    const archived = reducer(state, { type: "task/archiveCompleted" });
    expect(archived.tasks).toHaveLength(2);
    expect(archived.tasks[0].archived).toBe(true);
    expect(archived.tasks[1].archived).toBe(false);
  });
});

describe("state/import and state/reset", () => {
  it("replaces the whole state on import", () => {
    const prev = stateWith([{ title: "a" }]);
    const incoming = defaultState();
    incoming.tasks = [createTask({ title: "导入的" }, NOW)];
    const next = reducer(prev, { type: "state/import", state: incoming });
    expect(next.tasks.map((t) => t.title)).toEqual(["导入的"]);
  });

  it("resets tasks but keeps the user's device settings", () => {
    let prev = stateWith([{ title: "a" }]);
    prev = reducer(prev, { type: "settings/patch", patch: { soundVolume: 0.3 } });
    const next = reducer(prev, { type: "state/reset" });
    expect(next.tasks).toEqual([]);
    expect(next.settings.soundVolume).toBe(0.3);
    expect(next.stats.totalCompleted).toBe(0);
  });
});

describe("墓碑与同步（v2）", () => {
  it("删除任务会留下墓碑，防止别的设备把旧副本推回来复活它", () => {
    const prev = stateWith([{ title: "a" }]);
    const id = prev.tasks[0].id;
    const next = reducer(prev, { type: "task/remove", id });
    expect(next.tasks).toHaveLength(0);
    expect(next.tombstones[id]).toBeGreaterThan(0);
  });

  it("每次内容改动都推进 updatedAt，冲突合并才有新旧可判", () => {
    const prev = stateWith([{ title: "a" }]);
    const before = prev.tasks[0].updatedAt;
    const next = reducer(prev, { type: "task/update", id: prev.tasks[0].id, patch: { title: "改了" } });
    expect(next.tasks[0].updatedAt).toBeGreaterThan(before);
  });

  it("勾选完成同样推进 updatedAt（否则完成状态会被别的设备覆盖回去）", () => {
    const prev = stateWith([{ title: "a" }]);
    const next = reducer(prev, { type: "task/toggle", id: prev.tasks[0].id, now: NOW });
    expect(next.tasks[0].updatedAt).toBeGreaterThanOrEqual(NOW);
  });

  it("微步骤改动推进父任务的 updatedAt", () => {
    const prev = stateWith([{ title: "a", subtasks: [{ id: "s1", title: "一", done: false, completedAt: null }] }]);
    const before = prev.tasks[0].updatedAt;
    const next = reducer(prev, { type: "subtask/toggle", taskId: prev.tasks[0].id, subId: "s1", now: NOW });
    expect(next.tasks[0].updatedAt).toBeGreaterThan(before);
  });

  it("state/merge 把远端的新任务并进来", () => {
    const prev = stateWith([{ title: "本地" }]);
    const remote = defaultState();
    remote.tasks = [{ ...createTask({ title: "远端" }, NOW + 500), id: "r1", updatedAt: NOW + 500 }];
    const next = reducer(prev, { type: "state/merge", state: remote, now: NOW + 600 });
    expect(next.tasks.map((t) => t.title).sort()).toEqual(["本地", "远端"]);
  });

  it("合并没有带来新信息时返回原引用（这是同步不回环的关键）", () => {
    const prev = stateWith([{ title: "a" }]);
    expect(reducer(prev, { type: "state/merge", state: prev, now: NOW })).toBe(prev);
  });

  it("清空任务会为每个任务立墓碑，否则别的设备会把它们推回来", () => {
    const prev = stateWith([{ title: "a" }, { title: "b" }]);
    const ids = prev.tasks.map((t) => t.id);
    const next = reducer(prev, { type: "state/reset" });
    expect(next.tasks).toHaveLength(0);
    expect(Object.keys(next.tombstones).sort()).toEqual(ids.slice().sort());
  });
});

describe("每日习惯（v2.1 模块一）", () => {
  const day = (ts: number) => dateKeyOf(ts)!;

  it("新增习惯：默认 emoji、初始未打勾", () => {
    const next = reducer(defaultState(), { type: "habit/add", title: "喝水", now: NOW });
    expect(next.habits).toHaveLength(1);
    expect(next.habits[0].title).toBe("喝水");
    expect(next.habits[0].emoji).toBe("⚡");
    expect(next.habits[0].completedDates).toEqual([]);
  });

  it("空标题不加", () => {
    const prev = defaultState();
    expect(reducer(prev, { type: "habit/add", title: "  ", now: NOW })).toBe(prev);
  });

  it("打勾记录的是 now 对应的本地日期，并推进 updatedAt", () => {
    let state = reducer(defaultState(), { type: "habit/add", title: "喝水", now: NOW });
    const before = state.habits[0].updatedAt;
    state = reducer(state, { type: "habit/toggle", id: state.habits[0].id, now: NOW });
    expect(state.habits[0].completedDates).toEqual([day(NOW)]);
    expect(state.habits[0].updatedAt).toBeGreaterThan(before);
  });

  it("归档只是隐藏，不删除数据", () => {
    let state = reducer(defaultState(), { type: "habit/add", title: "喝水", now: NOW });
    const id = state.habits[0].id;
    state = reducer(state, { type: "habit/archive", id });
    expect(state.habits).toHaveLength(1);
    expect(state.habits[0].archived).toBe(true);
    expect(activeHabitList(state)).toHaveLength(0);
    state = reducer(state, { type: "habit/unarchive", id });
    expect(activeHabitList(state)).toHaveLength(1);
  });

  it("未知 id 是 no-op（返回原引用）", () => {
    const prev = reducer(defaultState(), { type: "habit/add", title: "喝水", now: NOW });
    expect(reducer(prev, { type: "habit/toggle", id: "nope", now: NOW })).toBe(prev);
  });

  it("改标题/emoji 会推进 updatedAt（同步 LWW 依赖它）", () => {
    let state = reducer(defaultState(), { type: "habit/add", title: "喝水", now: NOW });
    const before = state.habits[0].updatedAt;
    state = reducer(state, { type: "habit/update", id: state.habits[0].id, patch: { title: "多喝水", emoji: "💧" } });
    expect(state.habits[0].title).toBe("多喝水");
    expect(state.habits[0].emoji).toBe("💧");
    expect(state.habits[0].updatedAt).toBeGreaterThan(before);
  });

  it("习惯计入今日能量槽（新增习惯会暂时拉低百分比，与新增今日到期任务一致）", () => {
    let state = reducer(defaultState(), { type: "task/add", title: "任务", now: NOW, patch: { due: day(NOW) } });
    state = reducer(state, { type: "habit/add", title: "喝水", now: NOW });
    expect(energy(state, day(NOW))).toEqual({ done: 0, total: 2, percent: 0 });
    state = reducer(state, { type: "habit/toggle", id: state.habits[0].id, now: NOW });
    expect(energy(state, day(NOW))).toEqual({ done: 1, total: 2, percent: 50 });
  });
});

describe("休眠唤醒与日指标（v2.1 模块四/五）", () => {
  const day = (ts: number) => dateKeyOf(ts)!;

  it("唤醒会把 updatedAt 推到当下（从而离开休眠判定）", () => {
    const prev = stateWith([{ title: "老任务" }]);
    const before = prev.tasks[0].updatedAt;
    const next = reducer(prev, { type: "task/wake", id: prev.tasks[0].id });
    expect(next.tasks[0].updatedAt).toBeGreaterThan(before);
  });

  it("完成时记录当日连击峰值", () => {
    let state = stateWith([{ title: "a" }, { title: "b" }]);
    state = reducer(state, { type: "task/toggle", id: state.tasks[0].id, now: NOW });
    state = reducer(state, { type: "task/toggle", id: state.tasks[1].id, now: NOW + 60_000 });
    expect(state.daily.comboPeak[day(NOW)]).toBe(2);
  });

  it("专注时长在同一天内累加", () => {
    let state = defaultState();
    state = reducer(state, { type: "metrics/recordFocus", minutes: 25, now: NOW });
    state = reducer(state, { type: "metrics/recordFocus", minutes: 15, now: NOW + 1000 });
    expect(state.daily.focusMinutes[day(NOW)]).toBe(40);
  });

  it("单次专注被夹到合理上限，防止计时器挂一整天刷数字", () => {
    let state = defaultState();
    state = reducer(state, { type: "metrics/recordFocus", minutes: 9999, now: NOW });
    expect(state.daily.focusMinutes[day(NOW)]).toBe(MAX_FOCUS_RECORD_MINUTES);
  });

  it("0 或负数不记录", () => {
    const prev = defaultState();
    expect(reducer(prev, { type: "metrics/recordFocus", minutes: 0, now: NOW })).toBe(prev);
    expect(reducer(prev, { type: "metrics/recordFocus", minutes: -5, now: NOW })).toBe(prev);
  });
});

describe("reducer purity", () => {
  it("never mutates the previous state", () => {
    const prev = stateWith([{ title: "a" }]);
    const snapshot = JSON.stringify(prev);
    reducer(prev, { type: "task/toggle", id: prev.tasks[0].id, now: NOW });
    reducer(prev, { type: "task/add", title: "b", now: NOW });
    reducer(prev, { type: "task/remove", id: prev.tasks[0].id });
    expect(JSON.stringify(prev)).toBe(snapshot);
  });
});
