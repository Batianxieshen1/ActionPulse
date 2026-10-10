import { useState } from "react";
import { ChevronDown, ChevronRight, GripVertical, Trash2 } from "lucide-react";
import { daysBetween } from "../domain/dates";
import type { Importance, Quadrant, Task } from "../domain/types";
import { MicroStepList } from "./MicroStepList";
import { TaskCheck } from "./TaskCheck";
import { UrgencyBadge } from "./UrgencyBadge";

interface DueInfo {
  text: string;
  tone?: "danger" | "warn" | "today";
}

function dueLabel(due: string | null, today: string): DueInfo | null {
  if (!due) return null;
  const diff = daysBetween(today, due);
  if (diff < 0) return { text: `超期 ${-diff} 天`, tone: "danger" };
  if (diff === 0) return { text: "今天截止", tone: "today" };
  if (diff === 1) return { text: "明天截止", tone: "warn" };
  if (diff <= 3) return { text: `${diff} 天后`, tone: "warn" };
  return { text: `${due.slice(5)} 截止` };
}

function estimateLabel(minutes: number | null): string | null {
  if (minutes === null) return null;
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours} 小时` : `${hours.toFixed(1)} 小时`;
}

const IMPORTANCE_LABEL: Record<Importance, string> = { high: "高", medium: "中", low: "低" };
const QUADRANT_LABEL: Record<Quadrant, string> = {
  q1: "重要且紧急",
  q2: "重要不紧急",
  q3: "紧急不重要",
  q4: "不重要不紧急",
};

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
            aria-label="拖拽调整顺序"
            title="拖拽调整顺序"
          >
            <GripVertical size={14} />
          </span>
        ) : null}

        <div className="pt-0.5">
          <TaskCheck
            checked={task.done}
            label={task.done ? `取消完成：${task.title}` : `完成：${task.title}`}
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
                style={{ padding: "3px 7px", fontSize: 13.5 }}
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
                className="ap-card__title flex-1 cursor-text text-left text-[13.5px] leading-6 font-medium"
                title="点击编辑标题"
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
              aria-label={open ? "收起详情" : "展开详情"}
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
                  微步 {subDone}/{subTotal}
                </span>
              ) : null}
              {manual && task.quadrant ? <span className="ap-chip">{QUADRANT_LABEL[task.quadrant]}</span> : null}
            </div>
          ) : null}

          {open ? (
            <div className="mt-2 space-y-2.5">
              <MicroStepList
                task={task}
                onToggleSubtask={(subId) => onToggleSubtask(task, subId)}
                onSetSubtasks={(titles) => onSetSubtasks(task, titles)}
                onBreakdown={() => onBreakdown(task)}
                breakingDown={breakingDown}
              />

              <div className="grid grid-cols-3 gap-2">
                <label className="space-y-1">
                  <span className="ap-label block">重要度</span>
                  <select
                    className="ap-select w-full"
                    value={task.importance}
                    onChange={(event) => onUpdate(task.id, { importance: event.target.value as Importance })}
                  >
                    <option value="high">高（{IMPORTANCE_LABEL.high}）</option>
                    <option value="medium">中（{IMPORTANCE_LABEL.medium}）</option>
                    <option value="low">低（{IMPORTANCE_LABEL.low}）</option>
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="ap-label block">截止</span>
                  <input
                    type="date"
                    className="ap-input"
                    style={{ padding: "5px 7px", fontSize: 12 }}
                    value={task.due ?? ""}
                    onChange={(event) => onUpdate(task.id, { due: event.target.value || null })}
                  />
                </label>

                <label className="space-y-1">
                  <span className="ap-label block">预估（分钟）</span>
                  <input
                    type="number"
                    min={0}
                    step={5}
                    className="ap-input ap-mono"
                    style={{ padding: "5px 7px", fontSize: 12 }}
                    value={task.estimateMinutes ?? ""}
                    placeholder="未估"
                    onChange={(event) => {
                      const raw = event.target.value;
                      onUpdate(task.id, { estimateMinutes: raw === "" ? null : Math.max(0, Number(raw)) });
                    }}
                  />
                </label>
              </div>

              {manual ? (
                <label className="block space-y-1">
                  <span className="ap-label block">四象限</span>
                  <select
                    className="ap-select w-full"
                    value={task.quadrant ?? ""}
                    onChange={(event) =>
                      onUpdate(task.id, { quadrant: (event.target.value || null) as Quadrant | null })
                    }
                  >
                    <option value="">未归类（收集箱）</option>
                    <option value="q1">{QUADRANT_LABEL.q1}</option>
                    <option value="q2">{QUADRANT_LABEL.q2}</option>
                    <option value="q3">{QUADRANT_LABEL.q3}</option>
                    <option value="q4">{QUADRANT_LABEL.q4}</option>
                  </select>
                </label>
              ) : null}

              <label className="block space-y-1">
                <span className="ap-label block">备注</span>
                <textarea
                  className="ap-input"
                  rows={2}
                  style={{ fontSize: 12, resize: "vertical" }}
                  placeholder="补充一点上下文，或写下卡住的地方…"
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
                        style={{ padding: "3px 9px", fontSize: 11 }}
                        disabled={index === 0}
                        onClick={() => onMove(task.id, index - 1)}
                      >
                        上移
                      </button>
                      <button
                        type="button"
                        className="ap-btn"
                        style={{ padding: "3px 9px", fontSize: 11 }}
                        disabled={index === total - 1}
                        onClick={() => onMove(task.id, index + 1)}
                      >
                        下移
                      </button>
                    </>
                  ) : null}
                </div>

                {confirmRemove ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-[var(--text-dim)]">确定删除？</span>
                    <button
                      type="button"
                      className="ap-btn"
                      style={{ padding: "3px 9px", fontSize: 11, color: "var(--tier-critical)" }}
                      onClick={() => onRemove(task.id)}
                    >
                      删除
                    </button>
                    <button
                      type="button"
                      className="ap-btn"
                      style={{ padding: "3px 9px", fontSize: 11 }}
                      onClick={() => setConfirmRemove(false)}
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="ap-btn"
                    data-variant="danger"
                    style={{ padding: "3px 9px", fontSize: 11 }}
                    onClick={() => setConfirmRemove(true)}
                  >
                    <Trash2 size={11} />
                    删除
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
