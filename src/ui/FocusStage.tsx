import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Moon, Shuffle, Sparkles, X, Zap } from "lucide-react";
import { daysBetween } from "../domain/dates";
import { isDoneToday } from "../domain/habits";
import type { DailyHabit, Task } from "../domain/types";
import { urgencyScore } from "../domain/urgency";
import { usePomodoro } from "../hooks/usePomodoro";
import { PomodoroRing } from "./PomodoroTimer";
import { TaskCheck } from "./TaskCheck";
import { UrgencyBadge } from "./UrgencyBadge";

interface SharedProps {
  today: string;
  pomodoroMinutes: number;
  onExit: () => void;
  onTimerFinish: () => void;
  /** 结算专注时长，交给上层累计（按日聚合，多端取最大值）。 */
  onFocusMinutes: (minutes: number) => void;
}

interface TaskProps extends SharedProps {
  kind: "task";
  tasks: Task[];
  /** 盲盒掷中的任务：优先展示它，而不是永远展示第一名。 */
  pinnedId?: string | null;
  onToggle: (task: Task, origin?: { x: number; y: number }) => void;
  onToggleSubtask: (task: Task, subId: string) => void;
  onBreakdown: (task: Task) => void;
  breakingDown: boolean;
}

interface HabitProps extends SharedProps {
  kind: "habit";
  habit: DailyHabit | null;
  todayDone: boolean;
  onCompleteHabit: (id: string) => void;
}

type Props = TaskProps | HabitProps;

/** ⚡2 分钟破冰的时长（PRD-v2.1 模块二）。 */
const KICKSTART_MINUTES = 2;

/**
 * 「只做一件事」决策破局器（PRD §4 模块2 + v2.1 模块二）。
 *
 * 计时器由本组件持有（而不是 PomodoroRing 内部），因为「2 分钟结束后一键续杯成 25 分钟」
 * 需要直接调用 \`start(25)\` 临时指定时长，不能让时长走一轮 props 再等渲染。
 */
export function FocusStage(props: Props) {
  const { today, pomodoroMinutes, onExit, onTimerFinish, onFocusMinutes } = props;
  const taskProps = props.kind === "task" ? props : null;
  const habitProps = props.kind === "habit" ? props : null;
  const tasks = taskProps?.tasks ?? [];
  const pinnedId = taskProps?.pinnedId ?? null;
  const onToggle = taskProps?.onToggle;
  const onToggleSubtask = taskProps?.onToggleSubtask;
  const onBreakdown = taskProps?.onBreakdown;
  const breakingDown = taskProps?.breakingDown ?? false;
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [swapNote, setSwapNote] = useState(false);
  const [kickstart, setKickstart] = useState(false);
  const [refillReady, setRefillReady] = useState(false);
  const [habitCompletedDay, setHabitCompletedDay] = useState<string | null>(null);

  const minutes = kickstart ? KICKSTART_MINUTES : pomodoroMinutes;

  // 结算专注时长：跑动中持续记录已跑时长；结束时结算；退出时结算未满一轮的零头
  const elapsedRef = useRef(0);
  const onFocusMinutesRef = useRef(onFocusMinutes);
  onFocusMinutesRef.current = onFocusMinutes;

  const runRef = useRef({ totalMs: 0, kickstart: false });
  const onTimerFinishRef = useRef(onTimerFinish);
  onTimerFinishRef.current = onTimerFinish;

  const handleFinish = useCallback(() => {
    const snapshot = runRef.current;
    const spent = Math.max(1, Math.round(snapshot.totalMs / 60_000));
    onFocusMinutesRef.current(spent);
    elapsedRef.current = 0; // 已结算，避免退出时重复计入
    onTimerFinishRef.current();
    if (snapshot.kickstart) setRefillReady(true);
  }, []);

  const timer = usePomodoro(minutes, handleFinish);
  runRef.current = { totalMs: timer.totalMs, kickstart };
  const isHabitDone = Boolean(
    habitProps &&
      (habitProps.todayDone ||
        (habitProps.habit && isDoneToday(habitProps.habit, today)) ||
        habitCompletedDay === today),
  );

  useEffect(() => {
    if (timer.status === "running") {
      elapsedRef.current = Math.max(elapsedRef.current, timer.elapsedMs);
    }
  }, [timer.status, timer.elapsedMs]);

  useEffect(
    () => () => {
      const minutesRun = Math.floor(elapsedRef.current / 60_000);
      if (minutesRun >= 1) onFocusMinutesRef.current(minutesRun);
    },
    [],
  );

  const current = useMemo(() => {
    if (pinnedId && !dismissed.includes(pinnedId)) {
      const pinned = tasks.find((task) => task.id === pinnedId);
      if (pinned) return pinned;
    }
    return tasks.find((task) => !dismissed.includes(task.id)) ?? null;
  }, [tasks, dismissed, pinnedId]);

  const skip = useCallback(() => {
    if (!current) return;
    setDismissed((prev) => [...prev, current.id]);
    setSwapNote(true);
    window.setTimeout(() => setSwapNote(false), 1600);
  }, [current]);

  const reset = useCallback(() => setDismissed([]), []);

  const switchMode = useCallback(
    (next: boolean) => {
      setKickstart(next);
      setRefillReady(false);
      timer.reset();
    },
    [timer],
  );

  const refill = useCallback(() => {
    setKickstart(false);
    setRefillReady(false);
    // 直接指定 25 分钟开始，无缝衔接；不必先改状态再等一轮渲染
    timer.start(pomodoroMinutes);
  }, [timer, pomodoroMinutes]);

  const completeCurrentHabit = useCallback(() => {
    if (!habitProps?.habit || habitProps.todayDone || isDoneToday(habitProps.habit, today) || habitCompletedDay === today) return;
    if (timer.status === "running") {
      elapsedRef.current = Math.max(elapsedRef.current, timer.elapsedMs);
      timer.pause();
    }
    setHabitCompletedDay(today);
    setRefillReady(false);
    habitProps.onCompleteHabit(habitProps.habit.id);
  }, [habitProps, today, habitCompletedDay, timer]);

  const dueText = (() => {
    if (!current?.due) return null;
    const diff = daysBetween(today, current.due);
    if (diff < 0) return `已超期 ${-diff} 天`;
    if (diff === 0) return "今天截止";
    if (diff === 1) return "明天截止";
    return `${diff} 天后截止`;
  })();

  return (
    <div className="ap-overlay" role="dialog" aria-modal="true" aria-label="聚焦当下">
      <header className="flex items-center justify-between px-5 py-4 sm:px-8">
        <div className="flex items-center gap-2">
          <span className="ap-label">聚焦当下</span>
          <span className="ap-mono ap-t-xs text-[var(--text-faint)]">/ 只做这一件</span>
        </div>
        <button type="button" className="ap-btn" data-variant="ghost" onClick={onExit}>
          <X size={14} /> 退出聚焦
        </button>
      </header>

      <div className="flex flex-1 items-center justify-center overflow-y-auto px-5 pb-10 sm:px-8">
        {habitProps ? (
          habitProps.habit ? (
            <div className="w-full max-w-[560px] space-y-7 text-center">
              <div className="space-y-3">
                <span className="ap-chip">日常习惯</span>
                <div aria-hidden="true" className="text-4xl">{habitProps.habit.emoji}</div>
                <h1 className="ap-t-xl leading-[1.3] font-semibold tracking-tight sm:ap-t-2xl">
                  {habitProps.habit.title}
                </h1>
                <p className="ap-label">把今天的日常，变成现在的一小步。</p>
              </div>

              {isHabitDone ? (
                <div className="space-y-4" role="status" aria-live="polite">
                  <p className="ap-t-md text-[var(--pulse)]">今天已完成，做得好。</p>
                  <button type="button" className="ap-btn" data-variant="primary" onClick={onExit}>
                    回到清单
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="ap-btn mx-auto ap-btn--cta"
                  data-variant="primary"
                  onClick={completeCurrentHabit}
                >
                  <Check size={16} strokeWidth={3} /> 完成今日习惯
                </button>
              )}

              <div className="flex flex-col items-center gap-3 pt-1">
                <div className="flex rounded-[10px] border border-[var(--line)] p-0.5">
                  <button
                    type="button"
                    className="ap-btn ap-btn--sm"
                    data-variant="ghost"
                    data-active={kickstart ? undefined : "true"}
                    disabled={isHabitDone}
                    onClick={() => switchMode(false)}
                  >
                    {pomodoroMinutes} 分钟
                  </button>
                  <button
                    type="button"
                    className="ap-btn ap-btn--sm"
                    data-variant="ghost"
                    data-active={kickstart ? "true" : undefined}
                    disabled={isHabitDone}
                    onClick={() => switchMode(true)}
                  >
                    <Zap size={12} /> 2 分钟启动
                  </button>
                </div>

                {kickstart && timer.status === "idle" && !isHabitDone ? (
                  <p className="max-w-[38ch] text-center ap-t-sm leading-6 text-[var(--text-faint)]">
                    只要做两分钟，就能战胜拖延 —— 两分钟后你可以停，也可以接着做。
                  </p>
                ) : null}

                <PomodoroRing
                  timer={timer}
                  label={`${minutes} 分钟`}
                  size={132}
                  disabled={isHabitDone}
                />

                {refillReady && !isHabitDone ? (
                  <div className="flex flex-col items-center gap-2">
                    <p className="ap-t-sm text-[var(--tier-high)]">两分钟到了 —— 势头还在的话，接着做？</p>
                    <button type="button" className="ap-btn" data-variant="primary" onClick={refill}>
                      <Zap size={13} /> 续杯 {pomodoroMinutes} 分钟
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="max-w-[380px] space-y-4 text-center">
              <Moon size={26} className="mx-auto text-[var(--text-faint)]" />
              <p className="ap-t-md">这个日常习惯暂时不可用</p>
              <p className="ap-t-sm text-[var(--text-faint)]">它可能已被归档或移除。</p>
              <button type="button" className="ap-btn" data-variant="primary" onClick={onExit}>
                回到清单
              </button>
            </div>
          )
        ) : current ? (
          <div className="w-full max-w-[560px] space-y-7">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <UrgencyBadge score={urgencyScore(current, today)} />
                {dueText ? (
                  <span className="ap-chip" data-tone={current.due && current.due < today ? "danger" : "today"}>
                    {dueText}
                  </span>
                ) : null}
                {current.estimateMinutes !== null ? (
                  <span className="ap-chip">预估 {current.estimateMinutes} 分钟</span>
                ) : null}
              </div>

              <h1 className="ap-t-xl leading-[1.3] font-semibold tracking-tight sm:ap-t-2xl">
                {current.title}
              </h1>

              {current.notes.trim().length > 0 ? (
                <p className="max-w-[46ch] ap-t-base leading-6 text-[var(--text-dim)]">{current.notes}</p>
              ) : null}
            </div>

            {current.subtasks.length > 0 ? (
              <ul className="space-y-2">
                {current.subtasks.map((sub, index) => (
                  <li key={sub.id} className="flex items-center gap-3">
                    <span className="ap-mono w-4 text-right ap-t-xs text-[var(--text-faint)]">{index + 1}</span>
                    <TaskCheck
                      checked={sub.done}
                      label={sub.done ? `取消完成 ${sub.title}` : `完成 ${sub.title}`}
                      onToggle={() => onToggleSubtask?.(current, sub.id)}
                    />
                    <span
                      className="ap-t-md"
                      style={sub.done ? { color: "var(--text-faint)", textDecoration: "line-through" } : undefined}
                    >
                      {sub.title}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="space-y-2.5">
                <p className="ap-t-sm leading-6 text-[var(--text-faint)]">
                  还没有微步骤。直接在这里拆一版 —— 把「这件事」切成 3~5 个 5 分钟能做的小动作，启动阻力会小很多。
                </p>
                <button
                  type="button"
                  className="ap-btn"
                  disabled={breakingDown}
                  onClick={() => onBreakdown?.(current)}
                >
                  {breakingDown ? <Loader2 size={13} className="ap-spin" /> : <Sparkles size={13} />}
                  {breakingDown ? "正在拆解…" : "自动拆解"}
                </button>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                className="ap-btn ap-btn--cta"
                data-variant="primary"
                onClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  onToggle?.(current, {
                    x: (rect.left + rect.width / 2) / window.innerWidth,
                    y: (rect.top + rect.height / 2) / window.innerHeight,
                  });
                  setDismissed([]);
                }}
              >
                <Check size={16} strokeWidth={3} /> 完成了
              </button>
              <button type="button" className="ap-btn" onClick={skip}>
                <Shuffle size={14} /> 不是这个
              </button>
              {swapNote ? (
                <span className="ap-label" style={{ color: "var(--tier-high)" }}>
                  已跳过，换下一件
                </span>
              ) : null}
            </div>

            <div className="flex flex-col items-center gap-3 pt-1">
              <div className="flex rounded-[10px] border border-[var(--line)] p-0.5">
                <button
                  type="button"
                  className="ap-btn ap-btn--sm"
                  data-variant="ghost"
                  data-active={kickstart ? undefined : "true"}
                  onClick={() => switchMode(false)}
                >
                  {pomodoroMinutes} 分钟
                </button>
                <button
                  type="button"
                  className="ap-btn ap-btn--sm"
                  data-variant="ghost"
                  data-active={kickstart ? "true" : undefined}
                  onClick={() => switchMode(true)}
                >
                  <Zap size={12} /> 2 分钟启动
                </button>
              </div>

              {kickstart && timer.status === "idle" ? (
                <p className="max-w-[38ch] text-center ap-t-sm leading-6 text-[var(--text-faint)]">
                  只要做两分钟，就能战胜拖延 —— 两分钟后你可以停，也可以接着做。
                </p>
              ) : null}

              <PomodoroRing timer={timer} label={`${minutes} 分钟`} size={132} />

              {refillReady ? (
                <div className="flex flex-col items-center gap-2">
                  <p className="ap-t-sm text-[var(--tier-high)]">两分钟到了 —— 势头还在的话，接着做？</p>
                  <button type="button" className="ap-btn" data-variant="primary" onClick={refill}>
                    <Zap size={13} /> 续杯 {pomodoroMinutes} 分钟
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : tasks.length === 0 ? (
          // tasks 是待办池：空 = 全部完成，不是被跳过。两种到达路径的文案必须分开，
          // 否则用户刚清空清单，屏幕却说他「跳过了一切」。
          <div className="max-w-[380px] space-y-4 text-center">
            <Moon size={26} className="mx-auto text-[var(--text-faint)]" />
            <p className="ap-t-md">清单清空了</p>
            <p className="ap-t-sm leading-6 text-[var(--text-faint)]">
              今天想做的都做完了 —— 休息一下吧，或者回清单记下一件事。
            </p>
            <div className="flex justify-center gap-2">
              <button type="button" className="ap-btn" data-variant="primary" onClick={onExit}>
                回到清单
              </button>
            </div>
          </div>
        ) : (
          <div className="max-w-[380px] space-y-4 text-center">
            <Moon size={26} className="mx-auto text-[var(--text-faint)]" />
            <p className="ap-t-md">候选都被你跳过了</p>
            <p className="ap-t-sm leading-6 text-[var(--text-faint)]">
              这说明今天真正想做的可能不在清单里，或者现在该休息。
            </p>
            <div className="flex justify-center gap-2">
              <button type="button" className="ap-btn" onClick={reset}>
                <Shuffle size={13} /> 重新看一遍
              </button>
              <button type="button" className="ap-btn" data-variant="primary" onClick={onExit}>
                回到清单
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
