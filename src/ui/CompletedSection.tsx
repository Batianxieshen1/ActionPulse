import { useState } from "react";
import { Archive, ChevronDown, ChevronRight, Undo2 } from "lucide-react";
import type { Task } from "../domain/types";
import { useT } from "../i18n";
import { TaskCheck } from "./TaskCheck";

interface Props {
  tasks: Task[];
  onToggle: (task: Task) => void;
  onArchiveAll: () => void;
  reduceMotion: boolean;
}

/** 今日已完成。打勾后任务从主列表移到这里，可一键撤销。 */
export function CompletedSection({ tasks, onToggle, onArchiveAll, reduceMotion }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);

  if (tasks.length === 0) return null;

  return (
    <section className="pt-1">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className="ap-btn"
          data-variant="ghost"
          style={{ padding: "5px 8px", fontSize: "var(--fs-sm)" }}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          {t("completed.row", { n: tasks.length })}
        </button>
        {open ? (
          <button
            type="button"
            className="ap-btn"
            data-variant="ghost"
            style={{ padding: "5px 8px", fontSize: "var(--fs-xs)" }}
            onClick={onArchiveAll}
            title={t("completed.archiveNote")}
          >
            <Archive size={12} /> {t("completed.archive")}
          </button>
        ) : null}
      </div>

      {open ? (
        <ul className="mt-1.5 space-y-1">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-[var(--row-hover)]"
              style={reduceMotion ? undefined : { animation: "ap-reveal 380ms cubic-bezier(0.22,1,0.36,1) backwards" }}
            >
              <TaskCheck
                checked
                size="sm"
                label={t("completed.undoShort", { title: task.title })}
                onToggle={() => onToggle(task)}
              />
              <span className="flex-1 truncate ap-t-sm text-[var(--text-faint)] line-through decoration-[var(--pulse)] decoration-2">
                {task.title}
              </span>
              <button
                type="button"
                className="ap-icon-btn opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                style={{ width: 24, height: 24 }}
                aria-label={t("completed.undoShort", { title: task.title })}
                title={t("completed.undoBare")}
                onClick={() => onToggle(task)}
              >
                <Undo2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
