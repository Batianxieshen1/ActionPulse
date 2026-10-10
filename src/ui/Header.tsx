import { ChevronsLeft, Dices, Hand, LayoutGrid, List, Pin, PinOff, Settings, Target, Wand2 } from "lucide-react";
import type { PriorityMode } from "../domain/types";
import { PulseLine } from "./PulseLine";

export type ViewMode = "list" | "board";

interface Props {
  beat: number;
  syncStatus: string;
  syncTitle: string;
  onSyncClick: () => void;
  view: ViewMode;
  mode: PriorityMode;
  pinned: boolean;
  canPin: boolean;
  onViewChange: (view: ViewMode) => void;
  onModeChange: (mode: PriorityMode) => void;
  onTogglePin: () => void;
  onHide: () => void;
  onOpenSettings: () => void;
  onEnterFocus: () => void;
  /** 🎲 盲盒决策：从 Top 3 里掷一个直接进聚焦。 */
  onRollDice: () => void;
  canRollDice: boolean;
  hasFocus: boolean;
}

export function Header({
  beat,
  syncStatus,
  syncTitle,
  onSyncClick,
  view,
  mode,
  pinned,
  canPin,
  onViewChange,
  onModeChange,
  onTogglePin,
  onHide,
  onOpenSettings,
  onEnterFocus,
  onRollDice,
  canRollDice,
  hasFocus,
}: Props) {
  const active = (value: boolean) => (value ? "true" : undefined);

  return (
    <header className="shrink-0 border-b border-[var(--line)]">
      <PulseLine beat={beat} height={38} />

      <div className="flex items-center justify-between gap-2 px-4 pt-1 pb-3">
        <div className="min-w-0">
          <h1 className="text-[15px] leading-tight font-semibold tracking-tight">
            ActionPulse
          </h1>
          <p className="ap-label mt-0.5">脉冲行动 · 替你做决定</p>
        </div>

        <div className="flex items-center gap-0.5">
          <button
            type="button"
            className="ap-icon-btn"
            aria-label="同步状态与设置"
            title={syncTitle}
            onClick={onSyncClick}
          >
            <span className="ap-sync-dot" data-status={syncStatus} />
          </button>
          <button
            type="button"
            className="ap-icon-btn"
            aria-label="盲盒决策：替我选一个"
            title="别犹豫，替我选一个（从最紧迫的三件里掷）"
            disabled={!canRollDice}
            onClick={onRollDice}
          >
            <Dices size={16} />
          </button>
          <button
            type="button"
            className="ap-icon-btn"
            data-active={active(true)}
            aria-label="进入聚焦模式"
            title="进入聚焦模式（Alt + F）"
            disabled={!hasFocus}
            onClick={onEnterFocus}
          >
            <Target size={16} />
          </button>
          {canPin ? (
            <button
              type="button"
              className="ap-icon-btn"
              data-active={active(pinned)}
              aria-label={pinned ? "取消常驻，改为抽屉模式" : "锁定常驻左侧"}
              title={pinned ? "取消常驻（改为抽屉）" : "常驻左侧"}
              onClick={onTogglePin}
            >
              {pinned ? <Pin size={15} /> : <PinOff size={15} />}
            </button>
          ) : null}
          <button
            type="button"
            className="ap-icon-btn"
            aria-label="收起面板"
            title="收起面板（Alt + S）"
            onClick={onHide}
          >
            <ChevronsLeft size={16} />
          </button>
          <button
            type="button"
            className="ap-icon-btn"
            aria-label="设置与备份"
            title="设置 / 导入导出"
            onClick={onOpenSettings}
          >
            <Settings size={16} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1.5 px-4 pb-3">
        <div className="flex rounded-[10px] border border-[var(--line)] p-0.5">
          <button
            type="button"
            className="ap-btn"
            data-variant="ghost"
            data-active={active(view === "list")}
            style={{ padding: "4px 9px", fontSize: 11.5 }}
            onClick={() => onViewChange("list")}
          >
            <List size={12} /> 清单
          </button>
          <button
            type="button"
            className="ap-btn"
            data-variant="ghost"
            data-active={active(view === "board")}
            style={{ padding: "4px 9px", fontSize: 11.5 }}
            onClick={() => onViewChange("board")}
          >
            <LayoutGrid size={12} /> 四象限
          </button>
        </div>

        <div className="ml-auto flex rounded-[10px] border border-[var(--line)] p-0.5">
          <button
            type="button"
            className="ap-btn"
            data-variant="ghost"
            data-active={active(mode === "auto")}
            style={{ padding: "4px 9px", fontSize: 11.5 }}
            title="系统按紧迫度算法自动排序"
            onClick={() => onModeChange("auto")}
          >
            <Wand2 size={12} /> 智能
          </button>
          <button
            type="button"
            className="ap-btn"
            data-variant="ghost"
            data-active={active(mode === "manual")}
            style={{ padding: "4px 9px", fontSize: 11.5 }}
            title="自己拖拽排序与四象限归类"
            onClick={() => onModeChange("manual")}
          >
            <Hand size={12} /> 手动
          </button>
        </div>
      </div>
    </header>
  );
}
