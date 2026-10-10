/**
 * 每日习惯 / 日常仪式（PRD-v2.1 模块一）。
 *
 * 为什么习惯不能复用 Task：
 *  Task 带 \`due\` 就会产生超期压力（紧迫度 D 档最高 1.2），而习惯的本质是「每天重来」。
 *  把习惯做成 Task 就一定会出现「昨天没打勾 → 今天显示超期」的负罪感，与产品目标相反。
 *
 * 同步设计（本模块最漂亮的一点）：
 *  \`completedDates\` 是 **G-Set（只增集合）**，两端合并就是取并集 —— 并集满足交换律、
 *  结合律、幂等，因此**天然无冲突**，不需要 LWW、不需要墓碑、不需要解决策略。
 *
 *  但注意：习惯上还有 title / emoji / archived 这类**标量**字段，它们是 LWW 语义。
 *  所以合并必须是**字段级**的，绝不能整条记录二选一 —— 那样会丢掉另一侧的打勾历史。
 *
 * 跨天归零是**派生**的（\`isDoneToday\` 按 today 计算），因此不需要任何定时器或状态重置。
 */
import { createId } from "./id";
import { streakDays } from "./streak";
import type { DailyHabit, EnergySnapshot } from "./types";

export type { DailyHabit };

export const DEFAULT_HABIT_EMOJI = "⚡";

export interface HabitDraft {
  title: string;
  emoji?: string;
}

export function createHabit(draft: HabitDraft, now: number = Date.now()): DailyHabit {
  return {
    id: createId("habit"),
    title: draft.title.trim(),
    emoji: draft.emoji?.trim() || DEFAULT_HABIT_EMOJI,
    completedDates: [],
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
}

/** 派生状态：今天有没有打勾。跨天归零靠它，不靠任何定时器。 */
export function isDoneToday(habit: DailyHabit, today: string): boolean {
  return habit.completedDates.includes(today);
}

/** 打勾 / 取消打勾。会推进 updatedAt（标量字段的 LWW 与变更判定都依赖它）。 */
export function toggleHabitDate(habit: DailyHabit, today: string, now: number): DailyHabit {
  const done = isDoneToday(habit, today);
  const completedDates = done
    ? habit.completedDates.filter((date) => date !== today)
    : [...habit.completedDates, today].sort();
  return { ...habit, completedDates, updatedAt: Math.max(now, habit.updatedAt + 1) };
}

/** 完成日期取并集；标量字段按 updatedAt 取新。 */
function mergeHabit(a: DailyHabit, b: DailyHabit): DailyHabit {
  const completedDates = [...new Set([...a.completedDates, ...b.completedDates])].sort();

  const winner =
    a.updatedAt === b.updatedAt
      ? // 同分时用序列化比较做确定性兜底，保证两端收敛到同一结果
        JSON.stringify(a) >= JSON.stringify(b)
        ? a
        : b
      : a.updatedAt > b.updatedAt
        ? a
        : b;

  return {
    id: a.id,
    title: winner.title,
    emoji: winner.emoji,
    archived: winner.archived,
    createdAt: Math.min(a.createdAt, b.createdAt),
    updatedAt: Math.max(a.updatedAt, b.updatedAt),
    completedDates,
  };
}

export function mergeHabits(local: readonly DailyHabit[], remote: readonly DailyHabit[]): DailyHabit[] {
  const byId = new Map<string, DailyHabit>();
  for (const habit of local) byId.set(habit.id, habit);
  for (const habit of remote) {
    const existing = byId.get(habit.id);
    byId.set(habit.id, existing === undefined ? habit : mergeHabit(existing, habit));
  }
  return [...byId.values()].sort(
    (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
  );
}

/** 内容签名，用于「有没有变化」的判定。日期必须参与比较，否则并集改动会被漏判。 */
export function habitSignature(habit: DailyHabit): string {
  return [
    habit.id,
    habit.updatedAt,
    habit.archived ? "1" : "0",
    habit.title,
    habit.emoji,
    habit.completedDates.join(","),
  ].join("|");
}

export function sameHabits(a: readonly DailyHabit[], b: readonly DailyHabit[]): boolean {
  if (a.length !== b.length) return false;
  const signatures = new Map(b.map((habit) => [habit.id, habitSignature(habit)]));
  return a.every((habit) => signatures.get(habit.id) === habitSignature(habit));
}

/** 今天该做、未归档的习惯。 */
export function activeHabits(habits: readonly DailyHabit[]): DailyHabit[] {
  return habits.filter((habit) => !habit.archived);
}

/** 习惯达成率（模块四的战报要用）。 */
export function habitsCompletion(habits: readonly DailyHabit[], today: string): EnergySnapshot {
  const active = activeHabits(habits);
  const done = active.filter((habit) => isDoneToday(habit, today)).length;
  const total = active.length;
  return { done, total, percent: total === 0 ? 0 : Math.min(100, Math.round((done / total) * 100)) };
}

/** 单个习惯的连续天数，直接复用任务的 streak 算法。 */
export function habitStreak(habit: DailyHabit, today: string): number {
  return streakDays(habit.completedDates, today);
}
