import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { dateKeyOf, todayKey } from "../domain/dates";
import { activeHabits } from "../domain/habits";
import type { DailyHabit, HabitSchedule } from "../domain/types";
import { nextCombo } from "../domain/streak";
import { defaultState } from "../domain/validation";
import type { Task } from "../domain/types";
import { browserStorage, loadState, saveState, type StorageLike } from "../store/persistence";
import {
  dormantTasks,
  energy,
  focusTask,
  orderedTasks,
  pendingTasks,
  reducer,
  type Action,
} from "../store/taskStore";
import { playChime, playSoftReset, playTick, unlockAudio } from "../feedback/chime";
import { celebrateAllClear, celebrateCombo, celebrateSmall } from "../feedback/confetti";
import { vibrate } from "../feedback/haptics";
import { tr } from "../i18n";
import { allClearQuote, momentumQuote, restartQuote, startQuote } from "../feedback/quotes";
import { useSystemReduceMotion } from "./useReduceMotion";
import { useToasts } from "./useToasts";
import { useNow } from "./useNow";
import { useToday } from "./useToday";

/** localStorage 不可用时的内存兜底，保证应用永远能跑。 */
function memoryStorage(): StorageLike {
  let value: string | null = null;
  return {
    getItem: () => value,
    setItem: (_key, next) => {
      value = next;
    },
    removeItem: () => {
      value = null;
    },
  };
}

export interface ActionPulseApi {
  state: ReturnType<typeof defaultState>;
  today: string;
  dispatch: (action: Action) => void;
  /** 每次完成事件自增，用于触发脉冲示波器的「跳动」。 */
  beat: number;
  toasts: ReturnType<typeof useToasts>["toasts"];
  dismissToast: (id: string) => void;
  pushToast: (text: string, tone?: "normal" | "hot" | "info") => void;
  toggleTask: (task: Task, origin?: { x: number; y: number }) => void;
  addHabit: (title: string, emoji?: string, schedule?: HabitSchedule, scheduleDay?: number | null) => void;
  toggleHabit: (habit: DailyHabit, origin?: { x: number; y: number }) => void;
  completeHabit: (habit: DailyHabit) => void;
  archiveHabit: (id: string) => void;
  unarchiveHabit: (id: string) => void;
  toggleSubtask: (task: Task, subId: string) => void;
  addTask: (title: string, patch?: Partial<Task>) => void;
  updateTask: (id: string, patch: Partial<Task>) => void;
  removeTask: (id: string) => void;
  moveTask: (id: string, toIndex: number) => void;
  currentFocus: Task | null;
  ordered: Task[];
  pending: Task[];
  /** 冷却休眠区（超过 14 天没碰过、且无截止日期）。 */
  dormant: Task[];
  energySnapshot: ReturnType<typeof energy>;
  reduceMotion: boolean;
}

export function useActionPulse(): ActionPulseApi {
  const storageRef = useMemo(() => browserStorage() ?? memoryStorage(), []);
  const [state, dispatch] = useReducer(reducer, undefined, () => loadState(storageRef));
  const today = useToday();
  // 慢速推进的「当前时间」：休眠判定依赖它，但不需要每帧精算
  const now = useNow();
  const systemReduceMotion = useSystemReduceMotion();
  const { toasts, push, dismiss } = useToasts();
  const [beat, setBeat] = useState(0);

  // 持久化。失败（配额满/隐私模式）只提示一次，写入恢复后重置——否则每次
  // 状态变化都会刷一条 toast。降级本身是刻意设计（内存可用），缺的只是声音（审计 Bug 4）。
  const storageWarnedRef = useRef(false);
  useEffect(() => {
    const result = saveState(storageRef, state);
    if (!result.ok && !storageWarnedRef.current) {
      storageWarnedRef.current = true;
      push(tr("toast.storageFull"), "hot");
    } else if (result.ok && storageWarnedRef.current) {
      storageWarnedRef.current = false;
    }
  }, [storageRef, state, push]);

  const reduceMotion = state.settings.reduceMotion || systemReduceMotion;
  const settings = state.settings;

  // 首次用户手势时解锁 Web Audio（iOS 要求）。
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  const bounce = useCallback(() => setBeat((value) => value + 1), []);

  const toggleTask = useCallback(
    (task: Task, origin?: { x: number; y: number }) => {
      const now = Date.now();

      if (task.done) {
        dispatch({ type: "task/toggle", id: task.id, now });
        if (settings.soundEnabled) playSoftReset(settings.soundVolume);
        if (settings.encourageEnabled) push(restartQuote(now), "info");
        return;
      }

      const combo = nextCombo(
        { combo: state.stats.combo, lastCompletionAt: state.stats.lastCompletionAt },
        now,
      ).combo;
      const remaining = pendingTasks(state, Date.now()).filter((candidate) => candidate.id !== task.id).length;

      dispatch({ type: "task/toggle", id: task.id, now });
      bounce();

      if (settings.soundEnabled) playChime(settings.soundVolume, combo);
      if (settings.vibrationEnabled) vibrate(combo >= 3 ? "combo" : "complete");
      if (settings.confettiEnabled && !reduceMotion) {
        void (combo >= 3 ? celebrateCombo(origin) : celebrateSmall(origin));
      }
      if (settings.encourageEnabled) {
        if (remaining === 0) {
          push(allClearQuote(now), "hot");
          if (settings.confettiEnabled && !reduceMotion) void celebrateAllClear();
        } else if (combo >= 2) {
          push(momentumQuote(combo, now), "hot");
        } else {
          push(startQuote(now), "normal");
        }
      }
    },
    [state, dispatch, settings, reduceMotion, bounce, push],
  );

  const addHabit = useCallback(
    (title: string, emoji?: string, schedule?: HabitSchedule, scheduleDay?: number | null) => {
      dispatch({ type: "habit/add", title, emoji, schedule, scheduleDay, now: Date.now() });
    },
    [dispatch],
  );

  const archiveHabit = useCallback((id: string) => dispatch({ type: "habit/archive", id }), [dispatch]);
  const unarchiveHabit = useCallback((id: string) => dispatch({ type: "habit/unarchive", id }), [dispatch]);

  /**
   * 习惯打勾：沿用与任务相同的多巴胺反馈。
   * 连击（Combo）刻意不参与 —— Combo 是「一段冲刺里的连续完成」，习惯是每日仪式，
   * 两者混在一起会让 Combo 变得没有意义。
   */
  const toggleHabit = useCallback(
    (habit: DailyHabit, origin?: { x: number; y: number }) => {
      const now = Date.now();
      const day = dateKeyOf(now);
      const wasDone = day !== null && habit.completedDates.includes(day);
      const remaining =
        day === null
          ? 0
          : activeHabits(state.habits).filter(
              (other) => other.id !== habit.id && !other.completedDates.includes(day),
            ).length;

      dispatch({ type: "habit/toggle", id: habit.id, now });

      if (wasDone) {
        if (settings.soundEnabled) playSoftReset(settings.soundVolume);
        return;
      }

      bounce();
      if (settings.soundEnabled) playChime(settings.soundVolume, 1);
      if (settings.vibrationEnabled) vibrate("tick");
      if (settings.confettiEnabled && !reduceMotion) void celebrateSmall(origin);
      if (settings.encourageEnabled) {
        if (remaining === 0) push(allClearQuote(now), "hot");
        else push(startQuote(now), "normal");
      }
    },
    [state.habits, dispatch, settings, reduceMotion, bounce, push],
  );

  const completeHabit = useCallback(
    (habit: DailyHabit) => {
      const now = Date.now();
      const day = dateKeyOf(now);
      const currentHabit = state.habits.find((item) => item.id === habit.id);
      if (!day || !currentHabit || currentHabit.archived || currentHabit.completedDates.includes(day)) return;

      const remaining = activeHabits(state.habits).filter(
        (other) => other.id !== currentHabit.id && !other.completedDates.includes(day),
      ).length;
      dispatch({ type: "habit/complete", id: currentHabit.id, now });
      bounce();
      if (settings.soundEnabled) playChime(settings.soundVolume, 1);
      if (settings.vibrationEnabled) vibrate("tick");
      if (settings.confettiEnabled && !reduceMotion) void celebrateSmall();
      if (settings.encourageEnabled) {
        if (remaining === 0) push(allClearQuote(now), "hot");
        else push(startQuote(now), "normal");
      }
    },
    [state.habits, dispatch, settings, reduceMotion, bounce, push],
  );

  const toggleSubtask = useCallback(
    (task: Task, subId: string) => {
      const sub = task.subtasks.find((entry) => entry.id === subId);
      if (!sub) return;
      const now = Date.now();
      dispatch({ type: "subtask/toggle", taskId: task.id, subId, now });
      if (sub.done) return;
      bounce();
      if (settings.soundEnabled) playTick(settings.soundVolume);
      if (settings.vibrationEnabled) vibrate("tick");
    },
    [dispatch, settings, bounce],
  );

  const addTask = useCallback(
    (title: string, patch?: Partial<Task>) => {
      dispatch({ type: "task/add", title, now: Date.now(), patch });
    },
    [dispatch],
  );

  const updateTask = useCallback((id: string, patch: Partial<Task>) => {
    dispatch({ type: "task/update", id, patch });
  }, [dispatch]);

  const removeTask = useCallback((id: string) => {
    dispatch({ type: "task/remove", id });
  }, [dispatch]);

  const moveTask = useCallback((id: string, toIndex: number) => {
    dispatch({ type: "task/move", id, toIndex });
  }, [dispatch]);

  const ordered = useMemo(() => orderedTasks(state, today, undefined, now), [state, today, now]);
  const pending = useMemo(() => pendingTasks(state, now), [state, now]);
  const dormant = useMemo(() => dormantTasks(state, now), [state, now]);
  const energySnapshot = useMemo(() => energy(state, today), [state, today]);
  const currentFocus = useMemo(() => focusTask(state, today, now), [state, today, now]);

  return {
    state,
    today,
    dispatch,
    beat,
    toasts,
    dismissToast: dismiss,
    pushToast: push,
    toggleTask,
    addHabit,
    toggleHabit,
    completeHabit,
    archiveHabit,
    unarchiveHabit,
    toggleSubtask,
    addTask,
    updateTask,
    removeTask,
    moveTask,
    currentFocus,
    ordered,
    pending,
    dormant,
    energySnapshot,
    reduceMotion,
  };
}

export { todayKey };
