import { describe, expect, it } from "vitest";
import {
  DEFAULT_HABIT_EMOJI,
  activeHabits,
  completeHabitDate,
  createHabit,
  habitStreak,
  habitsCompletion,
  habitSignature,
  isDoneToday,
  isHabitDueToday,
  mergeHabits,
  nextUncompletedHabit,
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
    schedule: "daily",
    scheduleDay: null,
    intervalDays: null,
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

describe("聚焦完成日常习惯", () => {
  it("完成今天会加入日期并严格推进更新时间", () => {
    const before = habit({ id: "h1", completedDates: ["2026-10-07"] });
    const after = completeHabitDate(before, TODAY, T0);

    expect(after.completedDates).toEqual(["2026-10-07", TODAY]);
    expect(after.updatedAt).toBeGreaterThan(before.updatedAt);
    expect(isDoneToday(after, TODAY)).toBe(true);
  });

  it("重复完成今天是幂等操作，不改变对象或更新时间", () => {
    const before = habit({ id: "h1", completedDates: [TODAY], updatedAt: T0 + 10 });
    const after = completeHabitDate(before, TODAY, T0 + 100);

    expect(after).toBe(before);
    expect(after.completedDates).toEqual([TODAY]);
    expect(after.updatedAt).toBe(T0 + 10);
  });
});

describe("nextUncompletedHabit", () => {
  it("returns the first active habit not yet completed today, preserving input order", () => {
    const habits = [
      habit({ id: "done", completedDates: [TODAY] }),
      habit({ id: "archived", archived: true }),
      habit({ id: "next", title: "跑步" }),
      habit({ id: "later", title: "阅读" }),
    ];

    expect(nextUncompletedHabit(habits, TODAY)?.id).toBe("next");
  });

  it("returns null when all habits are done or archived", () => {
    expect(
      nextUncompletedHabit(
        [habit({ id: "done", completedDates: [TODAY] }), habit({ id: "archived", archived: true })],
        TODAY,
      ),
    ).toBeNull();
    expect(nextUncompletedHabit([], TODAY)).toBeNull();
  });

  it("does not mutate the input array or habit objects", () => {
    const first = habit({ id: "done", completedDates: [TODAY] });
    const second = habit({ id: "next" });
    const habits = [first, second];
    const snapshot = JSON.stringify(habits);

    expect(nextUncompletedHabit(habits, TODAY)).toBe(second);
    expect(JSON.stringify(habits)).toBe(snapshot);
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

describe("日程规则（Phase 3：派生式周期习惯）", () => {
  // 2026-10-08 是周四；2026-10-10 是周六

  it("daily 每天都到期", () => {
    expect(isHabitDueToday(habit({ id: "a" }), TODAY)).toBe(true);
    expect(isHabitDueToday(habit({ id: "a" }), "2026-10-10")).toBe(true);
  });

  it("weekdays 只在周一至周五到期", () => {
    const h = habit({ id: "a", schedule: "weekdays" });
    expect(isHabitDueToday(h, TODAY)).toBe(true); // 周四
    expect(isHabitDueToday(h, "2026-10-10")).toBe(false); // 周六
  });

  it("weekly 只在目标星期到期", () => {
    const h = habit({ id: "a", schedule: "weekly", scheduleDay: 6 });
    expect(isHabitDueToday(h, "2026-10-10")).toBe(true); // 周六
    expect(isHabitDueToday(h, TODAY)).toBe(false); // 周四
  });

  it("完成率分母只算今天到期的习惯（周习惯在非目标日不计承诺）", () => {
    const habits = [
      habit({ id: "d", completedDates: [TODAY] }),
      habit({ id: "w", schedule: "weekly", scheduleDay: 6 }),
    ];
    expect(habitsCompletion(habits, TODAY)).toEqual({ done: 1, total: 1, percent: 100 });
  });

  it("nextUncompletedHabit 跳过今天不到期的习惯", () => {
    const habits = [habit({ id: "w", title: "周报", schedule: "weekly", scheduleDay: 6 })];
    expect(nextUncompletedHabit(habits, TODAY)).toBeNull();
    expect(nextUncompletedHabit(habits, "2026-10-10")?.id).toBe("w");
  });

  it("合并：完成日期并集不受影响，日程等标量取较新一方", () => {
    const local = habit({ id: "h", schedule: "daily", completedDates: ["2026-10-07"], updatedAt: T0 });
    const remote = habit({
      id: "h",
      schedule: "weekdays",
      completedDates: ["2026-10-08"],
      updatedAt: T0 + 100,
    });
    const [merged] = mergeHabits([local], [remote]);
    expect(merged.completedDates).toEqual(["2026-10-07", "2026-10-08"]);
    expect(merged.schedule).toBe("weekdays");
  });

  it("签名包含日程：只改日程也必须被判定为变化（防同步静默丢弃）", () => {
    const daily = habit({ id: "h" });
    const weekly = { ...daily, schedule: "weekly" as const, scheduleDay: 6 };
    expect(habitSignature(daily)).not.toBe(habitSignature(weekly));
    expect(sameHabits([daily], [weekly])).toBe(false);
  });
});

describe("everyN 相对完成间隔循环（审计差距 2b / A4）", () => {
  // 设计事实：到期判定是派生的（schedule.ts 核心约束），everyN 完全融入该模型——
  // 到期 = 上次打勾日 + N ≤ 今天。打勾当天自动未到期，零清理逻辑、零实例生成，
  // 同步代数不动（G-Set + 字段级 LWW 原样成立）。

  const H = (patch: Partial<DailyHabit>) => habit({ id: "n", schedule: "everyN", intervalDays: 10, ...patch });

  it("从未打勾：一直到期（等第一次打勾进入循环）", () => {
    expect(isHabitDueToday(H({ completedDates: [] }), TODAY)).toBe(true);
  });

  it("打勾后第 N-1 天未到期、第 N 天到期、逾期持续到期", () => {
    const done = ["2026-11-01"];
    expect(isHabitDueToday(H({ completedDates: done }), "2026-11-10")).toBe(false); // 间隔 9 天
    expect(isHabitDueToday(H({ completedDates: done }), "2026-11-11")).toBe(true); // 间隔恰 10 天
    expect(isHabitDueToday(H({ completedDates: done }), "2026-11-12")).toBe(true); // 逾期持续到期
  });

  it("打勾当天自动未到期（完成即重置，无债务）", () => {
    expect(isHabitDueToday(H({ completedDates: ["2026-11-01"] }), "2026-11-01")).toBe(false);
  });

  it("取消打勾后回退到上一次完成日重算（数据即真相）", () => {
    const both = ["2026-10-20", "2026-11-01"];
    expect(isHabitDueToday(H({ completedDates: both }), "2026-11-05")).toBe(false);
    const undone = ["2026-10-20"]; // 取消 11-01 → 上次完成是 10-20，10-30 起到期
    expect(isHabitDueToday(H({ completedDates: undone }), "2026-11-05")).toBe(true);
  });

  it("nextUncompletedHabit 在非到期日跳过 everyN 习惯", () => {
    const habits = [H({ id: "n", completedDates: ["2026-11-01"] })];
    expect(nextUncompletedHabit(habits, "2026-11-03")).toBeNull();
    expect(nextUncompletedHabit(habits, "2026-11-11")).not.toBeNull();
  });

  it("createHabit：everyN 默认 7 天，非法间隔钳回默认（先有确定行为）", () => {
    expect(createHabit({ title: "x", schedule: "everyN" }, T0).intervalDays).toBe(7);
    expect(createHabit({ title: "x", schedule: "everyN", intervalDays: 10 }, T0).intervalDays).toBe(10);
    expect(createHabit({ title: "x", schedule: "everyN", intervalDays: 0 }, T0).intervalDays).toBe(7);
    expect(createHabit({ title: "x", schedule: "everyN", intervalDays: 400 }, T0).intervalDays).toBe(7);
  });

  it("mergeHabit：intervalDays 跟随 winner；签名覆盖 intervalDays（漏判防护）", () => {
    const a = habit({ id: "m", schedule: "everyN", intervalDays: 5, updatedAt: T0 });
    const b = habit({ id: "m", schedule: "everyN", intervalDays: 30, updatedAt: T0 + 100 });
    expect(mergeHabits([a], [b])[0].intervalDays).toBe(30);
    expect(sameHabits([a], [{ ...a, intervalDays: 30 }])).toBe(false);
  });
});
