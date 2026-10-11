/**
 * 🏆 今日战报（PRD-v2.1 模块四）。
 *
 * 纯函数：给定 state 与 today，产出数字与一段可复制的 Markdown。
 * 刻意**不读时钟、不读随机数** —— 战报是要被复制出去的文本，必须可复现。
 */
import { dateKeyOf, daysBetween } from "./dates";
import { habitsCompletion } from "./habits";
import { streakDays } from "./streak";
import type { AppState, Task } from "./types";

export interface DebriefStats {
  today: string;
  /** 今天完成的任务数 */
  tasksDone: number;
  /** 今天完成的任务标题（按完成时间倒序），用于战报正文 */
  taskTitles: string[];
  habitsDone: number;
  habitsTotal: number;
  habitPercent: number;
  focusMinutes: number;
  comboPeak: number;
  /** 连续有完成记录的天数 */
  streakDays: number;
  totalCompleted: number;
  /** 近 7 天完成分布（Q 因子观察项的数据回路，见 dev-log/q-factor-tradeoff.md） */
  weekEstimateMix: EstimateMix;
}

export interface EstimateMix {
  /** ≤15 分钟 */
  quick: number;
  /** 16 ~ 60 分钟 */
  medium: number;
  /** > 60 分钟 */
  slow: number;
  /** 未估时 */
  untimed: number;
  total: number;
  /** 速赢占比（0~100 整数）；total 为 0 时为 0，不产生 NaN。 */
  quickPercent: number;
}

/**
 * 近 7 天（含今天）完成的任务按估时分桶。
 * 存在的理由：速赢因子给小任务系统性上浮通道是刻意设计，但它是否在
 * 「喂芝麻」要靠数据回答 —— 这就是那份数据（q-factor-tradeoff.md 的观察项）。
 */
export function estimateMix(tasks: readonly Task[], today: string): EstimateMix {
  const buckets = { quick: 0, medium: 0, slow: 0, untimed: 0 };
  for (const task of tasks) {
    if (!task.done || task.archived || !task.completedAt) continue;
    const day = dateKeyOf(task.completedAt);
    if (!day) continue;
    const diff = daysBetween(day, today);
    if (diff < 0 || diff > 6) continue;
    if (task.estimateMinutes === null) buckets.untimed += 1;
    else if (task.estimateMinutes <= 15) buckets.quick += 1;
    else if (task.estimateMinutes <= 60) buckets.medium += 1;
    else buckets.slow += 1;
  }
  const total = buckets.quick + buckets.medium + buckets.slow + buckets.untimed;
  const quickPercent = total === 0 ? 0 : Math.round((buckets.quick / total) * 100);
  return { ...buckets, total, quickPercent };
}

export function buildDebrief(state: AppState, today: string): DebriefStats {
  const doneToday = state.tasks
    .filter((task) => task.done && !task.archived && dateKeyOf(task.completedAt) === today)
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));

  const habits = habitsCompletion(state.habits, today);

  return {
    today,
    tasksDone: doneToday.length,
    taskTitles: doneToday.map((task) => task.title),
    habitsDone: habits.done,
    habitsTotal: habits.total,
    habitPercent: habits.percent,
    focusMinutes: state.daily.focusMinutes[today] ?? 0,
    comboPeak: state.daily.comboPeak[today] ?? 0,
    streakDays: streakDays(state.stats.completionDates, today),
    totalCompleted: state.stats.totalCompleted,
    weekEstimateMix: estimateMix(state.tasks, today),
  };
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return minutes + " 分钟";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? hours + " 小时" : hours + " 小时 " + rest + " 分钟";
}

/** 生成可粘贴到聊天/笔记里的 Markdown 战报。确定性：同一份数据永远得到同一段文本。 */
export function debriefMarkdown(stats: DebriefStats): string {
  const lines: string[] = [];
  lines.push("## ActionPulse 今日战报 · " + stats.today);
  lines.push("");
  lines.push("- ✅ 完成任务：**" + stats.tasksDone + "** 件");
  if (stats.habitsTotal > 0) {
    lines.push(
      "- ⚡ 日常习惯：**" + stats.habitsDone + "/" + stats.habitsTotal + "**（" + stats.habitPercent + "%）",
    );
  }
  if (stats.focusMinutes > 0) {
    lines.push("- ⏱ 专注时长：**" + formatMinutes(stats.focusMinutes) + "**");
  }
  if (stats.comboPeak > 0) {
    lines.push("- 🔥 今日连击峰值：**x" + stats.comboPeak + "**");
  }
  if (stats.weekEstimateMix.total > 0) {
    const mix = stats.weekEstimateMix;
    lines.push(
      "- ⏳ 近 7 天完成分布：≤15 分钟 ×" +
        mix.quick +
        " · 16–60 分钟 ×" +
        mix.medium +
        " · >60 分钟 ×" +
        mix.slow +
        " · 未估时 ×" +
        mix.untimed +
        "（速赢 " +
        mix.quickPercent +
        "%）",
    );
  }
  lines.push("- 🗓 连续天数：**" + stats.streakDays + "** 天");
  lines.push("- 📈 累计完成：**" + stats.totalCompleted + "** 件");

  if (stats.taskTitles.length > 0) {
    lines.push("");
    lines.push("完成清单：");
    for (const title of stats.taskTitles) {
      lines.push("- " + title);
    }
  }

  lines.push("");
  lines.push("> 由 ActionPulse 脉冲行动生成");
  return lines.join("\n");
}
