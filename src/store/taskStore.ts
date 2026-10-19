/**
 * 纯函数状态层：reducer + 选择器。
 * 不含任何 React 依赖，因此可以被单元测试直接驱动（见 tests/store.test.ts）。
 *
 * v2 起承担同步所需的两个不变量：
 *  1. 任务内容一变，`updatedAt` 必然严格递增（否则多端合并分不出新旧）。
 *  2. 删除必须写墓碑（否则别的设备会把已删除任务推回来复活）。
 */
import { nextStamp } from "../domain/clock";
import { dateKeyOf } from "../domain/dates";
import { completeHabitDate, createHabit, toggleHabitDate } from "../domain/habits";
import { isHibernating } from "../domain/hibernation";
import { createId } from "../domain/id";
import { mergeStates } from "../domain/merge";
import { nextCombo, recordCompletionDate, todayEnergy } from "../domain/streak";
import { selectFocusTask, sortByUrgency } from "../domain/urgency";
import { defaultStats, sanitizeSettings, sanitizeState, sanitizeTask } from "../domain/validation";
import type {
  AppState,
  DailyHabit,
  EnergySnapshot,
  HabitSchedule,
  Importance,
  PriorityMode,
  Quadrant,
  Settings,
  SubTask,
  Task,
} from "../domain/types";

/** 单次专注最多记 3 小时，防止计时器被挂着一整天刷出离谱数字。 */
export const MAX_FOCUS_RECORD_MINUTES = 180;

export interface TaskDraft {
  title: string;
  notes?: string;
  importance?: Importance;
  due?: string | null;
  estimateMinutes?: number | null;
  quadrant?: Quadrant | null;
  subtasks?: SubTask[];
  manualRank?: number;
}

export type Action =
  | { type: "task/add"; title: string; now: number; patch?: Omit<TaskDraft, "title"> }
  | { type: "task/update"; id: string; patch: Partial<Task> }
  | { type: "task/remove"; id: string }
  | { type: "task/toggle"; id: string; now: number }
  | { type: "task/archiveCompleted" }
  | { type: "task/move"; id: string; toIndex: number }
  | { type: "task/restore"; id: string }
  | { type: "subtask/add"; taskId: string; title: string }
  | { type: "subtask/remove"; taskId: string; subId: string }
  | { type: "subtask/toggle"; taskId: string; subId: string; now: number }
  | { type: "subtask/set"; taskId: string; titles: string[] }
  | { type: "habit/add"; title: string; emoji?: string; schedule?: HabitSchedule; scheduleDay?: number | null; now: number }
  | { type: "habit/toggle"; id: string; now: number }
  | { type: "habit/complete"; id: string; now: number }
  | { type: "habit/update"; id: string; patch: { title?: string; emoji?: string } }
  | { type: "habit/archive"; id: string }
  | { type: "habit/unarchive"; id: string }
  | { type: "task/wake"; id: string }
  | { type: "metrics/recordFocus"; minutes: number; now: number }
  | { type: "settings/patch"; patch: Partial<Settings> }
  | { type: "state/import"; state: AppState }
  | { type: "state/merge"; state: unknown; now?: number }
  | { type: "state/reset" };

export function createTask(draft: TaskDraft, now: number = Date.now()): Task {
  const timestamp = new Date(now).toISOString();
  return {
    id: createId("task"),
    title: draft.title.trim(),
    notes: draft.notes ?? "",
    importance: draft.importance ?? "medium",
    due: draft.due ?? null,
    estimateMinutes: draft.estimateMinutes ?? null,
    quadrant: draft.quadrant ?? null,
    manualRank: draft.manualRank ?? 0,
    subtasks: draft.subtasks ? draft.subtasks.map((sub) => ({ ...sub })) : [],
    done: false,
    createdAt: timestamp,
    completedAt: null,
    archived: false,
    updatedAt: now,
  };
}

function mapTask(state: AppState, id: string, updater: (task: Task) => Task): AppState {
  let touched = false;
  const tasks = state.tasks.map((task) => {
    if (task.id !== id) return task;
    touched = true;
    const next = updater(task);
    return { ...next, updatedAt: nextStamp(task.updatedAt) };
  });
  return touched ? { ...state, tasks } : state;
}

function mapSubtask(state: AppState, taskId: string, updater: (sub: SubTask) => SubTask | null): AppState {
  return mapTask(state, taskId, (task) => {
    const next: SubTask[] = [];
    for (const sub of task.subtasks) {
      const updated = updater(sub);
      if (updated !== null) next.push(updated);
    }
    return { ...task, subtasks: next };
  });
}

function nextManualRank(tasks: readonly Task[]): number {
  return tasks.reduce((max, task) => Math.max(max, task.manualRank + 1), 0);
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "task/add": {
      const title = action.title.trim();
      if (title.length === 0) return state;
      const task = createTask({ ...action.patch, title, manualRank: nextManualRank(state.tasks) }, action.now);
      return { ...state, tasks: [...state.tasks, task] };
    }

    case "task/update":
      return mapTask(
        state,
        action.id,
        (task) => sanitizeTask({ ...task, ...action.patch, id: task.id }) ?? task,
      );

    case "task/remove": {
      const target = state.tasks.find((task) => task.id === action.id);
      if (!target) return state;
      return {
        ...state,
        tasks: state.tasks.filter((task) => task.id !== action.id),
        // 墓碑必须不早于任务本身，否则合并时会被判成"过期删除"而复活
        tombstones: { ...state.tombstones, [action.id]: nextStamp(target.updatedAt) },
      };
    }

    case "task/restore":
      return mapTask(state, action.id, (task) => ({ ...task, archived: false }));

    case "task/toggle": {
      const target = state.tasks.find((task) => task.id === action.id);
      if (!target) return state;

      // 取消勾选：只回滚完成标记，不回滚统计（避免出现「负连击」这种荒谬反馈）。
      if (target.done) {
        return mapTask(state, action.id, (task) => ({ ...task, done: false, completedAt: null }));
      }

      const completedAt = new Date(action.now).toISOString();
      const tasks = state.tasks.map((task) =>
        task.id === action.id
          ? { ...task, done: true, completedAt, updatedAt: nextStamp(task.updatedAt) }
          : task,
      );
      const combo = nextCombo(
        { combo: state.stats.combo, lastCompletionAt: state.stats.lastCompletionAt },
        action.now,
      );
      const peakDay = dateKeyOf(action.now);
      const daily = peakDay
        ? {
            ...state.daily,
            comboPeak: {
              ...state.daily.comboPeak,
              [peakDay]: Math.max(state.daily.comboPeak[peakDay] ?? 0, combo.combo),
            },
          }
        : state.daily;
      return {
        ...state,
        tasks,
        daily,
        stats: {
          ...state.stats,
          combo: combo.combo,
          lastCompletionAt: combo.lastCompletionAt,
          bestCombo: Math.max(state.stats.bestCombo, combo.combo),
          totalCompleted: state.stats.totalCompleted + 1,
          completionDates: recordCompletionDate(state.stats.completionDates, action.now),
        },
      };
    }

    case "task/archiveCompleted": {
      if (!state.tasks.some((task) => task.done && !task.archived)) return state;
      return {
        ...state,
        tasks: state.tasks.map((task) =>
          task.done && !task.archived ? { ...task, archived: true, updatedAt: nextStamp(task.updatedAt) } : task,
        ),
      };
    }

    case "task/move": {
      const index = state.tasks.findIndex((task) => task.id === action.id);
      if (index === -1) return state;
      const reordered = [...state.tasks];
      const [moved] = reordered.splice(index, 1);
      const target = Math.max(0, Math.min(reordered.length, Math.floor(action.toIndex)));
      reordered.splice(target, 0, moved);
      return {
        ...state,
        tasks: reordered.map((task, position) =>
          task.manualRank === position
            ? task
            : { ...task, manualRank: position, updatedAt: nextStamp(task.updatedAt) },
        ),
      };
    }

    case "subtask/add": {
      const title = action.title.trim();
      if (title.length === 0) return state;
      return mapTask(state, action.taskId, (task) => ({
        ...task,
        subtasks: [...task.subtasks, { id: createId("sub"), title, done: false, completedAt: null }],
      }));
    }

    case "subtask/remove":
      return mapTask(state, action.taskId, (task) => ({
        ...task,
        subtasks: task.subtasks.filter((sub) => sub.id !== action.subId),
      }));

    case "subtask/toggle": {
      const completedAt = new Date(action.now).toISOString();
      return mapSubtask(state, action.taskId, (sub) => {
        if (sub.id !== action.subId) return sub;
        const done = !sub.done;
        return { ...sub, done, completedAt: done ? completedAt : null };
      });
    }

    case "subtask/set":
      return mapTask(state, action.taskId, (task) => ({
        ...task,
        subtasks: action.titles
          .map((title) => title.trim())
          .filter((title) => title.length > 0)
          .map((title) => ({ id: createId("sub"), title, done: false, completedAt: null })),
      }));

    case "habit/add": {
      const title = action.title.trim();
      if (title.length === 0) return state;
      return {
        ...state,
        habits: [
          ...state.habits,
          createHabit(
            { title, emoji: action.emoji, schedule: action.schedule, scheduleDay: action.scheduleDay },
            action.now,
          ),
        ],
      };
    }

    case "habit/toggle": {
      const today = dateKeyOf(action.now);
      if (!today || !state.habits.some((habit) => habit.id === action.id)) return state;
      return {
        ...state,
        habits: state.habits.map((habit) =>
          habit.id === action.id ? toggleHabitDate(habit, today, action.now) : habit,
        ),
      };
    }

    case "habit/complete": {
      const today = dateKeyOf(action.now);
      if (!today) return state;
      const target = state.habits.find((habit) => habit.id === action.id);
      if (!target || target.archived) return state;
      const completed = completeHabitDate(target, today, action.now);
      if (completed === target) return state;
      return {
        ...state,
        habits: state.habits.map((habit) => (habit.id === action.id ? completed : habit)),
      };
    }

    case "habit/update": {
      if (!state.habits.some((habit) => habit.id === action.id)) return state;
      return {
        ...state,
        habits: state.habits.map((habit) => {
          if (habit.id !== action.id) return habit;
          const title = action.patch.title?.trim();
          const emoji = action.patch.emoji?.trim();
          return {
            ...habit,
            title: title && title.length > 0 ? title : habit.title,
            emoji: emoji && emoji.length > 0 ? emoji : habit.emoji,
            updatedAt: nextStamp(habit.updatedAt),
          };
        }),
      };
    }

    case "habit/archive":
    case "habit/unarchive": {
      if (!state.habits.some((habit) => habit.id === action.id)) return state;
      const archived = action.type === "habit/archive";
      return {
        ...state,
        habits: state.habits.map((habit) =>
          habit.id === action.id ? { ...habit, archived, updatedAt: nextStamp(habit.updatedAt) } : habit,
        ),
      };
    }

    // 唤醒僵尸任务：把它「摸一下」，离开休眠判定。如果用户不处理，14 天后会再次休眠。
    case "task/wake":
      return mapTask(state, action.id, (task) => task);

    case "metrics/recordFocus": {
      const day = dateKeyOf(action.now);
      if (!day) return state;
      const minutes = Math.round(Math.min(MAX_FOCUS_RECORD_MINUTES, Math.max(0, action.minutes)));
      if (minutes <= 0) return state;
      const current = state.daily.focusMinutes[day] ?? 0;
      return {
        ...state,
        daily: {
          ...state.daily,
          focusMinutes: { ...state.daily.focusMinutes, [day]: current + minutes },
        },
      };
    }

    case "settings/patch":
      return { ...state, settings: sanitizeSettings({ ...state.settings, ...action.patch }) };

    case "state/import":
      return sanitizeState(action.state);

    case "state/merge": {
      const merged = mergeStates(state, action.state, action.now);
      // changed=false 时必须返回原引用：否则「拉取 -> 合并 -> 状态变化 -> 再推送」会形成同步回环
      return merged.changed ? merged.state : state;
    }

    case "state/reset": {
      // 清空也要立墓碑，否则别的设备一同步就把任务全推回来了
      const tombstones = { ...state.tombstones };
      for (const task of state.tasks) tombstones[task.id] = nextStamp(task.updatedAt);
      return { ...state, tasks: [], stats: defaultStats(), tombstones };
    }

    default:
      return state;
  }
}

/* ---------------------------------- 选择器 --------------------------------- */

/**
 * 活动待办。
 * 注意 \`now\` 参数：休眠是**派生**的（按 now 算），所以它会随时间自然生效。
 * 默认取当前时间，方便调用方与测试；排序/聚焦/四象限都从这里往下走。
 */
export function pendingTasks(state: AppState, now: number = Date.now()): Task[] {
  return state.tasks.filter((task) => !task.done && !task.archived && !isHibernating(task, now));
}

/** 冷却休眠区：超过 14 天没碰过、且没有截止日期的任务。 */
export function dormantTasks(state: AppState, now: number = Date.now()): Task[] {
  return state.tasks.filter((task) => isHibernating(task, now));
}

export function completedToday(state: AppState, today: string): Task[] {
  return state.tasks
    .filter((task) => task.done && !task.archived && dateKeyOf(task.completedAt) === today)
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
}

export function archivedTasks(state: AppState): Task[] {
  return state.tasks.filter((task) => task.archived);
}

/** 系统智能排定模式下的展示顺序（PRD §4 模块1）。 */
export function sortedByUrgency(state: AppState, today: string, now?: number): Task[] {
  return sortByUrgency(pendingTasks(state, now), today);
}

/** 手动模式下的展示顺序：按拖拽位次。 */
export function manualOrdered(state: AppState, now?: number): Task[] {
  return [...pendingTasks(state, now)].sort(
    (a, b) => a.manualRank - b.manualRank || a.createdAt.localeCompare(b.createdAt),
  );
}

export function orderedTasks(state: AppState, today: string, mode?: PriorityMode, now?: number): Task[] {
  const effective = mode ?? state.settings.priorityMode;
  return effective === "manual" ? manualOrdered(state, now) : sortedByUrgency(state, today, now);
}

export const QUADRANTS: readonly Quadrant[] = ["q1", "q2", "q3", "q4"];

export function quadrantBuckets(state: AppState, now?: number): Record<Quadrant | "inbox", Task[]> {
  const buckets: Record<Quadrant | "inbox", Task[]> = { q1: [], q2: [], q3: [], q4: [], inbox: [] };
  for (const task of manualOrdered(state, now)) {
    buckets[task.quadrant ?? "inbox"].push(task);
  }
  return buckets;
}

export function focusTask(state: AppState, today: string, now?: number): Task | null {
  if (state.settings.priorityMode === "manual") {
    const ordered = manualOrdered(state, now);
    return ordered.length > 0 ? ordered[0] : null;
  }
  return selectFocusTask(pendingTasks(state, now), today);
}

export function energy(state: AppState, today: string): EnergySnapshot {
  return todayEnergy(state.tasks, state.habits, today);
}

/** 复盘用：今日已完成 / 今日承诺量。 */
export function todayProgress(state: AppState, today: string): { done: number; pending: number } {
  const snapshot = todayEnergy(state.tasks, state.habits, today);
  return { done: snapshot.done, pending: snapshot.total - snapshot.done };
}

/** 未归档的习惯，按创建时间排序（药丸行的顺序）。 */
export function activeHabitList(state: AppState): DailyHabit[] {
  return state.habits
    .filter((habit) => !habit.archived)
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

export function archivedHabitList(state: AppState): DailyHabit[] {
  return state.habits.filter((habit) => habit.archived);
}
