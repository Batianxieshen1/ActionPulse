import { useState } from "react";
import { ChevronDown, ChevronRight, Snowflake, Trash2 } from "lucide-react";
import { dormantDays } from "../domain/hibernation";
import type { Task } from "../domain/types";

interface Props {
  tasks: Task[];
  now: number;
  onWake: (id: string) => void;
  onSetDue: (id: string, due: string | null) => void;
  onRemove: (id: string) => void;
}

/** 一次最多铺开几条，避免休眠区本身变成新的视觉负担。 */
const INITIAL_VISIBLE = 5;

/**
 * 🧊 冷却休眠区（PRD-v2.1 模块五）。
 *
 * 目的不是"整理"，而是让清单不再因为堆了陈年旧事而变成心理负担。
 * 休眠是**派生**的（超过 14 天没碰过且无截止日期），所以这里只负责展示与出口。
 *
 * 唤醒只是"摸一下" —— 如果用户不处理，14 天后它会再次休眠。
 * 真正能把它从僵尸状态里救出来的只有两件事：**给它定个日子，或者删掉它**。所以三个出口都摆在台面上。
 */
export function DormantSection({ tasks, now, onWake, onSetDue, onRemove }: Props) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  if (tasks.length === 0) return null;

  const visible = showAll ? tasks : tasks.slice(0, INITIAL_VISIBLE);

  return (
    <section className="pt-1">
      <button
        type="button"
        className="ap-btn"
        data-variant="ghost"
        style={{ padding: "5px 8px", fontSize: "var(--fs-sm)" }}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <Snowflake size={12} />
        冷却休眠
        <span className="ap-mono text-[var(--text-faint)]">{tasks.length}</span>
      </button>

      {open ? (
        <div className="mt-1.5 space-y-1.5">
          <p className="px-2 ap-t-2xs leading-5 text-[var(--text-faint)]">
            这些任务超过 14 天没动过、也没有截止日期，先移出主排序，免得看着心累。
            <br />
            唤醒只是把它放回去；想真正留下它，给它定个日子，或者干脆删掉。
          </p>

          {visible.map((task) => (
            <div key={task.id} className="ap-card flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-1 truncate ap-t-sm text-[var(--text-dim)]" title={task.title}>
                {task.title}
              </span>
              <span className="ap-chip" title="距上次改动">
                搁置 {dormantDays(task, now)} 天
              </span>

              <input
                type="date"
                className="ap-input ap-mono"
                style={{ width: 124, padding: "2px 6px", fontSize: "var(--fs-xs)" }}
                value={task.due ?? ""}
                aria-label={`给「${task.title}」定个截止日`}
                title="定个日子，它就不再是僵尸任务"
                onChange={(event) => onSetDue(task.id, event.target.value || null)}
              />

              <button
                type="button"
                className="ap-btn"
                style={{ padding: "2px 8px", fontSize: "var(--fs-xs)" }}
                onClick={() => onWake(task.id)}
              >
                唤醒
              </button>

              {confirmId === task.id ? (
                <>
                  <button
                    type="button"
                    className="ap-btn"
                    style={{ padding: "2px 8px", fontSize: "var(--fs-xs)", color: "var(--tier-critical)" }}
                    onClick={() => {
                      onRemove(task.id);
                      setConfirmId(null);
                    }}
                  >
                    确认删除
                  </button>
                  <button
                    type="button"
                    className="ap-btn"
                    style={{ padding: "2px 8px", fontSize: "var(--fs-xs)" }}
                    onClick={() => setConfirmId(null)}
                  >
                    取消
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="ap-icon-btn"
                  style={{ width: 26, height: 26 }}
                  aria-label={`删除 ${task.title}`}
                  onClick={() => setConfirmId(task.id)}
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}

          {!showAll && tasks.length > INITIAL_VISIBLE ? (
            <button
              type="button"
              className="ap-btn ap-btn--sm"
              data-variant="ghost"
              onClick={() => setShowAll(true)}
            >
              还有 {tasks.length - INITIAL_VISIBLE} 个…
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
