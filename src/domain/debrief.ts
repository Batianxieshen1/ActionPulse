/**
 * 🏆 今日战报（PRD-v2.1 模块四）。
 *
 * 纯函数：给定 state 与 today，产出数字与一段可复制的 Markdown。
 * 刻意**不读时钟、不读随机数** —— 战报是要被复制出去的文本，必须可复现。
 */
import { dateKeyOf } from "./dates";
import { habitsCompletion } from "./habits";
import { streakDays } from "./streak";
import type { AppState } from "./types";

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
