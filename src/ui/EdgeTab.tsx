import { useT } from "../i18n";

interface Props {
  hidden: boolean;
  pendingCount: number;
  onOpen: () => void;
}

/** 左侧悬浮把手（PRD §2.1）：面板收起后仍能看到还剩几件事。 */
export function EdgeTab({ hidden, pendingCount, onOpen }: Props) {
  const t = useT();
  if (hidden) return null;
  return (
    <button type="button" className="ap-edge" onClick={onOpen} aria-label={t("edge.expand")} title={t("edge.expandTitle")}>
      <span className="ap-edge__dot" />
      <span className="ap-edge__label">ActionPulse</span>
      <span className="ap-edge__count">{pendingCount}</span>
    </button>
  );
}
