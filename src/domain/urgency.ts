/**
 * 紧迫度算法（PRD §5，已冻结）。
 *
 *   Urgency = W_imp·I + W_due·D + W_quick·Q + W_age·A
 *
 * 规范只定义了「归一化到 0~100」，没有给出归一化公式。
 * 落地决策：除以理论最大值 MAX_RAW（= 35·1.0 + 40·1.2 + 15·1.0 + 10·1.0 = 108）后取整。
 * 这样唯一能拿到 100 分的任务就是「高重要 + 已超期 + 15 分钟内可完成 + 搁置超过一周」。
 */
import { daysBetween, dateKeyOf, todayKey } from "./dates";
import type { Importance, Task, UrgencyTier } from "./types";

export const WEIGHTS = { imp: 35, due: 40, quick: 15, age: 10 } as const;

export const IMPORTANCE_FACTOR: Record<Importance, number> = {
  high: 1.0,
  medium: 0.6,
  low: 0.2,
};

export const DUE_FACTOR = {
  overdue: 1.2,
  today: 1.0,
  tomorrow: 0.7,
  withinThreeDays: 0.4,
  /** 超过三天或无截止时间：规范只给了「无截止 = 0.1」，远期截止归入同档。 */
  far: 0.1,
} as const;

export const QUICK_FACTOR = {
  /** <= 15 分钟 */
  fast: 1.0,
  /** 15 ~ 60 分钟 */
  medium: 0.5,
  /** > 60 分钟，或未估时 */
  slow: 0.2,
} as const;

export const MAX_RAW =
  WEIGHTS.imp * IMPORTANCE_FACTOR.high +
  WEIGHTS.due * DUE_FACTOR.overdue +
  WEIGHTS.quick * QUICK_FACTOR.fast +
  WEIGHTS.age * 1.0;

export function dueFactor(due: string | null, today: string): number {
  if (!due) return DUE_FACTOR.far;
  const diff = daysBetween(today, due);
  if (diff < 0) return DUE_FACTOR.overdue;
  if (diff === 0) return DUE_FACTOR.today;
  if (diff === 1) return DUE_FACTOR.tomorrow;
  if (diff <= 3) return DUE_FACTOR.withinThreeDays;
  return DUE_FACTOR.far;
}

export function quickFactor(minutes: number | null): number {
  if (minutes === null || !Number.isFinite(minutes)) return QUICK_FACTOR.slow;
  if (minutes <= 15) return QUICK_FACTOR.fast;
  if (minutes <= 60) return QUICK_FACTOR.medium;
  return QUICK_FACTOR.slow;
}

export function ageFactor(createdAt: string, today: string): number {
  const createdKey = dateKeyOf(createdAt);
  if (!createdKey) return 0;
  const days = daysBetween(createdKey, today);
  if (days <= 0) return 0;
  return Math.min(days / 7, 1);
}

export function rawScore(task: Task, today: string = todayKey()): number {
  return (
    WEIGHTS.imp * IMPORTANCE_FACTOR[task.importance] +
    WEIGHTS.due * dueFactor(task.due, today) +
    WEIGHTS.quick * quickFactor(task.estimateMinutes) +
    WEIGHTS.age * ageFactor(task.createdAt, today)
  );
}

/** 0 ~ 100 的整数紧迫度分。 */
export function urgencyScore(task: Task, today: string = todayKey()): number {
  const normalized = (rawScore(task, today) / MAX_RAW) * 100;
  if (!Number.isFinite(normalized)) return 0;
  return Math.max(0, Math.min(100, Math.round(normalized)));
}

export function urgencyTier(score: number): UrgencyTier {
  if (score >= 75) return "critical";
  if (score >= 55) return "high";
  if (score >= 35) return "medium";
  return "low";
}

/**
 * 系统智能排定（PRD §4 模块1）。
 * 同分时用「创建时间更早」优先，再退化为 id，保证排序稳定且可预测。
 */
export function sortByUrgency(tasks: readonly Task[], today: string = todayKey()): Task[] {
  return tasks
    .map((task) => ({ task, score: urgencyScore(task, today) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.task.createdAt.localeCompare(b.task.createdAt) ||
        a.task.id.localeCompare(b.task.id),
    )
    .map((entry) => entry.task);
}

/** 「只做一件事」推选出的当前唯一任务（PRD §4 模块2）。 */
export function selectFocusTask(tasks: readonly Task[], today: string = todayKey()): Task | null {
  const candidates = tasks.filter((task) => !task.done && !task.archived);
  if (candidates.length === 0) return null;
  return sortByUrgency(candidates, today)[0];
}
