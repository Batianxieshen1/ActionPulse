import { describe, expect, it } from "vitest";
import { buildDebrief, debriefMarkdown, estimateMix } from "../src/domain/debrief";
import { defaultState } from "../src/domain/validation";
import { createTask } from "../src/store/taskStore";
import type { AppState, DailyHabit } from "../src/domain/types";

const TODAY = "2026-10-08";
const NOW = Date.parse("2026-10-08T10:00:00");

function habit(patch: Partial<DailyHabit> & { id: string }): DailyHabit {
  return {
    title: "喝水",
    emoji: "⚡",
    completedDates: [],
    archived: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...patch,
  };
}

function stateWith(patch: Partial<AppState> = {}): AppState {
  return { ...defaultState(), ...patch };
}

describe("buildDebrief", () => {
  it("只统计今天完成的任务，不含昨天完成的", () => {
    const todayTask = { ...createTask({ title: "今天做的" }, NOW), done: true, completedAt: new Date(NOW).toISOString() };
    const oldTask = {
      ...createTask({ title: "昨天做的" }, NOW),
      done: true,
      completedAt: new Date(Date.parse("2026-10-07T10:00:00")).toISOString(),
    };
    const stats = buildDebrief(stateWith({ tasks: [todayTask, oldTask] }), TODAY);
    expect(stats.tasksDone).toBe(1);
    expect(stats.taskTitles).toEqual(["今天做的"]);
  });

  it("同一天完成两个同名任务时都要列出（不去重、不算成一件）", () => {
    const stamp = new Date(NOW).toISOString();
    const a = { ...createTask({ title: "回邮件" }, NOW), id: "a", done: true, completedAt: stamp };
    const b = { ...createTask({ title: "回邮件" }, NOW + 1000), id: "b", done: true, completedAt: stamp };
    const stats = buildDebrief(stateWith({ tasks: [a, b] }), TODAY);
    expect(stats.tasksDone).toBe(2);
    // 战报里应当出现两行同名条目，而不是被合并成一行
    expect(stats.taskTitles).toEqual(["回邮件", "回邮件"]);
    expect(debriefMarkdown(stats).match(/回邮件/g)).toHaveLength(2);
  });

  it("归档的任务不计入", () => {
    const t = { ...createTask({ title: "归档的" }, NOW), done: true, completedAt: new Date(NOW).toISOString(), archived: true };
    expect(buildDebrief(stateWith({ tasks: [t] }), TODAY).tasksDone).toBe(0);
  });

  it("习惯达成率只算未归档的", () => {
    const habits = [
      habit({ id: "a", completedDates: [TODAY] }),
      habit({ id: "b" }),
      habit({ id: "c", archived: true }),
    ];
    const stats = buildDebrief(stateWith({ habits }), TODAY);
    expect(stats.habitsDone).toBe(1);
    expect(stats.habitsTotal).toBe(2);
    expect(stats.habitPercent).toBe(50);
  });

  it("读取当天的专注时长与连击峰值", () => {
    const state = stateWith();
    state.daily.focusMinutes = { [TODAY]: 75, "2026-10-07": 999 };
    state.daily.comboPeak = { [TODAY]: 4 };
    const stats = buildDebrief(state, TODAY);
    expect(stats.focusMinutes).toBe(75);
    expect(stats.comboPeak).toBe(4);
  });

  it("连续天数复用 streak 算法", () => {
    const state = stateWith();
    state.stats.completionDates = ["2026-10-06", "2026-10-07", "2026-10-08"];
    expect(buildDebrief(state, TODAY).streakDays).toBe(3);
  });

  it("全空状态不崩，各项为 0", () => {
    const stats = buildDebrief(defaultState(), TODAY);
    expect(stats).toMatchObject({
      tasksDone: 0,
      habitsDone: 0,
      habitsTotal: 0,
      habitPercent: 0,
      focusMinutes: 0,
      comboPeak: 0,
      streakDays: 0,
      totalCompleted: 0,
    });
  });
});

describe("debriefMarkdown", () => {
  const stats = buildDebrief(defaultState(), TODAY);

  it("包含日期与各项数字", () => {
    const md = debriefMarkdown({
      ...stats,
      tasksDone: 3,
      habitsDone: 5,
      habitsTotal: 5,
      habitPercent: 100,
      focusMinutes: 50,
      comboPeak: 4,
      streakDays: 6,
      totalCompleted: 128,
      taskTitles: ["写周报", "回复邮件"],
    });
    expect(md).toContain("2026-10-08");
    expect(md).toContain("3");
    expect(md).toContain("5/5");
    expect(md).toContain("50 分钟");
    expect(md).toContain("x4");
    expect(md).toContain("6");
    expect(md).toContain("128");
    expect(md).toContain("写周报");
  });

  it("是合法的 Markdown 列表，且确定性（同样输入同样输出）", () => {
    const a = debriefMarkdown(stats);
    const b = debriefMarkdown(stats);
    expect(a).toBe(b);
    expect(a.startsWith("## ActionPulse 今日战报")).toBe(true);
  });

  it("超过一小时用小时表示，读起来更像人话", () => {
    const md = debriefMarkdown({ ...stats, focusMinutes: 90 });
    expect(md).toContain("1 小时 30 分钟");
    expect(debriefMarkdown({ ...stats, focusMinutes: 120 })).toContain("2 小时");
  });

  it("数字为 0 的项不啰嗦地列出来", () => {
    const md = debriefMarkdown({ ...stats, focusMinutes: 0, comboPeak: 0, habitsTotal: 0 });
    expect(md).not.toContain("专注时长");
    expect(md).not.toContain("连击峰值");
    expect(md).not.toContain("日常习惯");
  });
});

describe("estimateMix（近 7 天完成分布——Q 因子观察项的数据回路）", () => {
  function doneTask(estimateMinutes: number | null, completedAtIso: string) {
    return {
      ...createTask({ title: "任务", estimateMinutes }, NOW),
      done: true,
      completedAt: completedAtIso,
    };
  }

  it("按估时分桶，15/16 和 60/61 是桶边界", () => {
    const nowIso = new Date(NOW).toISOString();
    const mix = estimateMix(
      [doneTask(15, nowIso), doneTask(16, nowIso), doneTask(60, nowIso), doneTask(61, nowIso), doneTask(null, nowIso)],
      TODAY,
    );
    expect(mix).toMatchObject({ quick: 1, medium: 2, slow: 1, untimed: 1, total: 5 });
    expect(mix.quickPercent).toBe(20);
  });

  it("只统计近 7 天（含今天），7 天前的完成不计入", () => {
    const inWindow = doneTask(5, new Date(Date.parse("2026-10-02T09:00:00")).toISOString());
    const tooOld = doneTask(5, new Date(Date.parse("2026-10-01T09:00:00")).toISOString());
    expect(estimateMix([inWindow, tooOld], TODAY).total).toBe(1);
  });

  it("未完成、已归档、无完成时间的任务一律不计入", () => {
    const pending = createTask({ title: "没做完" }, NOW);
    const archived = { ...doneTask(10, new Date(NOW).toISOString()), archived: true };
    const mix = estimateMix([pending, archived], TODAY);
    expect(mix.total).toBe(0);
    expect(mix.quickPercent).toBe(0);
  });

  it("空清单得到全零分布，quickPercent 不产生 NaN", () => {
    expect(estimateMix([], TODAY)).toEqual({
      quick: 0,
      medium: 0,
      slow: 0,
      untimed: 0,
      total: 0,
      quickPercent: 0,
    });
  });

  it("buildDebrief 带出分布，Markdown 战报包含分布行", () => {
    const todayTask = doneTask(10, new Date(NOW).toISOString());
    const stats = buildDebrief(stateWith({ tasks: [todayTask] }), TODAY);
    expect(stats.weekEstimateMix.quickPercent).toBe(100);
    const markdown = debriefMarkdown(stats);
    expect(markdown).toContain("近 7 天完成分布");
    expect(markdown).toContain("速赢 100%");
  });
});
