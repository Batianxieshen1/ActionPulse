import { ChevronsLeft, Dices, Hand, LayoutGrid, List, Pin, PinOff, Settings, Target, Wand2 } from "lucide-react";
import type { PriorityMode } from "../domain/types";
import { useT } from "../i18n";
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
  const t = useT();
  const active = (value: boolean) => (value ? "true" : undefined);

  return (
    <header className="shrink-0 border-b border-[var(--line)]">
      <PulseLine beat={beat} height={38} />

      <div className="flex items-center justify-between gap-2 px-4 pt-1 pb-3">
        <div className="min-w-0">
          <h1 className="ap-t-md leading-tight font-semibold tracking-tight">
            ActionPulse
          </h1>
          <p className="ap-label mt-0.5">{t("header.subtitle")}</p>
        </div>

        <div className="flex items-center gap-0.5">
          <button
            type="button"
            className="ap-icon-btn"
            aria-label={t("header.sync")}
            title={syncTitle}
            onClick={onSyncClick}
          >
            <span className="ap-sync-dot" data-status={syncStatus} />
          </button>
          <button
            type="button"
            className="ap-icon-btn"
            aria-label={t("header.dice")}
            title={t("header.diceTitle")}
            disabled={!canRollDice}
            onClick={onRollDice}
          >
            <Dices size={16} />
          </button>
          <button
            type="button"
            className="ap-icon-btn"
            data-active={active(true)}
            aria-label={t("header.focus")}
            title={t("header.focusTitle")}
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
              aria-label={pinned ? t("header.unpin") : t("header.pin")}
              title={pinned ? t("header.unpinTitle") : t("header.pinTitle")}
              onClick={onTogglePin}
            >
              {pinned ? <Pin size={15} /> : <PinOff size={15} />}
            </button>
          ) : null}
          <button
            type="button"
            className="ap-icon-btn"
            aria-label={t("header.hide")}
            title={t("header.hideTitle")}
            onClick={onHide}
          >
            <ChevronsLeft size={16} />
          </button>
          <button
            type="button"
            className="ap-icon-btn"
            aria-label={t("header.settings")}
            title={t("header.settingsTitle")}
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
            className="ap-btn ap-btn--sm"
            data-variant="ghost"
            data-active={active(view === "list")}
            onClick={() => onViewChange("list")}
          >
            <List size={12} /> {t("header.list")}
          </button>
          <button
            type="button"
            className="ap-btn ap-btn--sm"
            data-variant="ghost"
            data-active={active(view === "board")}
            onClick={() => onViewChange("board")}
          >
            <LayoutGrid size={12} /> {t("header.board")}
          </button>
        </div>

        {/* 视图（看什么）与排序引擎（怎么排）是两个维度，细线示意分界 */}
        <span className="ap-topbar-divider ml-auto" aria-hidden="true" />

        <div className="flex rounded-[10px] border border-[var(--line)] p-0.5">
          <button
            type="button"
            className="ap-btn ap-btn--sm"
            data-variant="ghost"
            data-active={active(mode === "auto")}
            title={t("header.autoTitle")}
            onClick={() => onModeChange("auto")}
          >
            <Wand2 size={12} /> {t("header.auto")}
          </button>
          <button
            type="button"
            className="ap-btn ap-btn--sm"
            data-variant="ghost"
            data-active={active(mode === "manual")}
            title={t("header.manualTitle")}
            onClick={() => onModeChange("manual")}
          >
            <Hand size={12} /> {t("header.manual")}
          </button>
        </div>
      </div>
    </header>
  );
}
