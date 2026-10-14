import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { breakdownWithFallback } from "./domain/aiBreakdown";
import { streakDays } from "./domain/streak";
import type { AppState, DailyHabit, Quadrant, Settings, Task } from "./domain/types";
import { playTimerEnd } from "./feedback/chime";
import { vibrate } from "./feedback/haptics";
import { useActionPulse } from "./hooks/useActionPulse";
import { useLlmConfig } from "./hooks/useLlmConfig";
import { useMediaQuery } from "./hooks/useMediaQuery";
import { useTheme } from "./hooks/useTheme";
import { useSync } from "./hooks/useSync";
import { activeHabitList, archivedHabitList, completedToday, quadrantBuckets } from "./store/taskStore";
import { pickBlindBox } from "./domain/pick";
import { isDoneToday } from "./domain/habits";
import { requestAiSteps } from "./sync/ai";
import type { SyncConfig } from "./sync/session";
import { buildDebrief } from "./domain/debrief";
import { CompletedSection } from "./ui/CompletedSection";
import { DebriefSheet } from "./ui/DebriefSheet";
import { DormantSection } from "./ui/DormantSection";
import { EdgeTab } from "./ui/EdgeTab";
import { EnergyBar } from "./ui/EnergyBar";
import { HabitBar } from "./ui/HabitBar";
import { FocusStage } from "./ui/FocusStage";
import { Header, type ViewMode } from "./ui/Header";
import { IdleStage } from "./ui/IdleStage";
import { QuadrantBoard } from "./ui/QuadrantBoard";
import { QuickAdd } from "./ui/QuickAdd";
import { SettingsSheet } from "./ui/SettingsSheet";
import { TaskList } from "./ui/TaskList";
import { ToastStack } from "./ui/ToastStack";

const SYNC_TITLE: Record<string, string> = {
  idle: "未连接同步服务（点击查看设置）",
  connecting: "正在与本地服务同步…",
  online: "已连接本地服务，点击立即同步",
  offline: "同步服务未响应（电脑可能已休眠），本地照常可用。点击查看设置",
  unauthorized: "token 无效，点击重新配对",
  error: "同步出错，点击查看设置",
};

type FocusIntent =
  | { kind: "task"; pinnedTaskId: string | null }
  | { kind: "habit"; habitId: string };

export default function App() {
  const {
    state,
    today,
    dispatch,
    beat,
    toasts,
    dismissToast,
    pushToast,
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
    ordered,
    dormant,
    currentFocus,
    energySnapshot,
    reduceMotion,
  } = useActionPulse();

  const [view, setView] = useState<ViewMode>("list");
  const [panelOpen, setPanelOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [focusIntent, setFocusIntent] = useState<FocusIntent | null>(null);
  const [breakingDownId, setBreakingDownId] = useState<string | null>(null);
  const [debriefOpen, setDebriefOpen] = useState(false);
  const [clearBannerDismissed, setClearBannerDismissed] = useState(false);

  // 主题：只负责运行期切换与系统主题变化；首屏由 index.html 的内联脚本兜住（避免 FOUC）
  useTheme(state.settings.theme);

  const isDesktop = useMediaQuery("(min-width: 769px)");
  const pinned = state.settings.panelPinned;
  const manual = state.settings.priorityMode === "manual";

  /* ------------------------------- 同步编排 ------------------------------- */
  // 远端数据交给 reducer，在 dispatch 时刻的"当前状态"上合并；
  // 如果这边先覆盖成快照，用户在拉取途中新增的任务就会被吞掉。
  const applyRemote = useCallback(
    (remote: AppState) => dispatch({ type: "state/merge", state: remote }),
    [dispatch],
  );
  const sync = useSync({ state, enabled: true, applyRemote });
  const llm = useLlmConfig(sync.config);

  const aiUsable = Boolean(sync.config) && sync.status !== "unauthorized" && llm.info?.configured === true;

  const handleBreakdown = useCallback(
    async (task: Task) => {
      if (breakingDownId !== null) return;
      const config: SyncConfig | null = sync.config;
      const useAi = state.settings.aiBreakdown && aiUsable && config !== null;

      setBreakingDownId(task.id);
      try {
        const outcome = await breakdownWithFallback({
          title: task.title,
          notes: task.notes,
          aiEnabled: useAi,
          request: (title, notes) => requestAiSteps(config as SyncConfig, title, notes),
        });
        dispatch({ type: "subtask/set", taskId: task.id, titles: outcome.steps });
        if (outcome.source === "ai") {
          pushToast(`AI 拆解出 ${outcome.steps.length} 步`, "hot");
        } else if (outcome.error) {
          pushToast("AI 不可用，已用离线模板拆解", "info");
        }
      } finally {
        setBreakingDownId(null);
      }
    },
    [breakingDownId, state.settings.aiBreakdown, aiUsable, sync.config, dispatch, pushToast],
  );

  /* -------------------------------- 派生数据 ------------------------------- */
  const buckets = useMemo(() => quadrantBuckets(state), [state]);
  const completed = useMemo(() => completedToday(state, today), [state, today]);
  const debriefStats = useMemo(() => buildDebrief(state, today), [state, today]);
  const allClear = energySnapshot.total > 0 && energySnapshot.done === energySnapshot.total;
  const activeHabitsOfApp = useMemo(() => activeHabitList(state), [state]);
  const archivedHabits = useMemo(() => archivedHabitList(state), [state]);
  const streak = useMemo(() => streakDays(state.stats.completionDates, today), [state.stats.completionDates, today]);

  const patchSettings = useCallback(
    (patch: Partial<Settings>) => dispatch({ type: "settings/patch", patch }),
    [dispatch],
  );

  const setSubtasks = useCallback(
    (task: Task, titles: string[]) => dispatch({ type: "subtask/set", taskId: task.id, titles }),
    [dispatch],
  );

  const setQuadrant = useCallback(
    (id: string, quadrant: Quadrant | null) => dispatch({ type: "task/update", id, patch: { quadrant } }),
    [dispatch],
  );

  const handleTimerFinish = useCallback(() => {
    if (state.settings.soundEnabled) playTimerEnd(state.settings.soundVolume);
    if (state.settings.vibrationEnabled) vibrate("warn");
    pushToast("番茄钟结束，起来动一下", "hot");
  }, [state.settings, pushToast]);

  const focusHabit = useCallback((habit: DailyHabit) => {
    if (habit.archived || isDoneToday(habit, today)) return;
    setFocusIntent({ kind: "habit", habitId: habit.id });
  }, [today]);

  const enterFocus = useCallback(() => {
    if (!currentFocus) {
      pushToast("清单是空的，先加一件事", "info");
      return;
    }
    setFocusIntent({ kind: "task", pinnedTaskId: null }); // 手动进入聚焦 = 回到系统排的第一名
  }, [currentFocus, pushToast]);

  const exitFocus = useCallback(() => {
    setFocusIntent(null);
  }, []);

  /** 🎲 盲盒决策：按紧迫度加权从 Top 3 里掷一个，直接推进聚焦。 */
  const rollDice = useCallback(() => {
    const picked = pickBlindBox(ordered, today, Math.random);
    if (!picked) {
      pushToast("清单是空的，先加一件事", "info");
      return;
    }
    setFocusIntent({ kind: "task", pinnedTaskId: picked.id });
    pushToast("别犹豫，就做这一个", "hot");
  }, [ordered, today, pushToast]);

  const recordFocusMinutes = useCallback(
    (minutes: number) => dispatch({ type: "metrics/recordFocus", minutes, now: Date.now() }),
    [dispatch],
  );

  const focusedHabit =
    focusIntent?.kind === "habit"
      ? state.habits.find((habit) => habit.id === focusIntent.habitId && !habit.archived) ?? null
      : null;

  /* ------------------------------- 快捷键 -------------------------------- */
  // 规范里提到 Space，但它会和输入框冲突，因此只保留 Alt 组合键。
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSettingsOpen(false);
        setFocusIntent(null);
        setDebriefOpen(false);
        return;
      }
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const key = event.key.toLowerCase();
      if (key === "s") {
        event.preventDefault();
        setPanelOpen((value) => !value);
      } else if (key === "f") {
        event.preventDefault();
        if (focusIntent) exitFocus();
        else enterFocus();
      } else if (key === "n") {
        event.preventDefault();
        setPanelOpen(true);
        const input = document.querySelector<HTMLInputElement>("input[aria-label='新任务标题']");
        input?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusIntent, exitFocus, enterFocus]);

  // 切到抽屉模式时确保面板可见，否则用户会以为应用坏了
  useEffect(() => {
    if (!pinned) setPanelOpen(true);
  }, [pinned]);

  // 同步状态变化时提示一次，避免用户不知道"刚才没同步上"
  const lastStatusRef = useRef<string>("idle");
  useEffect(() => {
    const previous = lastStatusRef.current;
    lastStatusRef.current = sync.status;
    if (previous === sync.status) return;
    if (sync.status === "offline" && sync.config) pushToast("同步服务未响应，已切回纯本地模式", "info");
    if (sync.status === "unauthorized") pushToast("同步 token 无效，请重新配对", "hot");
  }, [sync.status, sync.config, pushToast]);

  const upcoming = ordered.slice(1, 4);

  return (
    <div className="ap-shell" data-reduce-motion={reduceMotion ? "true" : undefined}>
      <aside className="ap-panel" data-pinned={pinned ? "true" : "false"} data-open={panelOpen ? "true" : "false"}>
        <Header
          beat={beat}
          syncStatus={sync.config ? sync.status : "idle"}
          syncTitle={sync.config ? (SYNC_TITLE[sync.status] ?? "同步状态") : "未连接同步服务（点击查看设置）"}
          onSyncClick={() => {
            if (sync.config && sync.status !== "unauthorized") sync.syncNow();
            else setSettingsOpen(true);
          }}
          view={view}
          mode={state.settings.priorityMode}
          pinned={pinned}
          canPin={isDesktop}
          onViewChange={setView}
          onModeChange={(mode) => patchSettings({ priorityMode: mode })}
          onTogglePin={() => patchSettings({ panelPinned: !pinned })}
          onHide={() => setPanelOpen(false)}
          onOpenSettings={() => setSettingsOpen(true)}
          onEnterFocus={enterFocus}
          onRollDice={rollDice}
          canRollDice={ordered.length > 0}
          hasFocus={currentFocus !== null}
        />

        <div className="shrink-0 space-y-3 border-b border-[var(--line)] px-4 py-3">
          <EnergyBar
            done={energySnapshot.done}
            total={energySnapshot.total}
            percent={energySnapshot.percent}
            combo={state.stats.combo}
            streak={streak}
            onOpenDebrief={() => setDebriefOpen(true)}
          />
          <HabitBar
            habits={activeHabitsOfApp}
            archived={archivedHabits}
            today={today}
            onAdd={addHabit}
            onToggle={toggleHabit}
            onFocusHabit={focusHabit}
            onArchive={archiveHabit}
            onUnarchive={unarchiveHabit}
          />
        </div>

        <div className="ap-scroll flex-1 space-y-3 px-4 pt-3 pb-8">
          <QuickAdd onAdd={addTask} />

          {/* 清空时只给一条非阻塞提示，绝不自动弹全屏弹层 */}
          {allClear && !clearBannerDismissed ? (
            <div className="ap-card ap-reveal flex items-center gap-2 px-3 py-2">
              <span aria-hidden="true">🏆</span>
              <span className="min-w-0 flex-1 text-[12px]">今日全部清空，战报已生成</span>
              <button type="button" className="ap-btn" style={{ padding: "2px 9px", fontSize: 11 }} onClick={() => setDebriefOpen(true)}>
                查看
              </button>
              <button
                type="button"
                className="ap-icon-btn"
                style={{ width: 24, height: 24 }}
                aria-label="不再提示"
                onClick={() => setClearBannerDismissed(true)}
              >
                ×
              </button>
            </div>
          ) : null}

          {view === "board" || manual ? (
            <QuadrantBoard
              buckets={buckets}
              today={today}
              onToggle={toggleTask}
              onToggleSubtask={toggleSubtask}
              onSetSubtasks={setSubtasks}
              onBreakdown={handleBreakdown}
              breakingDownId={breakingDownId}
              onUpdate={updateTask}
              onRemove={removeTask}
              onSetQuadrant={setQuadrant}
            />
          ) : (
            <TaskList
              tasks={ordered}
              today={today}
              manual={false}
              onToggle={toggleTask}
              onToggleSubtask={toggleSubtask}
              onSetSubtasks={setSubtasks}
              onBreakdown={handleBreakdown}
              breakingDownId={breakingDownId}
              onUpdate={updateTask}
              onRemove={removeTask}
              onMove={moveTask}
            />
          )}

          <CompletedSection
            tasks={completed}
            onToggle={toggleTask}
            onArchiveAll={() => dispatch({ type: "task/archiveCompleted" })}
            reduceMotion={reduceMotion}
          />

          <DormantSection
            tasks={dormant}
            now={Date.now()}
            onWake={(id) => dispatch({ type: "task/wake", id })}
            onSetDue={(id, due) => updateTask(id, { due })}
            onRemove={removeTask}
          />

          <p className="pt-2 text-center text-[10.5px] leading-5 text-[var(--text-faint)]">
            Alt+S 收起面板 · Alt+F 聚焦 · Alt+N 记一笔
            <br />
            {sync.config
              ? "已连接本地服务，改动会实时同步到其他设备"
              : "数据仅存于本机浏览器，记得偶尔导出备份"}
          </p>
        </div>
      </aside>

      {isDesktop ? (
        <main className="ap-stage">
          <IdleStage
            focus={currentFocus}
            upcoming={upcoming}
            today={today}
            beat={beat}
            energy={energySnapshot}
            streak={streak}
            combo={state.stats.combo}
            totalCompleted={state.stats.totalCompleted}
            onEnterFocus={enterFocus}
            onToggle={toggleTask}
          />
        </main>
      ) : null}

      <EdgeTab hidden={!isDesktop || panelOpen} pendingCount={ordered.length} onOpen={() => setPanelOpen(true)} />

      {focusIntent?.kind === "task" ? (
        <FocusStage
          kind="task"
          tasks={ordered}
          today={today}
          pomodoroMinutes={state.settings.pomodoroMinutes}
          pinnedId={focusIntent.pinnedTaskId}
          onToggle={toggleTask}
          onToggleSubtask={toggleSubtask}
          onBreakdown={handleBreakdown}
          breakingDown={breakingDownId !== null}
          onExit={exitFocus}
          onTimerFinish={handleTimerFinish}
          onFocusMinutes={recordFocusMinutes}
        />
      ) : focusIntent?.kind === "habit" ? (
        <FocusStage
          kind="habit"
          habit={focusedHabit}
          todayDone={focusedHabit ? isDoneToday(focusedHabit, today) : false}
          today={today}
          pomodoroMinutes={state.settings.pomodoroMinutes}
          onCompleteHabit={(id) => {
            const habit = state.habits.find((item) => item.id === id);
            if (habit) completeHabit(habit);
          }}
          onExit={exitFocus}
          onTimerFinish={handleTimerFinish}
          onFocusMinutes={recordFocusMinutes}
        />
      ) : null}

      {debriefOpen ? <DebriefSheet stats={debriefStats} onClose={() => setDebriefOpen(false)} /> : null}

      {settingsOpen ? (
        <SettingsSheet
          state={state}
          onPatch={patchSettings}
          onImport={(next) => dispatch({ type: "state/import", state: next })}
          onReset={() => dispatch({ type: "state/reset" })}
          onClose={() => setSettingsOpen(false)}
          sync={sync}
          llm={llm}
        />
      ) : null}

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
