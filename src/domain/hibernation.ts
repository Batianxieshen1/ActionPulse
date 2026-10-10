/**
 * 🧊 僵尸任务休眠防腐（PRD-v2.1 模块五）。
 *
 * 目标不是"整理"，而是防止待办清单因为堆了几十条陈年旧事变成心理负担。
 *
 * 三个关键设计：
 *
 * 1. **派生，不存储。** 休眠状态由 \`now - updatedAt\` 算出来，不做标记位。
 *    存标记就要参与多端合并，两端翻标记的时刻不同还会打架；
 *    派生则零同步成本、零冲突。代价是两台设备的休眠时刻可能差几小时 —— 那只是视图差异，无妨。
 *
 * 2. **用 \`updatedAt\` 作为「最近有没有动过」的依据。** 它在 v2 就是同步 LWW 的字段，
 *    每次内容改动（含微步骤打勾、AI 拆解）都会推进，正好可以复用，不需要新字段。
 *
 * 3. **与 \`ageFactor\`（搁置补偿）并不矛盾。** 紧迫度算法里 \`min(创建天数/7, 1)\` 在第 7 天封顶，
 *    而休眠阈值是第 14 天 —— 先"加速提醒"，再"安静收走"，是个连贯的两段式设计。
 *    阈值若小于 7 天才会真的掐掉搁置补偿。
 */
import type { Task } from "./types";

export const HIBERNATION_DAYS = 14;
export const HIBERNATION_MS = HIBERNATION_DAYS * 24 * 60 * 60 * 1000;

/**
 * 是否进入冷却休眠：**没有截止日期**、未完成、未归档，且 14 天没被碰过。
 *
 * 有截止日期的任务永不休眠 —— 那是对某人的明确承诺，藏起来比摆在眼前更糟。
 */
export function isHibernating(task: Task, now: number): boolean {
  if (task.archived || task.done) return false;
  if (task.due !== null) return false;
  return now - task.updatedAt > HIBERNATION_MS;
}

export function splitDormant(tasks: readonly Task[], now: number): { active: Task[]; dormant: Task[] } {
  const active: Task[] = [];
  const dormant: Task[] = [];
  for (const task of tasks) {
    if (isHibernating(task, now)) dormant.push(task);
    else active.push(task);
  }
  return { active, dormant };
}

/** 已经搁置了多少天，用于休眠区展示。 */
export function dormantDays(task: Task, now: number): number {
  return Math.floor((now - task.updatedAt) / (24 * 60 * 60 * 1000));
}
