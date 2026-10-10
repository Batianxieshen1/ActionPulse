import { describe, expect, it } from "vitest";
import {
  DEFAULT_HABIT_EMOJI,
  activeHabits,
  createHabit,
  habitStreak,
  habitsCompletion,
  isDoneToday,
  mergeHabits,
  sameHabits,
  toggleHabitDate,
} from "../src/domain/habits";
import type { DailyHabit } from "../src/domain/habits";

const T0 = Date.parse("2026-10-08T09:00:00");
const TODAY = "2026-10-08";

function habit(patch: Partial<DailyHabit> & { id: string }): DailyHabit {
  return {
    title: "喝水",
    emoji: DEFAULT_HABIT_EMOJI,
    completedDates: [],
    archived: false,
    createdAt: T0,
    updatedAt: T0,
    ...patch,
  };
}

describe("createHabit", () => {
  it("默认 emoji 是 ⚡，初始没有任何打勾记录", () => {
    const h = createHabit({ title: "喝水" }, T0);
    expect(h.emoji).toBe("⚡");
    expect(h.completedDates).toEqual([]);
    expect(h.archived).toBe(false);
    expect(h.createdAt).toBe(T0);
    expect(h.updatedAt).toBe(T0);
  });

  it("可以指定 emoji，并在空值时回落默认", () => {
    expect(createHabit({ title: "跑步", emoji: "🏃" }, T0).emoji).toBe("🏃");
    expect(createHabit({ title: "跑步", emoji: "   " }, T0).emoji).toBe("⚡");
  });
});

describe("跨天派生（不做过期滚存）", () => {
  it("打勾后当天为已完成", () => {
    const h = toggleHabitDate(createHabit({ title: "喝水" }, T0), TODAY, T0);
    expect(isDoneToday(h, TODAY)).toBe(true);
  });

  it("【核心】换一天就自然归零，不需要任何重置逻辑", () => {
    const h = toggleHabitDate(createHabit({ title: "喝水" }, T0), TODAY, T0);
    expect(isDoneToday(h, "2026-10-09")).toBe(false);
    // 而且历史记录还在（那是连续天数与战报的依据）
    expect(h.completedDates).toEqual([TODAY]);
  });

  it("再点一次是取消打勾", () => {
    let h = toggleHabitDate(createHabit({ title: "喝水" }, T0), TODAY, T0);
    h = toggleHabitDate(h, TODAY, T0 + 1000);
    expect(isDoneToday(h, TODAY)).toBe(false);
    expect(h.completedDates).toEqual([]);
  });

  it("每次打勾都推进 updatedAt（标量 LWW 与变更判定都靠它）", () => {
    const before = createHabit({ title: "喝水" }, T0);
    const after = toggleHabitDate(before, TODAY, T0);
    expect(after.updatedAt).toBeGreaterThan(before.updatedAt);
  });

  it("不会污染别的日期", () => {
    let h = createHabit({ title: "喝水" }, T0);
    h = toggleHabitDate(h, "2026-10-07", T0);
    h = toggleHabitDate(h, TODAY, T0);
    expect(h.completedDates).toEqual(["2026-10-07", "2026-10-08"]);
    expect(isDoneToday(h, TODAY)).toBe(true);
  });
});

describe("mergeHabits —— G-Set 并集", () => {
  it("【核心】两端各打各的勾，合并后都保留（不会互相覆盖）", () => {
    const a = habit({ id: "h1", completedDates: ["2026-10-08"], updatedAt: T0 + 100 });
    const b = habit({ id: "h1", completedDates: ["2026-10-09"], updatedAt: T0 + 200 });
    const merged = mergeHabits([a], [b]);
    expect(merged[0].completedDates).toEqual(["2026-10-08", "2026-10-09"]);
  });

  it("【核心】标量字段较新的一侧胜出，但绝不能因此丢掉另一侧的日期", () => {
    const a = habit({ id: "h1", title: "旧标题", completedDates: ["2026-10-08"], updatedAt: T0 });
    const b = habit({ id: "h1", title: "新标题", completedDates: [], updatedAt: T0 + 999 });
    const merged = mergeHabits([a], [b]);
    expect(merged[0].title).toBe("新标题");
    // 关键：b 更新，但 a 的打勾历史必须还在
    expect(merged[0].completedDates).toEqual(["2026-10-08"]);
  });

  it("幂等：再合并一次不会变化", () => {
    const a = habit({ id: "h1", completedDates: ["2026-10-08"], updatedAt: T0 });
    const b = habit({ id: "h1", completedDates: ["2026-10-09"], updatedAt: T0 + 5 });
    const once = mergeHabits([a], [b]);
    const twice = mergeHabits(once, [b]);
    expect(sameHabits(twice, once)).toBe(true);
  });

  it("交换律：两端独立合并得到同一结果（收敛的前提）", () => {
    const a = habit({ id: "h1", title: "A", completedDates: ["2026-10-08"], updatedAt: T0 });
    const b = habit({ id: "h1", title: "B", completedDates: ["2026-10-09"], updatedAt: T0 + 7 });
    expect(sameHabits(mergeHabits([a], [b]), mergeHabits([b], [a]))).toBe(true);
  });

  it("archived 也是 LWW", () => {
    const a = habit({ id: "h1", archived: false, updatedAt: T0 });
    const b = habit({ id: "h1", archived: true, updatedAt: T0 + 10 });
    expect(mergeHabits([a], [b])[0].archived).toBe(true);
    expect(mergeHabits([b], [a])[0].archived).toBe(true);
  });

  it("任一侧独有的习惯都会保留", () => {
    const merged = mergeHabits([habit({ id: "a" })], [habit({ id: "b" })]);
    expect(merged.map((h) => h.id).sort()).toEqual(["a", "b"]);
  });

  it("按 createdAt 排序，保证两端顺序一致", () => {
    const merged = mergeHabits(
      [habit({ id: "late", createdAt: T0 + 10 })],
      [habit({ id: "early", createdAt: T0 })],
    );
    expect(merged.map((h) => h.id)).toEqual(["early", "late"]);
  });

  it("不修改传入的对象", () => {
    const a = habit({ id: "h1", completedDates: ["2026-10-08"] });
    const b = habit({ id: "h1", completedDates: ["2026-10-09"] });
    const snapshot = JSON.stringify([a, b]);
    mergeHabits([a], [b]);
    expect(JSON.stringify([a, b])).toBe(snapshot);
  });
});

describe("sameHabits（变更判定）", () => {
  it("只改打勾日期也必须被判定为「变了」", () => {
    const a = habit({ id: "h1", completedDates: [] });
    const b = habit({ id: "h1", completedDates: ["2026-10-08"] });
    expect(sameHabits([a], [a])).toBe(true);
    expect(sameHabits([a], [b])).toBe(false);
  });

  it("数量相同但日期不同也要判为变了（并集合并最容易踩的坑）", () => {
    const a = habit({ id: "h1", completedDates: ["2026-10-08"], updatedAt: T0 });
    const b = habit({ id: "h1", completedDates: ["2026-10-09"], updatedAt: T0 });
    expect(sameHabits([a], [b])).toBe(false);
  });
});

describe("达成率与连续天数", () => {
  it("没有习惯时是 0，而不是除零", () => {
    expect(habitsCompletion([], TODAY)).toEqual({ done: 0, total: 0, percent: 0 });
  });

  it("只统计未归档的习惯", () => {
    const habits = [
      habit({ id: "a", completedDates: [TODAY] }),
      habit({ id: "b" }),
      habit({ id: "c", archived: true }),
    ];
    expect(habitsCompletion(habits, TODAY)).toEqual({ done: 1, total: 2, percent: 50 });
    expect(activeHabits(habits).map((h) => h.id)).toEqual(["a", "b"]);
  });

  it("连续天数复用任务的 streak 算法", () => {
    const h = habit({ id: "a", completedDates: ["2026-10-06", "2026-10-07", "2026-10-08"] });
    expect(habitStreak(h, TODAY)).toBe(3);
    expect(habitStreak(habit({ id: "b" }), TODAY)).toBe(0);
  });
});
