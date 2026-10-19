/**
 * 多巴胺数值反馈（PRD §4 模块4）：连击 Combo、每日连续 Streak、今日能量槽。
 *
 * 规范只写了「连续完成显示 Combo x3」和「今日能量槽根据完成度充能」，语义未定义。
 * 落地决策：
 *  - Combo = 同一段「冲刺」内的连续完成次数；两次完成间隔超过 45 分钟则冲刺中断，重新从 1 计数。
 *  - Streak = 连续多少天至少完成 1 件事；当天还没完成时给 1 天宽限（昨天有记录就还算连着）。
 *  - 能量槽 = 今日承诺量（截止日在今天或更早的未归档任务 ∪ 今天完成的任务）中的完成比例。
 *    注意：无截止时间的新任务**不会**稀释能量槽，否则「新建任务」会变成负反馈。
 */
import { addDays, dateKeyOf, toDateKey } from "./dates";
import type { DailyHabit, EnergySnapshot, Task } from "./types";

/** 冲刺中断阈值：45 分钟。 */
export const BURST_GAP_MS = 45 * 60 * 1000;

export interface ComboState {
  combo: number;
  lastCompletionAt: number | null;
}

export function nextCombo(prev: ComboState, now: number): ComboState {
  const continues = prev.lastCompletionAt !== null && now - prev.lastCompletionAt <= BURST_GAP_MS;
  return { combo: continues ? prev.combo + 1 : 1, lastCompletionAt: now };
}

export function streakDays(completionDates: readonly string[], today: string): number {
  const days = new Set(completionDates.filter((key) => typeof key === "string" && key <= today));
  if (days.size === 0) return 0;
  let cursor = days.has(today) ? today : addDays(today, -1);
  if (!days.has(cursor)) return 0;
  let count = 0;
  while (days.has(cursor)) {
    count += 1;
    cursor = addDays(cursor, -1);
  }
  return count;
}

/**
 * 今日能量槽。
 *
 * v2.1 起把**每日习惯**也算进来。这不是妥协而是概念一致：
 * 每日习惯**按定义**就是「今天到期」，与现有「截止日 <= 今天」同构。
 * 代价是新增一个习惯会暂时拉低今天的百分比 —— 这与「新增一个今天到期的任务」完全一样，是合理的。
 */
export function todayEnergy(
  tasks: readonly Task[],
  habits: readonly DailyHabit[],
  today: string,
): EnergySnapshot {
  const scope = tasks.filter((task) => {
    if (task.archived) return false;
    // 今日承诺 = **仍未完成**的逾期待办 ∪ 今天完成的。
    // duePending 必须限定 !done —— 否则历史已完成且未归档的任务
    // （用户不手动归档是常态）会在次日清晨被 due <= today 收进 scope，
    // 让用户睁眼就是假 100%（并连带错误触发"今日全部清空"横幅）。见审计 Bug 1。
    const duePending = !task.done && task.due !== null && task.due <= today;
    const finishedToday = task.done && dateKeyOf(task.completedAt) === today;
    return duePending || finishedToday;
  });

  const activeHabits = habits.filter((habit) => !habit.archived);

  const done =
    scope.filter((task) => task.done).length +
    activeHabits.filter((habit) => habit.completedDates.includes(today)).length;
  const total = scope.length + activeHabits.length;
  const percent = total === 0 ? 0 : Math.min(100, Math.round((done / total) * 100));
  return { done, total, percent };
}

/** 把统计里的完成日期去重并按升序整理。 */
export function recordCompletionDate(dates: readonly string[], timestamp: number): string[] {
  const key = toDateKey(new Date(timestamp));
  if (dates.includes(key)) return [...dates];
  return [...dates, key].sort();
}
