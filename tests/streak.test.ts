import { describe, expect, it } from "vitest";
import { BURST_GAP_MS, nextCombo, streakDays, todayEnergy } from "../src/domain/streak";
import type { Task } from "../src/domain/types";

const TODAY = "2026-10-08";
const NOW = Date.parse("2026-10-08T10:00:00.000Z");

function makeTask(patch: Partial<Task> = {}): Task {
  return {
    id: patch.id ?? "t",
    title: patch.title ?? "任务",
    notes: "",
    importance: patch.importance ?? "medium",
    due: patch.due === undefined ? null : patch.due,
    estimateMinutes: patch.estimateMinutes === undefined ? null : patch.estimateMinutes,
    quadrant: patch.quadrant ?? null,
    manualRank: patch.manualRank ?? 0,
    subtasks: patch.subtasks ?? [],
    done: patch.done ?? false,
    createdAt: patch.createdAt ?? "2026-10-08T09:00:00",
    updatedAt: patch.updatedAt ?? Date.parse(patch.createdAt ?? "2026-10-08T09:00:00"),
    completedAt: patch.completedAt ?? null,
    archived: patch.archived ?? false,
  };
}

describe("nextCombo", () => {
  it("starts a fresh burst at 1", () => {
    expect(nextCombo({ combo: 0, lastCompletionAt: null }, NOW)).toEqual({ combo: 1, lastCompletionAt: NOW });
  });

  it("extends the burst while completions come quickly", () => {
    const prev = { combo: 2, lastCompletionAt: NOW - 10 * 60 * 1000 };
    expect(nextCombo(prev, NOW)).toEqual({ combo: 3, lastCompletionAt: NOW });
  });

  it("keeps the burst alive at exactly the gap boundary", () => {
    const prev = { combo: 2, lastCompletionAt: NOW - BURST_GAP_MS };
    expect(nextCombo(prev, NOW).combo).toBe(3);
  });

  it("resets the burst once the gap is exceeded", () => {
    const prev = { combo: 7, lastCompletionAt: NOW - BURST_GAP_MS - 1 };
    expect(nextCombo(prev, NOW).combo).toBe(1);
  });

  it("is deterministic for a fixed clock", () => {
    const prev = { combo: 1, lastCompletionAt: NOW - 1000 };
    expect(nextCombo(prev, NOW)).toEqual(nextCombo(prev, NOW));
  });
});

describe("streakDays", () => {
  it("counts consecutive days ending today", () => {
    expect(streakDays(["2026-10-08", "2026-10-07", "2026-10-06"], TODAY)).toBe(3);
  });

  it("gives one day of grace when today has no completion yet", () => {
    expect(streakDays(["2026-10-07", "2026-10-06"], TODAY)).toBe(2);
  });

  it("is zero once two days have been missed", () => {
    expect(streakDays(["2026-10-06", "2026-10-05"], TODAY)).toBe(0);
  });

  it("ignores duplicates and unordered input", () => {
    expect(streakDays(["2026-10-06", "2026-10-08", "2026-10-08", "2026-10-07"], TODAY)).toBe(3);
  });

  it("does not count future dates", () => {
    expect(streakDays(["2026-10-09", "2026-10-08"], TODAY)).toBe(1);
  });

  it("handles an empty history", () => {
    expect(streakDays([], TODAY)).toBe(0);
  });
});

describe("todayEnergy", () => {
  it("counts due-today and overdue tasks as today's committed scope", () => {
    const tasks = [
      makeTask({ id: "a", due: TODAY, done: true, completedAt: "2026-10-08T09:00:00" }),
      makeTask({ id: "b", due: "2026-10-01" }),
      makeTask({ id: "far", due: "2026-12-01" }),
      makeTask({ id: "someday" }),
    ];
    expect(todayEnergy(tasks, [], TODAY)).toEqual({ done: 1, total: 2, percent: 50 });
  });

  it("does not let a fresh no-deadline task dilute the bar", () => {
    const tasks = [
      makeTask({ id: "a", due: TODAY, done: true, completedAt: "2026-10-08T09:00:00" }),
      makeTask({ id: "fresh", due: null, createdAt: "2026-10-08T08:00:00" }),
    ];
    expect(todayEnergy(tasks, [], TODAY)).toEqual({ done: 1, total: 1, percent: 100 });
  });

  it("keeps a task finished today in the denominator even when it was not due today", () => {
    const tasks = [makeTask({ id: "a", due: "2026-12-01", done: true, completedAt: "2026-10-08T09:00:00" })];
    expect(todayEnergy(tasks, [], TODAY)).toEqual({ done: 1, total: 1, percent: 100 });
  });

  it("excludes archived tasks", () => {
    const tasks = [makeTask({ id: "a", due: TODAY, archived: true })];
    expect(todayEnergy(tasks, [], TODAY)).toEqual({ done: 0, total: 0, percent: 0 });
  });

  it("reports zero rather than dividing by zero on an empty day", () => {
    expect(todayEnergy([], [], TODAY)).toEqual({ done: 0, total: 0, percent: 0 });
  });

  it("caps at 100 percent", () => {
    const tasks = [makeTask({ id: "a", due: TODAY, done: true, completedAt: "2026-10-08T09:00:00.000Z" })];
    const result = todayEnergy(tasks, [], TODAY);
    expect(result.percent).toBe(100);
    expect(result.percent).toBeLessThanOrEqual(100);
  });

  it("【审计 Bug 1】历史已完成且未归档的任务，不应在次日清晨假满充能量槽", () => {
    // 昨天完成、due 是昨天、用户没有手动归档（绝大多数用户的常态）。
    // 修复前：due <= today 收进 scope、done 计入分子 → {1/1, 100%}，连坐触发假"全部清空"横幅。
    const yesterdayDone = makeTask({
      id: "old",
      title: "昨天完成的事",
      due: "2026-10-07",
      done: true,
      completedAt: "2026-10-07T10:00:00.000Z",
      archived: false,
    });
    expect(todayEnergy([yesterdayDone], [], TODAY)).toEqual({ done: 0, total: 0, percent: 0 });
  });

  it("【审计 Bug 1】幽灵任务不会稀释今日真实承诺（今日承诺只算仍未完成的）", () => {
    const yesterdayDone = makeTask({
      id: "old",
      due: "2026-10-07",
      done: true,
      completedAt: "2026-10-07T10:00:00.000Z",
    });
    const todayPending = makeTask({ id: "new", due: TODAY });
    expect(todayEnergy([yesterdayDone, todayPending], [], TODAY)).toEqual({ done: 0, total: 1, percent: 0 });
  });
});