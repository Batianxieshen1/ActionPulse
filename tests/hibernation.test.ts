import { describe, expect, it } from "vitest";
import {
  HIBERNATION_DAYS,
  HIBERNATION_MS,
  dormantDays,
  isHibernating,
  splitDormant,
} from "../src/domain/hibernation";
import type { Task, Importance } from "../src/domain/types";

const NOW = Date.parse("2026-10-08T12:00:00.000Z");

function task(patch: Partial<Task> = {}): Task {
  return {
    id: patch.id ?? "t1",
    title: "老任务",
    notes: "",
    importance: (patch.importance ?? "medium") as Importance,
    due: patch.due === undefined ? null : patch.due,
    estimateMinutes: patch.estimateMinutes ?? null,
    quadrant: patch.quadrant ?? null,
    manualRank: patch.manualRank ?? 0,
    subtasks: patch.subtasks ?? [],
    done: patch.done ?? false,
    createdAt: patch.createdAt ?? new Date(NOW - HIBERNATION_MS * 2).toISOString(),
    completedAt: patch.completedAt ?? null,
    archived: patch.archived ?? false,
    updatedAt: patch.updatedAt ?? NOW - HIBERNATION_MS * 2,
  };
}

describe("isHibernating —— 边界", () => {
  it("阈值是常量 14 天", () => {
    expect(HIBERNATION_DAYS).toBe(14);
    expect(HIBERNATION_MS).toBe(14 * 24 * 60 * 60 * 1000);
  });

  it("刚好 14 天还不休眠（必须是「超过」）", () => {
    expect(isHibernating(task({ updatedAt: NOW - HIBERNATION_MS }), NOW)).toBe(false);
  });

  it("超过 14 天 1 毫秒就休眠", () => {
    expect(isHibernating(task({ updatedAt: NOW - HIBERNATION_MS - 1 }), NOW)).toBe(true);
  });

  it("刚碰过的任务不休眠（哪怕创建很久）", () => {
    expect(isHibernating(task({ createdAt: new Date(NOW - HIBERNATION_MS * 9).toISOString(), updatedAt: NOW - 1000 }), NOW)).toBe(false);
  });

  it("有截止日期的任务永不休眠 —— 那是对别人的承诺", () => {
    const old = task({ due: "2020-01-01", updatedAt: NOW - HIBERNATION_MS * 9 });
    expect(isHibernating(old, NOW)).toBe(false);
  });

  it("已完成 / 已归档的不算休眠（它们本来就离开了清单）", () => {
    expect(isHibernating(task({ done: true }), NOW)).toBe(false);
    expect(isHibernating(task({ archived: true }), NOW)).toBe(false);
  });
});

describe("splitDormant", () => {
  it("按是否休眠分成两组，且不丢任务", () => {
    const stale = task({ id: "stale" });
    const fresh = task({ id: "fresh", updatedAt: NOW - 1000 });
    const withDue = task({ id: "due", due: "2026-12-01" });
    const { active, dormant } = splitDormant([stale, fresh, withDue], NOW);
    expect(dormant.map((t) => t.id)).toEqual(["stale"]);
    expect(active.map((t) => t.id)).toEqual(["fresh", "due"]);
  });

  it("空输入不崩", () => {
    expect(splitDormant([], NOW)).toEqual({ active: [], dormant: [] });
  });

  it("不修改传入数组", () => {
    const tasks = [task({ id: "a" }), task({ id: "b" })];
    const snapshot = tasks.map((t) => t.id);
    splitDormant(tasks, NOW);
    expect(tasks.map((t) => t.id)).toEqual(snapshot);
  });
});

describe("dormantDays", () => {
  it("报告已经搁置了几天", () => {
    expect(dormantDays(task({ updatedAt: NOW - 20 * 24 * 60 * 60 * 1000 }), NOW)).toBe(20);
  });

  it("不足一天记 0", () => {
    expect(dormantDays(task({ updatedAt: NOW - 60_000 }), NOW)).toBe(0);
  });
});
