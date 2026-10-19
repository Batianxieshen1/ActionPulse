import { useEffect, useState } from "react";
import { Check, ChevronDown, ChevronRight, Play, Plus, Target, X } from "lucide-react";
import { habitsCompletion, isDoneToday, isHabitDueToday, nextUncompletedHabit } from "../domain/habits";
import type { DailyHabit, HabitSchedule } from "../domain/types";
import { useT } from "../i18n";

interface Props {
  habits: DailyHabit[];
  archived: DailyHabit[];
  today: string;
  onAdd: (title: string, emoji?: string, schedule?: HabitSchedule, scheduleDay?: number | null) => void;
  onToggle: (habit: DailyHabit) => void;
  onFocusHabit: (habit: DailyHabit) => void;
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
}

const EMOJI_PRESETS = ["⚡", "💧", "🏃", "📖", "🧘", "🌙"];
/** 0=周日 … 6=周六，与 Date#getDay 对齐。 */
const WEEKDAY_KEYS = ["weekday.0", "weekday.1", "weekday.2", "weekday.3", "weekday.4", "weekday.5", "weekday.6"] as const;

/** 全部完成之后，先让"打勾"这个动作被看见，再收拢 —— 立刻收起会有"我点的东西消失了"的失落感。 */
const COLLAPSE_DELAY_MS = 1500;

/**
 * 每日习惯（PRD-v2.1 模块一）。
 *
 * 默认**收成一行**（\`⚡ 日常 2/5\`），点开才展开药丸 —— 面板顶部已经排了脉冲线、标题、
 * 视图切换、能量槽、快速输入，手机上一行都不能多占。
 * 跨天归零是派生的（按 today 判断），这里不需要任何重置逻辑。
 */
export function HabitBar({ habits, archived, today, onAdd, onToggle, onFocusHabit, onArchive, onUnarchive }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [emoji, setEmoji] = useState(EMOJI_PRESETS[0]);
  const [schedule, setSchedule] = useState<HabitSchedule>("daily");
  const [scheduleDay, setScheduleDay] = useState<number>(() => new Date().getDay());
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const completion = habitsCompletion(habits, today);
  const allDone = completion.total > 0 && completion.done === completion.total;
  const nextHabit = nextUncompletedHabit(habits, today);

  useEffect(() => {
    if (!allDone || !open) return;
    const timer = window.setTimeout(() => setOpen(false), COLLAPSE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [allDone, open]);

  const submitHabit = () => {
    const title = draft.trim();
    if (title.length === 0) return;
    onAdd(title, emoji, schedule, schedule === "weekly" ? scheduleDay : null);
    setDraft("");
    setAdding(false);
  };

  // 没有任何活动习惯时才收成一个"添加"按钮；有周习惯但今天不到期时，
  // 仍应保留整行（0/0）让用户找得到它。
  if (habits.length === 0 && !adding && !open) {
    return (
      <button
        type="button"
        className="ap-btn"
        data-variant="ghost"
        style={{ padding: "3px 8px", fontSize: "var(--fs-xs)" }}
        onClick={() => {
          setOpen(true);
          setAdding(true);
        }}
      >
        <Plus size={12} /> {t("habit.add")}
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="ap-btn"
          data-variant="ghost"
          style={{ padding: "3px 8px", fontSize: "var(--fs-xs)" }}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          <span aria-hidden="true">{allDone ? "✅" : "⚡"}</span>
          {t("habit.row")}
          <span className="ap-mono text-[var(--text-faint)]">
            {completion.done}/{completion.total}
          </span>
        </button>
        {allDone ? (
          <span className="ap-label" style={{ color: "var(--pulse)" }}>
            {t("habit.allDone")}
          </span>
        ) : null}
        {!open ? (
          <>
            {nextHabit ? (
              <button
                type="button"
                className="ap-btn ml-auto min-w-0 max-w-full"
                data-variant="ghost"
                style={{ padding: "3px 8px", fontSize: "var(--fs-xs)" }}
                aria-label={t("habit.startFocus", { title: nextHabit.title })}
                onClick={() => onFocusHabit(nextHabit)}
              >
                <Play size={11} aria-hidden="true" />
                <span className="truncate">{nextHabit.emoji} {nextHabit.title}</span>
              </button>
            ) : null}
            <span className="ap-meter" style={{ width: 56 }} aria-hidden="true">
              <span className="ap-meter__fill" style={{ width: `${completion.percent}%` }} />
            </span>
          </>
        ) : null}
      </div>

      {open ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {habits.map((habit) => {
            const done = isDoneToday(habit, today);
            if (confirmArchiveId === habit.id) {
              return (
                <span key={habit.id} className="ap-pill" data-done={done}>
                  {t("habit.archiveAsk", { title: habit.title })}
                  <button
                    type="button"
                    className="ap-icon-btn"
                    style={{ width: 20, height: 20 }}
                    aria-label={t("habit.archiveConfirm", { title: habit.title })}
                    onClick={() => {
                      onArchive(habit.id);
                      setConfirmArchiveId(null);
                    }}
                  >
                    <Check size={11} />
                  </button>
                  <button
                    type="button"
                    className="ap-icon-btn"
                    style={{ width: 20, height: 20 }}
                    aria-label={t("habit.unarchive")}
                    onClick={() => setConfirmArchiveId(null)}
                  >
                    <X size={11} />
                  </button>
                </span>
              );
            }
            return (
              <span key={habit.id} className="ap-pill" data-done={done} data-off={isHabitDueToday(habit, today) ? undefined : "true"} title={isHabitDueToday(habit, today) ? undefined : t("habit.notToday")}>
                <button
                  type="button"
                  className="flex items-center gap-1.5"
                  aria-pressed={done}
                  aria-label={t(done ? "habit.toggleUndo" : "habit.toggleDone", { title: habit.title })}
                  onClick={() => onToggle(habit)}
                >
                  <span aria-hidden="true">{habit.emoji}</span>
                  {habit.title}
                  {habit.schedule !== "daily" ? (
                    <span className="ap-label">
                      {habit.schedule === "weekdays"
                        ? t("habit.scheduleWeekdays")
                        : t(WEEKDAY_KEYS[habit.scheduleDay ?? 0])}
                    </span>
                  ) : null}
                </button>
                {!done ? (
                  <button
                    type="button"
                    className="ap-icon-btn"
                    style={{ width: 20, height: 20 }}
                    aria-label={t("habit.focusRitual", { title: habit.title })}
                    title={t("habit.focusRitual", { title: habit.title })}
                    onClick={() => onFocusHabit(habit)}
                  >
                    <Target size={12} />
                  </button>
                ) : (
                  <span className="ap-label" aria-label={t("habit.doneTodayTitle", { title: habit.title })}>{t("habit.doneLabel")}</span>
                )}
                <button
                  type="button"
                  className="ap-icon-btn"
                  style={{ width: 18, height: 18, marginRight: -4 }}
                  aria-label={t("habit.archiveShort", { title: habit.title })}
                  onClick={() => setConfirmArchiveId(habit.id)}
                >
                  <X size={10} />
                </button>
              </span>
            );
          })}

          {adding ? (
            <span className="ap-pill-form">
              <select
                className="ap-select"
                style={{ padding: "1px 4px", fontSize: "var(--fs-sm)", border: "none", background: "transparent" }}
                value={emoji}
                onChange={(event) => setEmoji(event.target.value)}
                aria-label={t("habit.emoji")}
              >
                {EMOJI_PRESETS.map((preset) => (
                  <option key={preset} value={preset}>
                    {preset}
                  </option>
                ))}
              </select>
              <input
                className="ap-pill-input"
                autoFocus
                placeholder={t("habit.titlePlaceholder")}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    submitHabit();
                  }
                  if (event.key === "Escape") {
                    setDraft("");
                    setAdding(false);
                  }
                }}
              />
              {/* 日程：每天 / 工作日 / 每周某天。规则派生，不生成任务实例。 */}
              <select
                className="ap-select"
                style={{ padding: "1px 4px", fontSize: "var(--fs-sm)", border: "none", background: "transparent" }}
                value={schedule}
                onChange={(event) => setSchedule(event.target.value as HabitSchedule)}
                aria-label={t("habit.schedule")}
              >
                <option value="daily">{t("habit.scheduleDaily")}</option>
                <option value="weekdays">{t("habit.scheduleWeekdays")}</option>
                <option value="weekly">{t("habit.scheduleWeekly")}</option>
              </select>
              {schedule === "weekly" ? (
                <select
                  className="ap-select"
                  style={{ padding: "1px 4px", fontSize: "var(--fs-sm)", border: "none", background: "transparent" }}
                  value={scheduleDay}
                  onChange={(event) => setScheduleDay(Number(event.target.value))}
                  aria-label={t("habit.scheduleDay")}
                >
                  {WEEKDAY_KEYS.map((key, day) => (
                    <option key={key} value={day}>
                      {t(key)}
                    </option>
                  ))}
                </select>
              ) : null}
              <button type="button" className="ap-icon-btn" style={{ width: 20, height: 20 }} aria-label={t("habit.addConfirm")} onClick={submitHabit}>
                <Check size={12} />
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="ap-pill"
              onClick={() => setAdding(true)}
              aria-label={t("habit.add")}
            >
              <Plus size={11} /> {t("habit.addShort")}
            </button>
          )}

          {archived.length > 0 ? (
            <button
              type="button"
              className="ap-btn"
              data-variant="ghost"
              style={{ padding: "3px 6px", fontSize: "var(--fs-2xs)" }}
              onClick={() => setShowArchived((value) => !value)}
            >
              {t("habit.archived")} {archived.length}
            </button>
          ) : null}
        </div>
      ) : null}

      {open && showArchived && archived.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {archived.map((habit) => (
            <span key={habit.id} className="ap-pill" style={{ opacity: 0.6 }}>
              <span aria-hidden="true">{habit.emoji}</span>
              {habit.title}
              <button
                type="button"
                className="ap-btn"
                data-variant="ghost"
                style={{ padding: "1px 5px", fontSize: "var(--fs-2xs)" }}
                onClick={() => onUnarchive(habit.id)}
              >
                {t("habit.restore")}
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
