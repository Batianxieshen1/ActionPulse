/**
 * 习惯日程判定（Phase 3 / 审计路线图差距 2）。
 *
 * 独立成模块是为了避开循环依赖：habits.ts 与 streak.ts 都要用它，
 * 而 habits.ts 已经被 streak.ts 反向依赖（streakDays）。
 *
 * 核心约束：**到期与否永远是派生**——不给任何一天生成"实例任务"，
 * 所以不改动同步代数（G-Set + 字段级 LWW 原样成立）。
 */
import { fromDateKey } from "./dates";
import type { DailyHabit } from "./types";

/** 今天这个习惯是否"到期"。daily 恒真；weekdays 为周一至周五；weekly 看目标星期。 */
export function isHabitDueToday(habit: DailyHabit, today: string): boolean {
  if (habit.schedule === "weekdays") {
    const weekday = fromDateKey(today).getDay();
    return weekday >= 1 && weekday <= 5;
  }
  if (habit.schedule === "weekly") {
    if (habit.scheduleDay === null) return false;
    return fromDateKey(today).getDay() === habit.scheduleDay;
  }
  return true;
}
