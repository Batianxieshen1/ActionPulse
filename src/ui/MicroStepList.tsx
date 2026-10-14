import { useState } from "react";
import { Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
import type { Task } from "../domain/types";
import { useT } from "../i18n";
import { TaskCheck } from "./TaskCheck";

interface Props {
  task: Task;
  onToggleSubtask: (subId: string) => void;
  onSetSubtasks: (titles: string[]) => void;
  onBreakdown: () => void;
  breakingDown: boolean;
}

/** 微步拆解（PRD §4 模块3）：自动给一版草稿，用户再自由增删改。 */
export function MicroStepList({ task, onToggleSubtask, onSetSubtasks, onBreakdown, breakingDown }: Props) {
  const t = useT();
  const [draft, setDraft] = useState("");
  const doneCount = task.subtasks.filter((sub) => sub.done).length;

  const addStep = () => {
    const title = draft.trim();
    if (title.length === 0) return;
    onSetSubtasks([...task.subtasks.map((sub) => sub.title), title]);
    setDraft("");
  };

  return (
    <div className="mt-2 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="ap-label">
          {t("micro.label")} {task.subtasks.length > 0 ? `${doneCount}/${task.subtasks.length}` : ""}
        </span>
        <button
          type="button"
          className="ap-btn"
          style={{ padding: "3px 8px", fontSize: "var(--fs-xs)" }}
          disabled={breakingDown}
          onClick={onBreakdown}
          title={t("settings.aiNote")}
        >
          {breakingDown ? <Loader2 size={11} className="ap-spin" /> : <Sparkles size={11} />}
          {breakingDown ? t("micro.breaking") : task.subtasks.length > 0 ? t("micro.rebreak") : t("focus.autoBreakdown")}
        </button>
      </div>

      <ul className="space-y-1">
        {task.subtasks.map((sub, index) => (
          <li key={sub.id} className="group flex items-start gap-2">
            <span className="ap-mono pt-0.5 ap-t-2xs text-[var(--text-faint)]">{index + 1}</span>
            <TaskCheck
              checked={sub.done}
              size="sm"
              label={sub.done ? t("focus.subUndo", { title: sub.title }) : t("focus.subComplete", { title: sub.title })}
              onToggle={() => onToggleSubtask(sub.id)}
            />
            <span
              className="flex-1 ap-t-sm leading-6"
              style={sub.done ? { color: "var(--text-faint)", textDecoration: "line-through" } : undefined}
            >
              {sub.title}
            </span>
            <button
              type="button"
              aria-label={t("micro.remove", { title: sub.title })}
              className="ap-icon-btn opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
              style={{ width: 20, height: 20 }}
              onClick={() => onSetSubtasks(task.subtasks.filter((entry) => entry.id !== sub.id).map((entry) => entry.title))}
            >
              <X size={11} />
            </button>
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-1.5">
        <input
          className="ap-input"
          style={{ padding: "5px 9px", fontSize: "var(--fs-sm)" }}
          placeholder={t("micro.addPlaceholder")}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addStep();
            }
          }}
        />
        <button type="button" className="ap-icon-btn" aria-label={t("micro.add")} onClick={addStep}>
          <Plus size={14} />
        </button>
        {task.subtasks.length > 0 ? (
          <button
            type="button"
            className="ap-icon-btn"
            aria-label={t("micro.clear")}
            onClick={() => onSetSubtasks([])}
          >
            <Trash2 size={13} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
