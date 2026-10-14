import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { breakdownWithFallback } from "./domain/aiBreakdown";
import { streakDays } from "./domain/streak";
import type { AppState, DailyHabit, Quadrant, Settings, Task } from "./domain/types";
import { playChime, playTimerEnd } from "./feedback/chime";
import { celebrateSmall } from "./feedback/confetti";
import { vibrate } from "./feedback/haptics";
import { useActionPulse } from "./hooks/useActionPulse";
import { useLlmConfig } from "./hooks/useLlmConfig";
import { useMediaQuery } from "./hooks/useMediaQuery";
import { usePwaInstall } from "./hooks/usePwaInstall";
import { useSwUpdate } from "./hooks/useSwUpdate";
import { setLanguage, tr, useT, type TKey } from "./i18n";
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
import { MiniStage } from "./ui/MiniStage";
import { QuadrantBoard } from "./ui/QuadrantBoard";
import { QuickAdd } from "./ui/QuickAdd";
import { SettingsSheet } from "./ui/SettingsSheet";
import { TaskList } from "./ui/TaskList";
import { ToastStack } from "./ui/ToastStack";

type FocusIntent =
  | { kind: "task"; pinnedTaskId: string | null }
  | { kind: "habit"; habitId: string };

/** 同步状态的悬停说明。sync.* 键与 SyncStatus 的六种取值一一对应。 */
function syncTitleOf(status: string): string {
  return tr(`sync.${status}` as TKey);
}

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

  // PWA：安装时机（Chromium 满足条件才会触发）与 SW 更新感知
  const pwa = usePwaInstall();
  const swUpdate = useSwUpdate();

  // 主题：只负责运行期切换与系统主题变化；首屏由 index.html 的内联脚本兜住（避免 FOUC）
  useTheme(state.settings.theme);

  // 界面语言：模块级状态，驱动所有 useT 组件与 tr() 调用（语录、hook toast）
  useEffect(() => {
    setLanguage(state.settings.language);
  }, [state.settings.language]);
  const t = useT();

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
          pushToast(tr("toast.aiSteps", { n: outcome.steps.length }), "hot");
        } else if (outcome.error) {
          pushToast(tr("toast.aiFallback"), "info");
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
    pushToast(tr("toast.pomodoroEnd"), "hot");
  }, [state.settings, pushToast]);

  const focusHabit = useCallback((habit: DailyHabit) => {
    if (habit.archived || isDoneToday(habit, today)) return;
    setFocusIntent({ kind: "habit", habitId: habit.id });
  }, [today]);

  const enterFocus = useCallback(() => {
    if (!currentFocus) {
      pushToast(tr("toast.emptyFirst"), "info");
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
      pushToast(tr("toast.emptyFirst"), "info");
      return;
    }
    setFocusIntent({ kind: "task", pinnedTaskId: picked.id });
    pushToast(tr("toast.dice"), "hot");
  }, [ordered, today, pushToast]);

  const recordFocusMinutes = useCallback(
    (minutes: number) => dispatch({ type: "metrics/recordFocus", minutes, now: Date.now() }),
    [dispatch],
  );

  /** 空态示例卡的正反馈：复用真实打勾的完整反馈链，但不写入任何数据。 */
  const demoCelebrate = useCallback(
    (origin: { x: number; y: number }) => {
      if (state.settings.soundEnabled) playChime(state.settings.soundVolume, 1);
      if (state.settings.vibrationEnabled) vibrate("complete");
      if (state.settings.confettiEnabled && !reduceMotion) void celebrateSmall(origin);
      pushToast(tr("toast.demoFeedback"), "hot");
    },
    [state.settings, reduceMotion, pushToast],
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
    if (sync.status === "offline" && sync.config) pushToast(tr("toast.offline"), "info");
    if (sync.status === "unauthorized") pushToast(tr("toast.unauthorized"), "hot");
  }, [sync.status, sync.config, pushToast]);

  const upcoming = ordered.slice(1, 4);

  return (
    <div className="ap-shell" data-reduce-motion={reduceMotion ? "true" : undefined}>
      <aside className="ap-panel" data-pinned={pinned ? "true" : "false"} data-open={panelOpen ? "true" : "false"}>
        <Header
          beat={beat}
          syncStatus={sync.config ? sync.status : "idle"}
          syncTitle={sync.config ? syncTitleOf(sync.status) : tr("sync.idle")}
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

        {/* 窄布局（手机 / 停靠窗）的「现在只做这件事」：桌面宽布局由右侧 IdleStage 承担 */}
        {!isDesktop && currentFocus ? (
          <MiniStage focus={currentFocus} today={today} percent={energySnapshot.percent} onEnterFocus={enterFocus} />
        ) : null}

        <div className="ap-scroll flex-1 space-y-3 px-4 pt-3 pb-8">
          <QuickAdd onAdd={addTask} />

          {/* 清空时只给一条非阻塞提示，绝不自动弹全屏弹层 */}
          {allClear && !clearBannerDismissed ? (
            <div className="ap-card ap-reveal flex items-center gap-2 px-3 py-2">
              <span aria-hidden="true">🏆</span>
              <span className="min-w-0 flex-1 ap-t-sm">{t("app.bannerClear")}</span>
              <button type="button" className="ap-btn" style={{ padding: "2px 9px", fontSize: "var(--fs-xs)" }} onClick={() => setDebriefOpen(true)}>
                {t("app.view")}
              </button>
              <button
                type="button"
                className="ap-icon-btn"
                style={{ width: 24, height: 24 }}
                aria-label={t("app.dismiss")}
                onClick={() => setClearBannerDismissed(true)}
              >
                ×
              </button>
            </div>
          ) : null}

          {/* PWA 安装提示：只有浏览器主动给出安装时机才显示，绝不硬推 */}
          {pwa.canInstall ? (
            <div className="ap-card ap-reveal flex items-center gap-2 px-3 py-2">
              <span aria-hidden="true">📲</span>
              <span className="min-w-0 flex-1 ap-t-sm">{t("app.bannerInstall")}</span>
              <button
                type="button"
                className="ap-btn"
                style={{ padding: "2px 9px", fontSize: "var(--fs-xs)" }}
                onClick={() => void pwa.promptInstall()}
              >
                {t("app.install")}
              </button>
              <button
                type="button"
                className="ap-icon-btn"
                style={{ width: 24, height: 24 }}
                aria-label={t("app.dismiss")}
                onClick={pwa.dismiss}
              >
                ×
              </button>
            </div>
          ) : null}

          {/* 新版就绪：页面在前台时让用户自己刷新，不打断输入 */}
          {swUpdate.updateReady ? (
            <div className="ap-card ap-reveal flex items-center gap-2 px-3 py-2">
              <span aria-hidden="true">✨</span>
              <span className="min-w-0 flex-1 ap-t-sm">{t("app.bannerUpdate")}</span>
              <button
                type="button"
                className="ap-btn"
                style={{ padding: "2px 9px", fontSize: "var(--fs-xs)" }}
                onClick={swUpdate.applyUpdate}
              >
                {t("app.refresh")}
              </button>
              <button
                type="button"
                className="ap-icon-btn"
                style={{ width: 24, height: 24 }}
                aria-label={t("app.later")}
                onClick={swUpdate.dismiss}
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
              showDemo={state.stats.totalCompleted < 3}
              onDemoToggle={demoCelebrate}
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

          <p className="pt-2 text-center ap-t-2xs leading-5 text-[var(--text-faint)]">
            {t("app.footerShortcuts")}
            <br />
            {sync.config ? t("app.footerSynced") : t("app.footerLocal")}
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
            onFocusTask={(taskId) => setFocusIntent({ kind: "task", pinnedTaskId: taskId })}
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
