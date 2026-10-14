import { useState } from "react";
import { ChevronDown, ChevronRight, GripVertical, Trash2 } from "lucide-react";
import { daysBetween } from "../domain/dates";
import type { Importance, Quadrant, Task } from "../domain/types";
import { tr, useT } from "../i18n";
import { MicroStepList } from "./MicroStepList";
import { ScoreBreakdown } from "./ScoreBreakdown";
import { TaskCheck } from "./TaskCheck";
import { UrgencyBadge } from "./UrgencyBadge";

interface DueInfo {
  text: string;
  tone?: "danger" | "warn" | "today";
}

function dueLabel(due: string | null, today: string): DueInfo | null {
  if (!due) return null;
  const diff = daysBetween(today, due);
  if (diff < 0) return { text: tr("card.overdue", { n: -diff }), tone: "danger" };
  if (diff === 0) return { text: tr("card.dueToday"), tone: "today" };
  if (diff === 1) return { text: tr("card.dueTomorrow"), tone: "warn" };
  if (diff <= 3) return { text: tr("card.dueIn", { n: diff }), tone: "warn" };
  return { text: tr("card.dueOn", { date: due.slice(5) }) };
}

function estimateLabel(minutes: number | null): string | null {
  if (minutes === null) return null;
  if (minutes < 60) return `${minutes} ${tr("common.minute")}`;
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours} ${tr("common.hour")}` : `${hours.toFixed(1)} ${tr("common.hour")}`;
}

export interface TaskCardProps {
  task: Task;
  /** 自动模式下的紧迫度分；手动模式下为 null。 */
  score: number | null;
  rank: number;
  index: number;
  total: number;
  today: string;
  manual: boolean;
  dragging: boolean;
  onToggle: (task: Task, origin?: { x: number; y: number }) => void;
  onToggleSubtask: (task: Task, subId: string) => void;
  onSetSubtasks: (task: Task, titles: string[]) => void;
  onBreakdown: (task: Task) => void;
  breakingDown: boolean;
  onUpdate: (id: string, patch: Partial<Task>) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, toIndex: number) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOverCard: () => void;
  onDropCard: () => void;
}

export function TaskCard({
  task,
  score,
  rank,
  index,
  total,
  today,
  manual,
  dragging,
  onToggle,
  onToggleSubtask,
  onSetSubtasks,
  onBreakdown,
  breakingDown,
  onUpdate,
  onRemove,
  onMove,
  onDragStart,
  onDragEnd,
  onDragOverCard,
  onDropCard,
}: TaskCardProps) {
  const t = useT();
  const importanceLabel: Record<Importance, string> = {
    high: t("card.impHigh"),
    medium: t("card.impMed"),
    low: t("card.impLow"),
  };
  const quadrantLabel: Record<Quadrant, string> = {
    q1: t("quad.q1"),
    q2: t("quad.q2"),
    q3: t("quad.q3"),
    q4: t("quad.q4"),
  };
  const [open, setOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(task.title);

  const due = dueLabel(task.due, today);
  const estimate = estimateLabel(task.estimateMinutes);
  const subTotal = task.subtasks.length;
  const subDone = task.subtasks.filter((sub) => sub.done).length;

  const commitTitle = () => {
    const next = titleDraft.trim();
    setEditing(false);
    if (next.length === 0) {
      setTitleDraft(task.title);
      return;
    }
    if (next !== task.title) onUpdate(task.id, { title: next });
  };

  return (
    <article
      className="ap-card ap-reveal px-3 py-2.5"
      data-rank={rank === 0 && !manual ? 0 : undefined}
      data-dragging={dragging ? "true" : undefined}
      // stagger 入场：前几张卡依次晚 30ms（封顶 5 张）。
      // reduce-motion 下动画时长已被压平，但 delay 未清零——由 CSS 的
      // reduce-motion 块统一把 animation-delay 也归零兜底。
      style={{ animationDelay: `${Math.min(index, 5) * 30}ms` }}
      onDragOver={(event) => {
        if (!manual) return;
        event.preventDefault();
        onDragOverCard();
      }}
      onDrop={(event) => {
        if (!manual) return;
        event.preventDefault();
        onDropCard();
      }}
    >
      <div className="flex items-start gap-2.5">
        {manual ? (
          <span
            className="ap-card__grip mt-1.5"
            draggable
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", task.id);
              onDragStart();
            }}
            onDragEnd={onDragEnd}
            role="button"
            tabIndex={-1}
            aria-label={t("card.grip")}
            title={t("card.grip")}
          >
            <GripVertical size={14} />
          </span>
        ) : null}

        <div className="pt-0.5">
          <TaskCheck
            checked={task.done}
            label={task.done ? t("check.undo", { title: task.title }) : t("check.complete", { title: task.title })}
            onToggle={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              onToggle(task, {
                x: (rect.left + rect.width / 2) / window.innerWidth,
                y: (rect.top + rect.height / 2) / window.innerHeight,
              });
            }}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            {editing ? (
              <input
                className="ap-input"
                style={{ padding: "3px 7px", fontSize: "var(--fs-base)" }}
                autoFocus
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                onBlur={commitTitle}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commitTitle();
                  if (event.key === "Escape") {
                    setTitleDraft(task.title);
                    setEditing(false);
                  }
                }}
              />
            ) : (
              <button
                type="button"
                className="ap-card__title flex-1 cursor-text text-left ap-t-base leading-6 font-medium"
                title={t("card.editTitle")}
                onClick={() => {
                  setTitleDraft(task.title);
                  setEditing(true);
                }}
              >
                {task.title}
              </button>
            )}

            {score !== null ? <UrgencyBadge score={score} /> : null}

            <button
              type="button"
              className="ap-icon-btn"
              style={{ width: 26, height: 26 }}
              aria-expanded={open}
              aria-label={open ? t("card.collapse") : t("card.expand")}
              onClick={() => setOpen((value) => !value)}
            >
              {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          </div>

          {(due || estimate || subTotal > 0 || manual) && !open ? (
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {due ? <span className="ap-chip" data-tone={due.tone}>{due.text}</span> : null}
              {estimate ? (
                <span className="ap-chip">
                  {estimate}
                </span>
              ) : null}
              {subTotal > 0 ? (
                <span className="ap-chip" data-tone={subDone === subTotal ? "today" : undefined}>
                  {t("card.microsteps", { done: subDone, total: subTotal })}
                </span>
              ) : null}
              {manual && task.quadrant ? <span className="ap-chip">{quadrantLabel[task.quadrant]}</span> : null}
            </div>
          ) : null}

          {open ? (
            <div className="mt-2 space-y-2.5">
              {score !== null ? <ScoreBreakdown task={task} today={today} score={score} /> : null}

              <MicroStepList
                task={task}
                onToggleSubtask={(subId) => onToggleSubtask(task, subId)}
                onSetSubtasks={(titles) => onSetSubtasks(task, titles)}
                onBreakdown={() => onBreakdown(task)}
                breakingDown={breakingDown}
              />

              <div className="grid grid-cols-3 gap-2">
                <label className="space-y-1">
                  <span className="ap-label block">{t("card.impLabel")}</span>
                  <select
                    className="ap-select w-full"
                    value={task.importance}
                    onChange={(event) => onUpdate(task.id, { importance: event.target.value as Importance })}
                  >
                    <option value="high">{t("card.impHigh")}（{importanceLabel.high}）</option>
                    <option value="medium">{t("card.impMed")}（{importanceLabel.medium}）</option>
                    <option value="low">{t("card.impLow")}（{importanceLabel.low}）</option>
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="ap-label block">{t("card.dueLabel")}</span>
                  <input
                    type="date"
                    className="ap-input"
                    style={{ padding: "5px 7px", fontSize: "var(--fs-sm)" }}
                    value={task.due ?? ""}
                    onChange={(event) => onUpdate(task.id, { due: event.target.value || null })}
                  />
                </label>

                <label className="space-y-1">
                  <span className="ap-label block">{t("card.estimateLabel")}</span>
                  <input
                    type="number"
                    min={0}
                    step={5}
                    className="ap-input ap-mono"
                    style={{ padding: "5px 7px", fontSize: "var(--fs-sm)" }}
                    value={task.estimateMinutes ?? ""}
                    placeholder={t("card.estimatePlaceholder")}
                    onChange={(event) => {
                      const raw = event.target.value;
                      onUpdate(task.id, { estimateMinutes: raw === "" ? null : Math.max(0, Number(raw)) });
                    }}
                  />
                </label>
              </div>

              {manual ? (
                <label className="block space-y-1">
                  <span className="ap-label block">{t("header.board")}</span>
                  <select
                    className="ap-select w-full"
                    value={task.quadrant ?? ""}
                    onChange={(event) =>
                      onUpdate(task.id, { quadrant: (event.target.value || null) as Quadrant | null })
                    }
                  >
                    <option value="">{t("card.unclassifiedOption")}</option>
                    <option value="q1">{quadrantLabel.q1}</option>
                    <option value="q2">{quadrantLabel.q2}</option>
                    <option value="q3">{quadrantLabel.q3}</option>
                    <option value="q4">{quadrantLabel.q4}</option>
                  </select>
                </label>
              ) : null}

              <label className="block space-y-1">
                <span className="ap-label block">{t("card.notesLabel")}</span>
                <textarea
                  className="ap-input"
                  rows={2}
                  style={{ fontSize: "var(--fs-sm)", resize: "vertical" }}
                  placeholder={t("misc.notesPlaceholder")}
                  value={task.notes}
                  onChange={(event) => onUpdate(task.id, { notes: event.target.value })}
                />
              </label>

              <div className="flex items-center justify-between gap-2 pt-0.5">
                <div className="flex items-center gap-1">
                  {manual ? (
                    <>
                      <button
                        type="button"
                        className="ap-btn"
                        style={{ padding: "3px 9px", fontSize: "var(--fs-xs)" }}
                        disabled={index === 0}
                        onClick={() => onMove(task.id, index - 1)}
                      >
                        {t("card.moveUp")}
                      </button>
                      <button
                        type="button"
                        className="ap-btn"
                        style={{ padding: "3px 9px", fontSize: "var(--fs-xs)" }}
                        disabled={index === total - 1}
                        onClick={() => onMove(task.id, index + 1)}
                      >
                        {t("card.moveDown")}
                      </button>
                    </>
                  ) : null}
                </div>

                {confirmRemove ? (
                  <div className="flex items-center gap-1.5">
                    <span className="ap-t-xs text-[var(--text-dim)]">{t("card.deleteShort")}</span>
                    <button
                      type="button"
                      className="ap-btn"
                      style={{ padding: "3px 9px", fontSize: "var(--fs-xs)", color: "var(--tier-critical)" }}
                      onClick={() => onRemove(task.id)}
                    >
                      {t("card.deleteBtn")}
                    </button>
                    <button
                      type="button"
                      className="ap-btn"
                      style={{ padding: "3px 9px", fontSize: "var(--fs-xs)" }}
                      onClick={() => setConfirmRemove(false)}
                    >
                      {t("common.cancel")}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="ap-btn"
                    data-variant="danger"
                    style={{ padding: "3px 9px", fontSize: "var(--fs-xs)" }}
                    onClick={() => setConfirmRemove(true)}
                  >
                    <Trash2 size={11} />
                    {t("card.deleteBtn")}
                  </button>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
