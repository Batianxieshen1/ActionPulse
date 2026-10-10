import { useState } from "react";
import type { Quadrant, Task } from "../domain/types";
import { TaskCard } from "./TaskCard";

const CELLS: { id: Quadrant; title: string; hint: string }[] = [
  { id: "q1", title: "重要 且 紧急", hint: "立刻做" },
  { id: "q2", title: "重要 不紧急", hint: "排进日程" },
  { id: "q3", title: "紧急 不重要", hint: "尽快清掉" },
  { id: "q4", title: "不重要 不紧急", hint: "考虑删掉" },
];

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
        <p className="mb-1.5 text-[10px] text-[var(--text-faint)]">{hint}</p>
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
            <p className="py-3 text-center text-[10.5px] text-[var(--text-faint)]">拖到这里</p>
          ) : null}
        </div>
      </section>
    );
  };

  return (
    <div className="space-y-3">
      <div className="ap-quad">
        {CELLS.map((cell) => renderCell(cell.id, cell.title, cell.hint))}
      </div>
      {renderCell("inbox", "收集箱", "还没归类")}
    </div>
  );
}
