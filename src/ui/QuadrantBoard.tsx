import { useState } from "react";
import type { Quadrant, Task } from "../domain/types";
import { useT } from "../i18n";
import { TaskCard } from "./TaskCard";

interface Props {
  buckets: Record<Quadrant | "inbox", Task[]>;
  today: string;
  onToggle: (task: Task, origin?: { x: number; y: number }) => void;
  onToggleSubtask: (task: Task, subId: string) => void;
  onSetSubtasks: (task: Task, titles: string[]) => void;
  onBreakdown: (task: Task) => void;
  breakingDownId: string | null;
  onUpdate: (id: string, patch: Partial<Task>) => void;
  onRemove: (id: string) => void;
  onSetQuadrant: (id: string, quadrant: Quadrant | null) => void;
}

/** 手动模式（PRD §4 模块1）：四象限 + 拖拽归类。 */
export function QuadrantBoard({
  buckets,
  today,
  onToggle,
  onToggleSubtask,
  onSetSubtasks,
  onBreakdown,
  breakingDownId,
  onUpdate,
  onRemove,
  onSetQuadrant,
}: Props) {
  const t = useT();
  // 板头标题/提示词：quad.q1Title~q4Title 与 quad.q1Hint/q3Hint 为本轮补齐的字典键。
  const cells: { id: Quadrant; title: string; hint: string }[] = [
    { id: "q1", title: t("quad.q1Title"), hint: t("quad.q1Hint") },
    { id: "q2", title: t("quad.q2Title"), hint: t("dormant.schedule") },
    { id: "q3", title: t("quad.q3Title"), hint: t("quad.q3Hint") },
    { id: "q4", title: t("quad.q4Title"), hint: t("dormant.consider") },
  ];
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const renderCell = (key: Quadrant | "inbox", title: string, hint: string) => {
    const list = buckets[key];
    return (
      <section
        key={key}
        className="ap-quad__cell"
        data-drop={dropTarget === key ? "true" : undefined}
        onDragOver={(event) => {
          event.preventDefault();
          setDropTarget(key);
        }}
        onDragLeave={() => setDropTarget((current) => (current === key ? null : current))}
        onDrop={(event) => {
          event.preventDefault();
          const id = draggingId ?? event.dataTransfer.getData("text/plain");
          if (id) onSetQuadrant(id, key === "inbox" ? null : key);
          setDraggingId(null);
          setDropTarget(null);
        }}
      >
        <header className="ap-quad__head">
          <span className="font-medium text-[var(--text-dim)]">{title}</span>
          <span className="ap-mono text-[var(--text-faint)]">{list.length}</span>
        </header>
        <p className="mb-1.5 ap-t-2xs text-[var(--text-faint)]">{hint}</p>
        <div className="space-y-1.5">
          {list.map((task, index) => (
            <div key={task.id} draggable onDragStart={() => setDraggingId(task.id)} onDragEnd={() => setDraggingId(null)}>
              <TaskCard
                task={task}
                score={null}
                rank={index}
                index={index}
                total={list.length}
                today={today}
                manual
                dragging={draggingId === task.id}
                onToggle={onToggle}
                onToggleSubtask={onToggleSubtask}
                onSetSubtasks={onSetSubtasks}
                onBreakdown={onBreakdown}
                breakingDown={breakingDownId === task.id}
                onUpdate={onUpdate}
                onRemove={onRemove}
                onMove={() => undefined}
                onDragStart={() => setDraggingId(task.id)}
                onDragEnd={() => setDraggingId(null)}
                onDragOverCard={() => undefined}
                onDropCard={() => undefined}
              />
            </div>
          ))}
          {list.length === 0 ? (
            <p className="py-3 text-center ap-t-2xs text-[var(--text-faint)]">{t("quad.dropHere")}</p>
          ) : null}
        </div>
      </section>
    );
  };

  return (
    <div className="space-y-3">
      <div className="ap-quad">
        {cells.map((cell) => renderCell(cell.id, cell.title, cell.hint))}
      </div>
      {renderCell("inbox", t("quad.inbox"), t("quad.unclassified"))}
    </div>
  );
}
