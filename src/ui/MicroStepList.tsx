import { useState } from "react";
import { Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
import type { Task } from "../domain/types";
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
          微步骤 {task.subtasks.length > 0 ? `${doneCount}/${task.subtasks.length}` : ""}
        </span>
        <button
          type="button"
          className="ap-btn"
          style={{ padding: "3px 8px", fontSize: 11 }}
          disabled={breakingDown}
          onClick={onBreakdown}
          title="优先调用 AI 做语义拆解；未配置或失败时自动回退到内置动词模板"
        >
          {breakingDown ? <Loader2 size={11} className="ap-spin" /> : <Sparkles size={11} />}
          {breakingDown ? "拆解中…" : task.subtasks.length > 0 ? "重新拆解" : "自动拆解"}
        </button>
      </div>

      <ul className="space-y-1">
        {task.subtasks.map((sub, index) => (
          <li key={sub.id} className="group flex items-start gap-2">
            <span className="ap-mono pt-0.5 text-[10px] text-[var(--text-faint)]">{index + 1}</span>
            <TaskCheck
              checked={sub.done}
              size="sm"
              label={sub.done ? `取消完成 ${sub.title}` : `完成 ${sub.title}`}
              onToggle={() => onToggleSubtask(sub.id)}
            />
            <span
              className="flex-1 text-[12.5px] leading-6"
              style={sub.done ? { color: "var(--text-faint)", textDecoration: "line-through" } : undefined}
            >
              {sub.title}
            </span>
            <button
              type="button"
              aria-label={`删除微步骤 ${sub.title}`}
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
          style={{ padding: "5px 9px", fontSize: 12 }}
          placeholder="加一个 5 分钟能做完的小步…"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addStep();
            }
          }}
        />
        <button type="button" className="ap-icon-btn" aria-label="添加微步骤" onClick={addStep}>
          <Plus size={14} />
        </button>
        {task.subtasks.length > 0 ? (
          <button
            type="button"
            className="ap-icon-btn"
            aria-label="清空微步骤"
            onClick={() => onSetSubtasks([])}
          >
            <Trash2 size={13} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
