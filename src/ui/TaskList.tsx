import { useCallback, useMemo, useRef, useState } from "react";
import type { Task } from "../domain/types";
import { urgencyScore } from "../domain/urgency";
import { useT } from "../i18n";
import { TaskCard } from "./TaskCard";
import { TaskCheck } from "./TaskCheck";

interface Props {
  tasks: Task[];
  today: string;
  manual: boolean;
  /** 新用户空态演示卡：累计完成不足 3 时为 true。 */
  showDemo: boolean;
  /** 示例卡打勾的正反馈由上层接线（礼花/音效），本组件不碰 feedback。 */
  onDemoToggle: (origin: { x: number; y: number }) => void;
  onToggle: (task: Task, origin?: { x: number; y: number }) => void;
  onToggleSubtask: (task: Task, subId: string) => void;
  onSetSubtasks: (task: Task, titles: string[]) => void;
  onBreakdown: (task: Task) => void;
  breakingDownId: string | null;
  onUpdate: (id: string, patch: Partial<Task>) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, toIndex: number) => void;
}

/** 完成后让卡片多停留 560ms，好把「柔和弹性划除」演完再消失。 */
const LINGER_MS = 560;

export function TaskList({
  tasks,
  today,
  manual,
  showDemo,
  onDemoToggle,
  onToggle,
  onToggleSubtask,
  onSetSubtasks,
  onBreakdown,
  breakingDownId,
  onUpdate,
  onRemove,
  onMove,
}: Props) {
  const t = useT();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [lingering, setLingering] = useState<Task[]>([]);
  const [demoDone, setDemoDone] = useState(false);
  const timers = useRef(new Map<string, number>());

  const handleToggle = useCallback(
    (task: Task, origin?: { x: number; y: number }) => {
      if (!task.done) {
        setLingering((current) => [...current.filter((entry) => entry.id !== task.id), task]);
        const timer = window.setTimeout(() => {
          setLingering((current) => current.filter((entry) => entry.id !== task.id));
          timers.current.delete(task.id);
        }, LINGER_MS);
        timers.current.set(task.id, timer);
      }
      onToggle(task, origin);
    },
    [onToggle],
  );

  const rendered = useMemo(() => {
    const liveIds = new Set(tasks.map((task) => task.id));
    const extra = lingering.filter((task) => !liveIds.has(task.id));
    if (extra.length === 0) return tasks.map((task) => ({ task, leaving: false }));
    const merged = [...tasks.map((task) => ({ task, leaving: false })), ...extra.map((task) => ({ task, leaving: true }))];
    return merged.sort((a, b) => a.task.manualRank - b.task.manualRank);
  }, [tasks, lingering]);

  if (tasks.length === 0 && lingering.length === 0) {
    // 面板空态刻意压成单行弱提示：完整叙事（能量环、语录、指引）在右侧台面，同屏不重复。
    // 新用户多给一张可交互的示例卡——礼花和音效这种东西，演示一次胜过描述十次。
    return (
      <div className="space-y-2.5">
        {showDemo ? (
          <div className="ap-card ap-reveal flex items-center gap-2.5 px-3 py-2.5">
            <TaskCheck
              checked={demoDone}
              label={demoDone ? t("list.demoDoneLabel") : t("list.demoLabel")}
              onToggle={(event) => {
                if (demoDone) return;
                const rect = event.currentTarget.getBoundingClientRect();
                onDemoToggle({
                  x: (rect.left + rect.width / 2) / window.innerWidth,
                  y: (rect.top + rect.height / 2) / window.innerHeight,
                });
                setDemoDone(true);
              }}
            />
            <div className="min-w-0 flex-1">
              <p className="ap-t-base font-medium">{demoDone ? t("list.demoDoneTitle") : t("list.demoTitle")}</p>
              <p className="ap-t-2xs mt-0.5 text-[var(--text-faint)]">
                {demoDone ? t("list.demoDoneSubtitle") : t("list.demoSubtitle")}
              </p>
            </div>
          </div>
        ) : null}
        <p className="px-2 py-1 text-center ap-t-xs leading-5 text-[var(--text-faint)]">
          {t("list.empty")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rendered.map(({ task, leaving }, index) => (
        <div key={task.id} data-striking={leaving ? "true" : undefined} data-drop={dropIndex === index ? "true" : undefined}>
          <TaskCard
            task={task}
            score={manual ? null : urgencyScore(task, today)}
            rank={index}
            index={index}
            total={rendered.length}
            today={today}
            manual={manual}
            dragging={draggingId === task.id}
            onToggle={handleToggle}
            onToggleSubtask={onToggleSubtask}
            onSetSubtasks={onSetSubtasks}
            onBreakdown={onBreakdown}
            breakingDown={breakingDownId === task.id}
            onUpdate={onUpdate}
            onRemove={onRemove}
            onMove={onMove}
            onDragStart={() => setDraggingId(task.id)}
            onDragEnd={() => {
              setDraggingId(null);
              setDropIndex(null);
            }}
            onDragOverCard={() => setDropIndex(index)}
            onDropCard={() => {
              if (draggingId && draggingId !== task.id) onMove(draggingId, index);
              setDraggingId(null);
              setDropIndex(null);
            }}
          />
        </div>
      ))}
    </div>
  );
}
